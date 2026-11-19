"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mail, Wallet, X } from "lucide-react";
import { ExternalWalletConnectButton } from "@/components/auth/ExternalWalletConnectButton";
import { useWalletAuth } from "@/components/auth/WalletAuthProvider";
import { truncateHex } from "@/components/shared/formatters";
import { RadialRing } from "@/components/shared/ui-kit";
import type { AgentWalletStatus } from "@/lib/avalanche/agent-wallet";
import { WalletSessionPanel } from "./WalletSessionPanel";

type WalletApiPayload = AgentWalletStatus & { walletAvaxBalance?: string };

export function AgentWalletPopover({ fullWidth = false }: { fullWidth?: boolean }) {
  const { session, roleSession, loading, loginWithRole } = useWalletAuth();
  const [open, setOpen] = useState(false);
  const [wallet, setWallet] = useState<WalletApiPayload | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet/agent-session", { cache: "no-store" });
      if (res.ok) setWallet((await res.json()) as WalletApiPayload);
    } catch {
      // Keep UI responsive offline.
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!open) return;
    const isPortalSheetOpen = () => Boolean(document.querySelector('[data-ox-portal-sheet="true"]'));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPortalSheetOpen()) setOpen(false);
    };
    const onPointer = (e: MouseEvent) => {
      if (isPortalSheetOpen()) return;
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  const parsedBalance = wallet?.walletAvaxBalance !== undefined ? Number(wallet.walletAvaxBalance) : NaN;
  const balanceFraction = Number.isFinite(parsedBalance) ? Math.max(0, Math.min(1, parsedBalance / 0.05)) : 0.8;

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const cleaned = emailInput.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }
    const created = await loginWithRole({ role: "CUSTOMER", provider: "EMAIL", email: cleaned });
    if (!created) {
      setErrorMsg("Unable to create a wallet for this email.");
      return;
    }
    setEmailInput("");
    setOpen(false);
  };

  const handleQuickDemo = async () => {
    setErrorMsg(null);
    const created = await loginWithRole({
      role: "CUSTOMER",
      provider: "GOOGLE",
      email: "member.cali@gmail.com",
      displayName: "California Member",
    });
    if (created) setOpen(false);
  };

  return (
    <div ref={containerRef} className={fullWidth ? "relative w-full" : "relative"}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Embedded Wallet and Smart Contract"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void loadStatus();
        }}
        className={`ox-press inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
          fullWidth ? "w-full px-3.5 py-1.5" : "shrink-0 px-2.5 py-1 sm:px-3"
        } ${session ? "ox-btn-ghost" : "ox-btn-avax"}`}
      >
        {session ? (
          <>
            <RadialRing
              value={balanceFraction}
              size={22}
              danger={Number.isFinite(parsedBalance) && parsedBalance <= 0.005}
              label="AVAX Fuji fuel level"
            />
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--ox-ok)] opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--ox-ok)]" />
            </span>
            <span className="font-mono text-[var(--ox-ink)]">{truncateHex(session.walletAddress, 4)}</span>
          </>
        ) : (
          <>
            <Wallet className="h-3.5 w-3.5 shrink-0" />
            <span>Connect Wallet</span>
          </>
        )}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Embedded Wallet and Smart Contract"
          className="ox-card fixed inset-x-3 top-16 z-50 rounded-2xl p-4 text-xs shadow-2xl sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-84"
        >
          <div className="flex items-center justify-between border-b border-[var(--ox-line)] pb-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[var(--ox-avax)]" />
              <span className="text-sm font-semibold text-[var(--ox-ink)]">
                {session?.provider === "EXTERNAL_WALLET"
                  ? "External Wallet & Smart Contract"
                  : "Wallet & Smart Contract"}
              </span>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-[var(--ox-muted)] transition-colors hover:bg-[var(--ox-soft)] hover:text-[var(--ox-ink)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {session ? (
            <WalletSessionPanel
              session={session}
              roleSession={roleSession}
              walletAvaxBalance={wallet?.walletAvaxBalance}
              loading={loading}
              onClose={() => setOpen(false)}
            />
          ) : (
            <div className="mt-3 space-y-3">
              <p className="leading-relaxed text-[var(--ox-muted)]">
                Enter your email to auto-provision an Embedded Wallet &amp; Smart Contract on Avalanche Fuji.
              </p>
              <form onSubmit={(e) => void handleEmailLogin(e)} className="space-y-2">
                <label htmlFor="popover-email-input" className="block font-medium text-[var(--ox-ink)]">
                  Your email
                </label>
                <div className="flex gap-1.5">
                  <input
                    id="popover-email-input"
                    type="email"
                    autoComplete="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="name@company.com"
                    className="ox-input min-h-[40px] min-w-0 flex-1 rounded-xl px-3 py-1.5 text-xs placeholder:text-[var(--ox-muted)]"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="ox-btn-primary inline-flex min-h-[40px] shrink-0 items-center gap-1 rounded-xl px-3 py-1.5 font-semibold disabled:opacity-60"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    <span>Create Wallet</span>
                  </button>
                </div>
                {errorMsg ? <p className="ox-badge-avax rounded-lg px-2.5 py-1.5 font-medium">{errorMsg}</p> : null}
              </form>
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleQuickDemo()}
                className="ox-btn-ghost inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl px-3 py-2 font-semibold disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                <span>Use sample account</span>
              </button>
              <ExternalWalletConnectButton
                role="CUSTOMER"
                compact
                onSuccess={() => setOpen(false)}
                onError={(msg) => setErrorMsg(msg)}
              />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
