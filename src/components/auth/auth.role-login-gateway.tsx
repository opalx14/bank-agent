"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Loader2, Mail, ShoppingBag, Sparkles } from "lucide-react";
import { BankAgentLogo } from "@/components/shared/shared.brand-logo";
import type { PortalRole } from "@/types";
import { BankAuditorLoginCard } from "./auth.bank-auditor-card";
import { ExternalWalletConnectButton } from "./auth.external-wallet-button";
import { HowWalletWorksSheet } from "./auth.how-wallet-works-sheet";
import { Nexus3dStage } from "./auth.nexus-3d-stage";
import { useWalletAuth } from "./auth.wallet-provider";

const ROLE_TABS = [
  { role: "CUSTOMER" as const, label: "Personal", icon: ShoppingBag },
  { role: "ENTERPRISE" as const, label: "Enterprise", icon: Building2 },
] as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RoleLoginGateway({ defaultRole = "CUSTOMER" }: { defaultRole?: PortalRole }) {
  const router = useRouter();
  const { roleSession, loading, loginWithRole } = useWalletAuth();
  const [selectedRole, setSelectedRole] = useState<"CUSTOMER" | "ENTERPRISE">(defaultRole === "ENTERPRISE" ? "ENTERPRISE" : "CUSTOMER");
  const [emailInput, setEmailInput] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (defaultRole === "ENTERPRISE" || defaultRole === "CUSTOMER") setSelectedRole(defaultRole);
    setErrorMsg(null);
  }, [defaultRole]);

  if (defaultRole === "BANK") return <BankAuditorLoginCard />;

  const isEnterprise = selectedRole === "ENTERPRISE";
  const sampleEmail = isEnterprise ? "kyb.california-fitness@opalx.vn" : "member.cali@gmail.com";
  const sampleName = isEnterprise ? "California Fitness & Yoga" : "California Member";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const cleanedEmail = emailInput.trim();
    if (!EMAIL_PATTERN.test(cleanedEmail)) {
      setErrorMsg("Please enter a valid email (e.g. name@company.com).");
      emailRef.current?.focus();
      return;
    }
    const isCaliEnt = isEnterprise && cleanedEmail.toLowerCase() === "kyb.california-fitness@opalx.vn";
    const session = await loginWithRole({
      role: selectedRole,
      provider: "EMAIL",
      email: cleanedEmail,
      displayName: cleanedEmail === sampleEmail ? sampleName : undefined,
      ...(isCaliEnt ? { rolePositionId: "california-fitness" } : {}),
    });
    if (!session) {
      setErrorMsg("Unable to connect wallet for this email. Please try again.");
      return;
    }
    router.push(isEnterprise ? "/enterprise" : "/");
  };

  const passEnterpriseName = isEnterprise
    ? emailInput.toLowerCase().includes("california") ? "California Fitness & Yoga" : "Partner Enterprise"
    : "Bank Agent Member";

  return (
    <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-7xl items-center px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid w-full items-center gap-8 lg:grid-cols-[minmax(360px,430px)_1fr] lg:gap-10">
        <section aria-labelledby="opalx-gateway-title" className="mx-auto w-full max-w-[440px] lg:mx-0">
          <BankAgentLogo variant="full" className="h-[64px] w-auto sm:h-[74px]" priority />

          {defaultRole === "ENTERPRISE" && roleSession?.role === "CUSTOMER" ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--ox-line)] bg-[var(--ox-surface)] px-3.5 py-2 text-xs">
              <span className="text-[var(--ox-muted)]">Signed in with Personal account.</span>
              <Link href="/" className="font-semibold text-[var(--ox-ink)] hover:underline">← Back to Personal</Link>
            </div>
          ) : null}

          <h1 id="opalx-gateway-title" className="mt-6 text-[clamp(30px,5vw,42px)] leading-[1.08] font-extrabold tracking-[-0.035em] text-[var(--ox-ink)]">
            {isEnterprise ? (
              <>Enterprise Rails.<span className="block text-[var(--ox-avax)]">Instant Audits.</span></>
            ) : (
              <>Bank Payments.<span className="block text-[var(--ox-ok-ink)]">Instant Proofs.</span></>
            )}
          </h1>
          <p className="mt-2.5 text-sm leading-relaxed text-[var(--ox-muted)]">
            {isEnterprise
              ? "Issue service passes, receive direct bank transfers, and mint Fuji guarantee proofs."
              : "Pick a role and enter your email for a zero-popup embedded wallet and guarantee passes."}
          </p>

          <div className="mt-6 inline-flex w-full rounded-2xl border border-[var(--ox-line)] bg-[var(--ox-soft)] p-1" role="radiogroup" aria-label="Select role">
            {ROLE_TABS.map(({ role, label, icon: Icon }) => {
              const active = selectedRole === role;
              return (
                <button
                  key={role}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => { setSelectedRole(role); setErrorMsg(null); }}
                  className={`ox-press flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold transition-all sm:text-sm ${
                    active ? "bg-[var(--ox-surface)] text-[var(--ox-ink)] shadow-sm" : "text-[var(--ox-muted)] hover:text-[var(--ox-ink)]"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-4">
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label htmlFor="gateway-email-input" className="text-xs font-semibold text-[var(--ox-ink)]">Your wallet email</label>
                <button
                  type="button"
                  onClick={() => { setErrorMsg(null); setEmailInput(sampleEmail); emailRef.current?.focus(); }}
                  className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-[var(--ox-muted)] transition-colors hover:text-[var(--ox-ink)]"
                >
                  <Sparkles className="h-3 w-3 text-[var(--ox-avax)]" />
                  <span>Use sample</span>
                </button>
              </div>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-[var(--ox-muted)]" />
                <input
                  ref={emailRef}
                  id="gateway-email-input"
                  type="email"
                  autoComplete="email"
                  value={emailInput}
                  onChange={(e) => { setEmailInput(e.target.value); if (errorMsg) setErrorMsg(null); }}
                  placeholder={isEnterprise ? "founder@company.com" : "member@gmail.com"}
                  className="ox-input h-[52px] w-full rounded-2xl pr-4 pl-11 text-sm placeholder:text-[var(--ox-muted)]"
                />
              </div>
            </div>

            {errorMsg ? <p role="alert" className="ox-badge-avax rounded-2xl px-4 py-2.5 text-xs font-medium">{errorMsg}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className={`ox-start-btn w-full text-sm disabled:opacity-60 sm:text-[15px] ${
                isEnterprise
                  ? "bg-[var(--ox-avax)] text-white shadow-[0_12px_28px_-10px_rgba(232,65,66,0.55)]"
                  : "bg-[var(--ox-ink)] text-[var(--ox-bg)] shadow-[0_12px_28px_-12px_rgba(11,15,25,0.4)]"
              }`}
            >
              <span>{isEnterprise ? "Enter Enterprise Space" : "Enter Personal Space"}</span>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isEnterprise ? "bg-white/20 text-white" : "bg-[var(--ox-avax)] text-white"}`}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              </span>
            </button>
          </form>

          <div className="mt-4">
            <ExternalWalletConnectButton
              role={selectedRole}
              onSuccess={() => router.push(isEnterprise ? "/enterprise" : "/")}
              onError={(msg) => setErrorMsg(msg)}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-[var(--ox-muted)]">
            {!isEnterprise ? (
              <Link href="/?guest=1" className="font-semibold text-[var(--ox-ink)] hover:underline">
                Quick checkout without wallet →
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => { setErrorMsg(null); setEmailInput("founder@mybusiness.com"); emailRef.current?.focus(); }}
                className="font-semibold text-[var(--ox-ink)] hover:underline"
              >
                New enterprise profile →
              </button>
            )}
            <div className="flex items-center gap-3">
              <HowWalletWorksSheet triggerVariant="link" roleHint={isEnterprise ? "enterprise" : "customer"} />
              <span aria-hidden="true">·</span>
              <Link href="/bank" className="hover:text-[var(--ox-ink)] hover:underline">Bank Portal</Link>
              <span aria-hidden="true">·</span>
              <Link href="/roadmap" className="hover:text-[var(--ox-ink)] hover:underline">Architecture</Link>
            </div>
          </div>
        </section>

        <div className="flex w-full flex-col items-center">
          <Nexus3dStage
            activeRole={selectedRole}
            onSelectRole={(role) => {
              if (role === "BANK") { router.push("/bank"); return; }
              setSelectedRole(role);
              setErrorMsg(null);
            }}
            enterpriseName={passEnterpriseName}
            holderLabel={emailInput.trim() || undefined}
          />
        </div>
      </div>
    </div>
  );
}