"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, ShieldCheck, Wallet } from "lucide-react";
import {
  discoverInjectedWallets,
  type DiscoveredWallet,
} from "@/lib/avalanche/browser-wallet";
import type { PortalRole, UserWalletSession } from "@/types";
import { useWalletAuth } from "./WalletAuthProvider";

interface ExternalWalletConnectButtonProps {
  role: PortalRole;
  rolePositionId?: string;
  onSuccess?: (session: UserWalletSession) => void;
  onError?: (message: string) => void;
  compact?: boolean;
}

export function ExternalWalletConnectButton({
  role,
  rolePositionId,
  onSuccess,
  onError,
  compact = false,
}: ExternalWalletConnectButtonProps) {
  const { loading, loginWithExternalWallet } = useWalletAuth();
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [noWalletNotice, setNoWalletNotice] = useState(false);

  useEffect(() => {
    let mounted = true;
    void discoverInjectedWallets().then((list) => {
      if (mounted) setWallets(list);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const connectSpecific = async (wallet?: DiscoveredWallet) => {
    setNoWalletNotice(false);
    setConnectingId(wallet?.id ?? "auto");
    try {
      const result = await loginWithExternalWallet({
        role,
        rolePositionId,
        ...(wallet ? { provider: wallet.provider, connectorName: wallet.name } : {}),
      });
      if (result.error === "NO_WALLET_DETECTED") {
        setNoWalletNotice(true);
        return;
      }
      if (!result.session) {
        onError?.(result.error || "Unable to verify external wallet signature.");
        return;
      }
      setShowPicker(false);
      onSuccess?.(result.session);
    } finally {
      setConnectingId(null);
    }
  };

  const handlePrimaryClick = async () => {
    setNoWalletNotice(false);
    const latest = wallets.length > 0 ? wallets : await discoverInjectedWallets();
    if (latest.length > 0 && wallets.length === 0) setWallets(latest);

    if (latest.length === 0) {
      setNoWalletNotice(true);
      return;
    }
    if (latest.length === 1) {
      await connectSpecific(latest[0]);
      return;
    }
    setShowPicker((prev) => !prev);
  };

  const isBusy = loading || connectingId !== null;
  const label =
    wallets.length === 1
      ? `Connect ${wallets[0].name}`
      : wallets.length > 1
        ? `Connect External Wallet (${wallets.length} detected)`
        : "Connect External Wallet (MetaMask / Core)";

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-3 text-[11px] font-medium text-[var(--ox-muted)]">
        <span className="h-px flex-1 bg-[var(--ox-line)]" />
        <span>or use self-custody wallet</span>
        <span className="h-px flex-1 bg-[var(--ox-line)]" />
      </div>

      <button
        type="button"
        disabled={isBusy}
        onClick={() => void handlePrimaryClick()}
        className={`ox-btn-ghost ox-press inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--ox-line)] bg-[var(--ox-surface)] px-4 font-semibold text-[var(--ox-ink)] transition-all hover:border-[var(--ox-ink)]/35 disabled:opacity-60 ${
          compact ? "min-h-[44px] text-xs" : "min-h-[50px] text-sm"
        }`}
      >
        {isBusy ? (
          <Loader2 className="h-4 w-4 animate-spin text-[var(--ox-avax)]" />
        ) : (
          <Wallet className="h-4 w-4 text-[var(--ox-avax)]" />
        )}
        <span>{label}</span>
      </button>

      {showPicker && wallets.length > 1 ? (
        <div className="ox-subcard space-y-1.5 rounded-2xl p-2.5">
          <p className="px-1 text-[11px] font-semibold text-[var(--ox-muted)]">
            Choose your browser EVM wallet (0 gas signature):
          </p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {wallets.map((w) => (
              <button
                key={w.id}
                type="button"
                disabled={isBusy}
                onClick={() => void connectSpecific(w)}
                className="ox-btn-ghost ox-press flex min-h-[40px] items-center justify-between gap-2 rounded-xl border border-[var(--ox-line)] bg-[var(--ox-surface)] px-3 py-1.5 text-left text-xs font-semibold text-[var(--ox-ink)]"
              >
                <span className="flex items-center gap-2 truncate">
                  {w.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.icon} alt="" className="h-4 w-4 rounded-sm object-contain" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 text-[var(--ox-ok)]" />
                  )}
                  <span className="truncate">{w.name}</span>
                </span>
                {connectingId === w.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {noWalletNotice ? (
        <div
          role="status"
          className="ox-subcard space-y-2 rounded-2xl border border-[var(--ox-line)] px-3.5 py-3 text-xs text-[var(--ox-muted)]"
        >
          <p className="font-semibold text-[var(--ox-ink)]">No browser Web3 wallet detected</p>
          <p className="leading-relaxed">
            Install an Avalanche-compatible wallet extension to sign in directly, or sign in with your
            email above and export your decentralized private key anytime.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <a
              href="https://core.app/en/tools/extension/"
              target="_blank"
              rel="noreferrer"
              className="ox-btn-ghost inline-flex items-center gap-1 rounded-lg border border-[var(--ox-line)] px-2.5 py-1 font-mono text-[11px] font-semibold text-[var(--ox-ink)] hover:underline"
            >
              <span>Core Wallet (Avalanche)</span>
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href="https://metamask.io/download/"
              target="_blank"
              rel="noreferrer"
              className="ox-btn-ghost inline-flex items-center gap-1 rounded-lg border border-[var(--ox-line)] px-2.5 py-1 font-mono text-[11px] font-semibold text-[var(--ox-ink)] hover:underline"
            >
              <span>MetaMask</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
