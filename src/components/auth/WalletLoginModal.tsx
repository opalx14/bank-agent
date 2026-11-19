"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, Landmark, Loader2, Mail, Sparkles, User, X } from "lucide-react";
import { PortalSheet } from "@/components/shared/ui-kit";
import type { PortalRole } from "@/types";
import { ExternalWalletConnectButton } from "./ExternalWalletConnectButton";
import { HowWalletWorksSheet } from "./HowWalletWorksSheet";
import { useWalletAuth } from "./WalletAuthProvider";

interface WalletLoginModalProps {
  open: boolean;
  defaultLayout?: PortalRole;
  onClose: () => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLE_OPTIONS: ReadonlyArray<{
  role: PortalRole;
  label: string;
  desc: string;
  route: string;
  icon: typeof User;
}> = [
  { role: "CUSTOMER", label: "Personal", desc: "Pay & Passes", route: "/", icon: User },
  { role: "ENTERPRISE", label: "Enterprise", desc: "Passes & Bank Rail", route: "/enterprise", icon: Building2 },
  { role: "BANK", label: "Bank", desc: "Fuji Audits", route: "/bank", icon: Landmark },
];

export function WalletLoginModal({ open, defaultLayout = "CUSTOMER", onClose }: WalletLoginModalProps) {
  const router = useRouter();
  const { loading, loginWithRole } = useWalletAuth();
  const [role, setRole] = useState<PortalRole>(defaultLayout);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRole(defaultLayout);
    setErrorMsg(null);
  }, [open, defaultLayout]);

  const activeMeta = ROLE_OPTIONS.find((item) => item.role === role) ?? ROLE_OPTIONS[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const cleanedEmail = email.trim();
    if (!EMAIL_PATTERN.test(cleanedEmail)) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }

    const rolePositionId =
      role === "ENTERPRISE" && cleanedEmail.toLowerCase() === "kyb.california-fitness@opalx.vn"
        ? "california-fitness"
        : role === "BANK"
          ? "bank-mb"
          : undefined;

    const session = await loginWithRole({
      role,
      provider: "EMAIL",
      email: cleanedEmail,
      ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      ...(rolePositionId ? { rolePositionId } : {}),
    });
    if (!session) {
      setErrorMsg("Unable to connect wallet for this email. Please try again.");
      return;
    }
    onClose();
    router.push(activeMeta.route);
  };

  const applySample = () => {
    setErrorMsg(null);
    if (role === "ENTERPRISE") {
      setEmail("kyb.california-fitness@opalx.vn");
      setDisplayName("California Fitness & Yoga");
    } else if (role === "BANK") {
      setEmail("officer.bank-mb@opalx.vn");
      setDisplayName("MB Bank Auditor (970422)");
    } else {
      setEmail("member.cali@gmail.com");
      setDisplayName("California Member");
    }
  };

  return (
    <PortalSheet open={open} onClose={onClose} title="Sign In Wallet">
      <button type="button" aria-label="Close" onClick={onClose} className="ox-btn-ghost absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full">
        <X className="h-4 w-4" />
      </button>
      <p className="mb-4 text-xs text-[var(--ox-muted)]">Select a role and connect a zero-popup embedded wallet on Avalanche Fuji.</p>

      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Select sign-in role">
        {ROLE_OPTIONS.map((item) => {
          const Icon = item.icon;
          const active = role === item.role;
          return (
            <button
              key={item.role}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                setRole(item.role);
                setErrorMsg(null);
              }}
              className={`ox-press flex flex-col items-start gap-1.5 rounded-2xl border p-3 text-left transition-all ${
                active ? "border-[var(--ox-ink)] bg-[var(--ox-surface)] shadow-sm ring-1 ring-[var(--ox-ink)]/15" : "ox-subcard hover:border-[var(--ox-ink)]/30"
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${active ? "ox-pill-active" : "bg-[var(--ox-surface)] text-[var(--ox-muted)]"}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                {active ? <Check className="h-3.5 w-3.5 text-[var(--ox-ok)]" /> : null}
              </div>
              <div>
                <p className="text-xs font-bold text-[var(--ox-ink)]">{item.label}</p>
                <p className="text-[10px] leading-tight text-[var(--ox-muted)]">{item.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-3">
        <div>
          <label htmlFor="modal-wallet-email" className="block text-xs font-semibold text-[var(--ox-ink)]">Account email</label>
          <div className="relative mt-1.5">
            <Mail className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[var(--ox-muted)]" />
            <input
              id="modal-wallet-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder={role === "ENTERPRISE" ? "founder@company.com" : role === "BANK" ? "officer.bank-mb@opalx.vn" : "name@gmail.com"}
              className="ox-input min-h-[44px] w-full rounded-xl pr-3.5 pl-10 text-sm placeholder:text-[var(--ox-muted)]"
            />
          </div>
        </div>

        <div>
          <label htmlFor="modal-wallet-name" className="block text-xs font-semibold text-[var(--ox-ink)]">
            Display name <span className="font-normal text-[var(--ox-muted)]">(optional)</span>
          </label>
          <input
            id="modal-wallet-name"
            type="text"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={role === "ENTERPRISE" ? "Enterprise name" : "Display name"}
            className="ox-input mt-1.5 min-h-[42px] w-full rounded-xl px-3.5 text-sm placeholder:text-[var(--ox-muted)]"
          />
        </div>

        <button type="button" onClick={applySample} className="ox-btn-ghost ox-press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold">
          <Sparkles className="h-3.5 w-3.5 text-[var(--ox-avax)]" />
          <span>Use sample account</span>
        </button>

        {errorMsg ? <p role="alert" className="ox-badge-avax rounded-xl px-3.5 py-2 text-xs font-medium">{errorMsg}</p> : null}

        <button type="submit" disabled={loading} className={`${role === "ENTERPRISE" ? "ox-btn-avax" : "ox-btn-primary"} inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm disabled:opacity-60`}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          <span>Sign In · Open {activeMeta.label}</span>
        </button>

        <ExternalWalletConnectButton
          role={role}
          rolePositionId={role === "BANK" ? "bank-mb" : undefined}
          compact
          onSuccess={() => {
            onClose();
            router.push(activeMeta.route);
          }}
          onError={(msg) => setErrorMsg(msg)}
        />

        <div className="flex justify-center pt-0.5">
          <HowWalletWorksSheet triggerVariant="link" roleHint="customer" />
        </div>
      </form>
    </PortalSheet>
  );
}
