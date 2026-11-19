"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Cpu, ExternalLink, Loader2, Mail, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import type { BankPartnerRail, VerifiedEnterpriseProfile } from "@/types";
import { normalizeAccountHolderName } from "@/core/enterprise/catalog";
import { useWalletAuth } from "@/components/auth/WalletAuthProvider";
import { truncateHex } from "@/components/shared/formatters";
import { PortalSheet, SegmentedTabs } from "@/components/shared/ui-kit";
import { EnterpriseKybSteps, KYB_CATEGORY_CHIPS } from "./EnterpriseKybSteps";

interface EnterpriseKybModalProps {
  open?: boolean;
  inline?: boolean;
  activeBanks: BankPartnerRail[];
  onClose?: () => void;
  onCreated: (enterprise: VerifiedEnterpriseProfile) => Promise<void> | void;
}

export function EnterpriseKybModal({ open = false, inline = false, activeBanks, onClose, onCreated }: EnterpriseKybModalProps) {
  const { session, roleSession, loading: authLoading, loginWithGoogle } = useWalletAuth();
  const walletSession = roleSession ?? session;

  const [step, setStep] = useState<"1" | "2" | "3">("1");
  const [enterpriseName, setEnterpriseName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [categoryPreset, setCategoryPreset] = useState<string>(KYB_CATEGORY_CHIPS[0].value);
  const [customCategory, setCustomCategory] = useState("");
  const [logoImageUrl, setLogoImageUrl] = useState("");
  const [linkedBankRailId, setLinkedBankRailId] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [accountName, setAccountName] = useState("");
  const [pkgLabel, setPkgLabel] = useState("");
  const [pkgDuration, setPkgDuration] = useState("");
  const [pkgAmount, setPkgAmount] = useState("");
  const [guaranteeRightLabel, setGuaranteeRightLabel] = useState("");
  const [benefits, setBenefits] = useState<string[]>(["Front-desk QR Check-in", "100% PolicyVault Protection"]);
  const [customBenefit, setCustomBenefit] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!linkedBankRailId && activeBanks[0]?.id) setLinkedBankRailId(activeBanks[0].id);
  }, [activeBanks, linkedBankRailId]);

  const resolvedCategory = useMemo(() => (categoryPreset === "__CUSTOM__" ? customCategory : categoryPreset).trim(), [categoryPreset, customCategory]);
  const normalizedHolder = useMemo(() => normalizeAccountHolderName(accountName), [accountName]);
  const step1Done = enterpriseName.trim().length >= 2 && taxId.trim().length >= 10 && taxId.trim().length <= 14 && resolvedCategory.length >= 2;
  const step2Done = Boolean(linkedBankRailId) && /^[a-zA-Z0-9]{5,24}$/.test(accountNo.trim()) && normalizedHolder.length >= 2;
  const parsedPkgAmount = Number(pkgAmount);
  const step3Ready = pkgLabel.trim().length >= 2 && Number.isFinite(parsedPkgAmount) && parsedPkgAmount >= 2000;

  if (!inline && !open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const hasPkg = pkgLabel.trim().length > 0;
    const checks: Array<[boolean, "1" | "2" | "3", string]> = [
      [enterpriseName.trim().length < 2, "1", "Enterprise name must be at least 2 characters."],
      [taxId.trim().length < 10 || taxId.trim().length > 14, "1", "Tax ID must be 10–14 characters."],
      [resolvedCategory.length < 2, "1", "Please select or enter a business category."],
      [!linkedBankRailId, "2", "Please select a receiving bank."],
      [!/^[a-zA-Z0-9]{5,24}$/.test(accountNo.trim()), "2", "Account number must be 5–24 alphanumeric characters without spaces."],
      [normalizedHolder.length < 2, "2", "Please enter a valid bank account holder name."],
      [hasPkg && (!Number.isFinite(parsedPkgAmount) || parsedPkgAmount < 2000), "3", "Initial package price must be at least 2,000 ₫."],
    ];
    const invalid = checks.find(([bad]) => bad);
    if (invalid) { setStep(invalid[1]); return setErrorMsg(invalid[2]); }

    setSubmitting(true);
    try {
      const res = await fetch("/api/enterprises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REGISTER_ENTERPRISE",
          enterpriseName: enterpriseName.trim(),
          taxId: taxId.trim(),
          categoryLabel: resolvedCategory,
          ...(logoImageUrl ? { logoImageUrl } : {}),
          ...(walletSession?.email ? { ownerEmail: walletSession.email } : {}),
          ...(walletSession?.walletAddress ? { ownerWalletAddress: walletSession.walletAddress } : {}),
          ...(walletSession?.merchantContractAddress ? { merchantContractAddress: walletSession.merchantContractAddress } : {}),
          linkedBankRailId,
          accountNo: accountNo.trim(),
          accountName: accountName.trim(),
          ...(hasPkg ? {
            initialPackage: {
              label: pkgLabel.trim(), durationLabel: pkgDuration.trim() || "Standard", amountVnd: Math.round(parsedPkgAmount),
              ...(benefits.length > 0 ? { benefits } : {}),
              ...(guaranteeRightLabel.trim() ? { guaranteeRightLabel: guaranteeRightLabel.trim() } : {}),
            },
          } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { enterprise?: VerifiedEnterpriseProfile; error?: string };
      if (!res.ok || !json.enterprise) throw new Error(json.error ?? `Smart Contract deployment failed (${res.status})`);
      setEnterpriseName(""); setTaxId(""); setLogoImageUrl(""); setAccountNo(""); setAccountName("");
      setPkgLabel(""); setPkgDuration(""); setPkgAmount(""); setGuaranteeRightLabel(""); setCustomBenefit("");
      await onCreated(json.enterprise);
      if (!inline) onClose?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error deploying enterprise Smart Contract.");
    } finally {
      setSubmitting(false);
    }
  };

  const body = (
    <div className="space-y-4 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="ox-badge-avax inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold">Avalanche Fuji · 43113</span>
        <span className="ox-badge-verified inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold"><ShieldCheck className="h-3 w-3" /><span>0 PII Commitment</span></span>
      </div>
      {walletSession ? (
        <div className="ox-subcard grid grid-cols-1 gap-2 rounded-2xl p-3 sm:grid-cols-3">
          <div className="min-w-0"><p className="flex items-center gap-1 text-[10px] font-semibold text-[var(--ox-muted)]"><Mail className="h-3 w-3 text-[var(--ox-ok-ink)]" /><span>Email</span></p><p className="mt-0.5 truncate font-semibold text-[var(--ox-ink)]">{walletSession.email}</p></div>
          <div className="min-w-0"><p className="flex items-center gap-1 text-[10px] font-semibold text-[var(--ox-muted)]"><Wallet className="h-3 w-3 text-[var(--ox-info-ink)]" /><span>Owner Wallet</span></p><p className="mt-0.5 truncate font-mono font-semibold text-[var(--ox-ink)] tabular-nums">{truncateHex(walletSession.walletAddress, 5)}</p></div>
          <div className="min-w-0">
            <p className="flex items-center justify-between text-[10px] font-semibold text-[var(--ox-avax-ink)]">
              <span className="inline-flex items-center gap-1"><Cpu className="h-3 w-3" /><span>Contract Fuji</span></span>
              <a href={`https://testnet.snowtrace.io/address/${walletSession.merchantContractAddress}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:underline"><span>View</span><ExternalLink className="h-2.5 w-2.5" /></a>
            </p>
            <p className="mt-0.5 truncate font-mono font-bold text-[var(--ox-ink)] tabular-nums">{truncateHex(walletSession.merchantContractAddress, 5)}</p>
          </div>
        </div>
      ) : (
        <div className="ox-subcard flex flex-wrap items-center justify-between gap-2 rounded-2xl p-3">
          <span className="text-[var(--ox-muted)]">Connect Google to bind Owner Wallet &amp; preview Fuji Smart Contract.</span>
          <button type="button" disabled={authLoading} onClick={() => void loginWithGoogle()} className="ox-btn-ghost inline-flex min-h-[34px] items-center gap-1.5 rounded-xl px-3 py-1 font-semibold disabled:opacity-60"><Sparkles className="h-3.5 w-3.5 text-[var(--ox-avax)]" /><span>Connect Google</span></button>
        </div>
      )}
      <SegmentedTabs ariaLabel="Enterprise KYB onboarding steps" value={step} onChange={setStep} items={[
        { key: "1", label: "1. Identity", dot: !step1Done },
        { key: "2", label: "2. Bank Rail", dot: !step2Done },
        { key: "3", label: "3. Package & Rights", badge: step3Ready ? "Ready" : undefined },
      ]} />
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <EnterpriseKybSteps
          step={Number(step) as 1 | 2 | 3} activeBanks={activeBanks}
          enterpriseName={enterpriseName} setEnterpriseName={setEnterpriseName} taxId={taxId} setTaxId={setTaxId}
          categoryPreset={categoryPreset} setCategoryPreset={setCategoryPreset} customCategory={customCategory} setCustomCategory={setCustomCategory}
          logoImageUrl={logoImageUrl} setLogoImageUrl={setLogoImageUrl} linkedBankRailId={linkedBankRailId} setLinkedBankRailId={setLinkedBankRailId}
          accountNo={accountNo} setAccountNo={setAccountNo} accountName={accountName} setAccountName={setAccountName}
          pkgLabel={pkgLabel} setPkgLabel={setPkgLabel} pkgDuration={pkgDuration} setPkgDuration={setPkgDuration}
          pkgAmount={pkgAmount} setPkgAmount={setPkgAmount} guaranteeRightLabel={guaranteeRightLabel} setGuaranteeRightLabel={setGuaranteeRightLabel}
          benefits={benefits} setBenefits={setBenefits} customBenefit={customBenefit} setCustomBenefit={setCustomBenefit}
          onImageError={setErrorMsg}
        />
        {errorMsg && <div role="alert" className="ox-badge-avax flex items-center gap-2 rounded-xl px-3.5 py-2.5 font-medium"><AlertTriangle className="h-4 w-4 shrink-0" /><span>{errorMsg}</span></div>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ox-line)] pt-3">
          <div className="flex items-center gap-2">
            {step !== "1" && <button type="button" onClick={() => setStep(step === "3" ? "2" : "1")} className="ox-btn-ghost inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 py-2 font-semibold"><ArrowLeft className="h-3.5 w-3.5" /><span>Back</span></button>}
            {!inline && <button type="button" onClick={onClose} className="ox-btn-ghost min-h-[40px] rounded-xl px-3.5 py-2 font-semibold">Cancel</button>}
          </div>
          {step !== "3" ? (
            <button type="button" onClick={() => setStep(step === "1" ? "2" : "3")} className="ox-btn-primary inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-4 py-2 font-semibold"><span>Continue to Step {step === "1" ? "2" : "3"}</span><ArrowRight className="h-3.5 w-3.5" /></button>
          ) : (
            <button type="submit" disabled={submitting || activeBanks.length === 0} className="ox-btn-primary inline-flex min-h-[42px] items-center gap-2 rounded-xl px-5 py-2 disabled:opacity-60">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cpu className="h-4 w-4" />}
              <span>{submitting ? "Deploying Smart Contract..." : "Sign Contract & Launch Enterprise"}</span>
            </button>
          )}
        </div>
      </form>
    </div>
  );

  if (inline) {
    return (
      <div className="ox-card-glow mx-auto max-w-3xl rounded-3xl p-5 sm:p-7">
        <h2 className="mb-1 text-lg font-bold text-[var(--ox-ink)] sm:text-xl">Business KYB &amp; Smart Contract Setup</h2>
        <p className="mb-4 text-xs text-[var(--ox-muted)]">Complete 3 steps to deploy a Merchant Vault on Fuji &amp; launch VietQR packages.</p>
        {body}
      </div>
    );
  }
  return <PortalSheet open={open} onClose={onClose ?? (() => undefined)} title="Business KYB & Smart Contract Setup">{body}</PortalSheet>;
}
