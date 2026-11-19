"use client";

import { useRouter } from "next/navigation";
import { Building2, ExternalLink, Landmark, LogOut, ShieldCheck, User } from "lucide-react";
import { ExportWalletModal } from "@/components/auth/ExportWalletModal";
import { HowWalletWorksSheet } from "@/components/auth/HowWalletWorksSheet";
import { useWalletAuth } from "@/components/auth/WalletAuthProvider";
import { truncateHex } from "@/components/shared/formatters";
import type { PortalRole, UserWalletSession } from "@/types";
import { useAccountMode } from "./AccountModeProvider";

interface WalletSessionPanelProps {
  session: UserWalletSession;
  roleSession: UserWalletSession | null;
  walletAvaxBalance?: string;
  loading: boolean;
  onClose: () => void;
}

const ROLE_BADGE: Record<PortalRole, { label: string; cls: string }> = {
  CUSTOMER: { label: "Personal", cls: "ox-subcard text-[var(--ox-ink)]" },
  ENTERPRISE: { label: "Enterprise", cls: "ox-badge-verified" },
  BANK: { label: "Bank", cls: "ox-badge-avax" },
};

const ROLE_SWITCH_OPTIONS: ReadonlyArray<{
  role: PortalRole;
  label: string;
  route: string;
  icon: typeof User;
}> = [
  { role: "CUSTOMER", label: "Personal", route: "/", icon: User },
  { role: "ENTERPRISE", label: "Enterprise", route: "/enterprise", icon: Building2 },
  { role: "BANK", label: "Bank", route: "/bank", icon: Landmark },
];

export function WalletSessionPanel({
  session,
  roleSession,
  walletAvaxBalance,
  loading,
  onClose,
}: WalletSessionPanelProps) {
  const router = useRouter();
  const { switchRole, logout } = useWalletAuth();
  const { activeKind, setActiveKind } = useAccountMode();
  const isLiveBank = activeKind === "LIVE_DIRECT_ACCOUNT";
  const isExternalWallet = session.provider === "EXTERNAL_WALLET";
  const providerBadgeLabel = isExternalWallet
    ? session.walletConnectorName || "Web3 Wallet"
    : session.provider === "GOOGLE"
      ? "Google"
      : "Email";
  const roleBadge = roleSession?.role ? ROLE_BADGE[roleSession.role] : null;
  const parsedBalance = walletAvaxBalance !== undefined ? Number(walletAvaxBalance) : NaN;

  const handleSwitchRole = async (targetRole: PortalRole, route: string) => {
    const emailLower = session.email.toLowerCase();
    const rolePositionId =
      targetRole === "ENTERPRISE" && emailLower === "kyb.california-fitness@opalx.vn"
        ? "california-fitness"
        : targetRole === "BANK"
          ? session.rolePositionId?.startsWith("bank-")
            ? session.rolePositionId
            : "bank-mb"
          : undefined;

    await switchRole(targetRole, rolePositionId);
    onClose();
    router.push(route);
  };

  return (
    <div className="mt-3 space-y-2.5">
      <div className="ox-subcard rounded-xl px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-semibold text-[var(--ox-ink)]">{session.displayName}</p>
          <div className="flex shrink-0 items-center gap-1">
            {roleBadge ? (
              <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${roleBadge.cls}`}>
                {roleBadge.label}
              </span>
            ) : null}
            <span className="rounded-md border border-[var(--ox-line)] bg-[var(--ox-surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--ox-muted)]">
              {providerBadgeLabel}
            </span>
          </div>
        </div>
        <p className="mt-1 truncate text-[var(--ox-muted)]">
          {isExternalWallet ? "Signer" : "Email"}:{" "}
          <span className="font-medium text-[var(--ox-ink)]">
            {isExternalWallet ? truncateHex(session.walletAddress, 6) : session.email}
          </span>
        </p>
      </div>

      <dl className="ox-subcard divide-y divide-[var(--ox-line)] rounded-xl px-3 font-mono">
        <div className="flex items-center justify-between py-2">
          <dt className="font-sans text-[var(--ox-muted)]">
            {isExternalWallet ? "External Wallet" : "Embedded Wallet"}
          </dt>
          <dd>
            <a
              href={`https://testnet.snowtrace.io/address/${session.walletAddress}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-[var(--ox-ink)] hover:underline"
            >
              <span>{truncateHex(session.walletAddress, 6)}</span>
              <ExternalLink className="h-3 w-3 text-[var(--ox-muted)]" />
            </a>
          </dd>
        </div>
        <div className="flex items-center justify-between py-2">
          <dt className="font-sans text-[var(--ox-muted)]">Smart Contract</dt>
          <dd>
            <a
              href={`https://testnet.snowtrace.io/address/${session.merchantContractAddress}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-[var(--ox-ink)] hover:underline"
            >
              <span>{truncateHex(session.merchantContractAddress, 6)}</span>
              <ExternalLink className="h-3 w-3 text-[var(--ox-muted)]" />
            </a>
          </dd>
        </div>
        <div className="flex items-center justify-between py-2">
          <dt className="font-sans text-[var(--ox-muted)]">AVAX Fuji Balance</dt>
          <dd className="font-semibold text-[var(--ox-ok-ink)] tabular-nums">
            {Number.isFinite(parsedBalance) ? `${parsedBalance.toFixed(4)} AVAX` : "Fuji 43113"}
          </dd>
        </div>
      </dl>

      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Switch role workspace">
        {ROLE_SWITCH_OPTIONS.map((item) => {
          const Icon = item.icon;
          const active = roleSession?.role === item.role;
          return (
            <button
              key={item.role}
              type="button"
              disabled={loading}
              aria-pressed={active}
              onClick={() => void handleSwitchRole(item.role, item.route)}
              className={`ox-press inline-flex min-h-[38px] items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-semibold transition-all disabled:opacity-60 ${
                active ? "ox-pill-active" : "ox-btn-ghost text-[var(--ox-muted)] hover:text-[var(--ox-ink)]"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="ox-subcard flex items-center justify-between gap-2 rounded-xl px-3 py-2">
        <span className="text-[11px] font-medium text-[var(--ox-muted)]">Bank Rail Mode</span>
        <button
          type="button"
          aria-pressed={isLiveBank}
          onClick={() => setActiveKind(isLiveBank ? "DEMO_ACCOUNT" : "LIVE_DIRECT_ACCOUNT")}
          className={`ox-press inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold ${
            isLiveBank ? "ox-badge-verified" : "ox-badge-warn"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${isLiveBank ? "bg-[var(--ox-ok)]" : "bg-[var(--ox-warn)]"}`} aria-hidden="true" />
          <span>{isLiveBank ? "[LIVE BANK]" : "[SANDBOX]"}</span>
        </button>
      </div>

      {isExternalWallet ? (
        <div className="ox-subcard flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-medium text-[var(--ox-ok-ink)]">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[var(--ox-ok)]" />
          <span className="truncate">Self-custodial keys managed in {providerBadgeLabel}</span>
        </div>
      ) : (
        <ExportWalletModal walletAddress={session.walletAddress} />
      )}

      <HowWalletWorksSheet triggerVariant="compact" />

      <button
        type="button"
        onClick={async () => {
          await logout();
          window.dispatchEvent(new CustomEvent("opalx:tab", { detail: "CHECKOUT" }));
          onClose();
          router.push("/");
        }}
        className="ox-btn-ghost inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 font-semibold"
      >
        <LogOut className="h-3.5 w-3.5" />
        <span>Sign Out</span>
      </button>
    </div>
  );
}
