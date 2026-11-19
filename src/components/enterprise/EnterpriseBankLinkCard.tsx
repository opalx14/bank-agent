"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Landmark, Loader2, Save, ShieldCheck } from "lucide-react";
import type { BankPartnerRail, VerifiedEnterpriseProfile } from "@/types";
import { normalizeAccountHolderName } from "@/core/enterprise/catalog";
import { truncateHex } from "@/components/shared/formatters";
import { CustomQrQuickBox } from "./CustomQrQuickBox";

interface EnterpriseBankLinkCardProps {
  enterprise: VerifiedEnterpriseProfile;
  activeBanks: BankPartnerRail[];
  onUpdated: () => Promise<void> | void;
}

export function EnterpriseBankLinkCard({ enterprise, activeBanks, onUpdated }: EnterpriseBankLinkCardProps) {
  const [linkedBankRailId, setLinkedBankRailId] = useState(enterprise.linkedBankRailId);
  const [accountNo, setAccountNo] = useState(enterprise.accountNo);
  const [accountName, setAccountName] = useState(enterprise.accountName);
  const [useCustomQr, setUseCustomQr] = useState(Boolean(enterprise.useCustomQrImage));
  const [customQrUrl, setCustomQrUrl] = useState(enterprise.customQrImageDataUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    setLinkedBankRailId(enterprise.linkedBankRailId);
    setAccountNo(enterprise.accountNo);
    setAccountName(enterprise.accountName);
    setUseCustomQr(Boolean(enterprise.useCustomQrImage));
    setCustomQrUrl(enterprise.customQrImageDataUrl ?? "");
    setErrorMsg(null);
    setStatusMsg(null);
  }, [
    enterprise.id,
    enterprise.linkedBankRailId,
    enterprise.accountNo,
    enterprise.accountName,
    enterprise.useCustomQrImage,
    enterprise.customQrImageDataUrl,
  ]);

  const isLinkedRailActive = activeBanks.some((b) => b.id === linkedBankRailId);
  const normalizedHolderPreview = useMemo(() => normalizeAccountHolderName(accountName), [accountName]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    if (!/^[a-zA-Z0-9]{5,24}$/.test(accountNo.trim())) {
      return setErrorMsg("Account number must be 5–24 alphanumeric characters without spaces.");
    }
    if (normalizedHolderPreview.length < 2) {
      return setErrorMsg("Please enter a valid account holder name.");
    }
    setSaving(true);
    try {
      const res = await fetch("/api/enterprises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_BANK_LINK",
          enterpriseId: enterprise.id,
          linkedBankRailId,
          accountNo: accountNo.trim(),
          accountName: accountName.trim(),
          useCustomQrImage: useCustomQr,
          customQrImageDataUrl: customQrUrl,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Save failed (${res.status})`);
      setStatusMsg(`Updated VietQR receiving account for ${enterprise.enterpriseName}.`);
      await onUpdated();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unable to update bank account.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="ox-card-glow space-y-3 rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-[var(--ox-muted)]">{enterprise.categoryLabel}</p>
            <h2 className="truncate text-base font-bold text-[var(--ox-ink)]">{enterprise.enterpriseName}</h2>
          </div>
          <span className="ox-badge-verified inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>KYB Verified</span>
          </span>
        </div>

        <div className="ox-subcard grid grid-cols-1 gap-2 rounded-xl p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--ox-muted)]">Tax ID (MST)</span>
            <span className="font-mono font-semibold text-[var(--ox-ink)] tabular-nums">{enterprise.taxId}</span>
          </div>
          {enterprise.ownerEmail && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--ox-muted)]">Owner Email</span>
              <span className="truncate font-medium text-[var(--ox-ink)]">{enterprise.ownerEmail}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--ox-muted)]">Owner Wallet</span>
            <span className="font-mono text-[var(--ox-ink)] tabular-nums">{truncateHex(enterprise.ownerWalletAddress, 6)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--ox-muted)]">Fuji Smart Contract</span>
            <a
              href={`https://testnet.snowtrace.io/address/${enterprise.merchantContractAddress}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono font-semibold text-[var(--ox-info-ink)] hover:underline tabular-nums"
            >
              <span>{truncateHex(enterprise.merchantContractAddress, 6)}</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          {enterprise.kybCommitmentHash && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--ox-muted)]">KYB Hash (0 PII)</span>
              <span title={enterprise.kybCommitmentHash} className="font-mono font-semibold text-[var(--ox-ok-ink)] tabular-nums">
                {truncateHex(enterprise.kybCommitmentHash, 6)}
              </span>
            </div>
          )}
        </div>
      </section>

      <form onSubmit={(e) => void handleSave(e)} className="ox-card space-y-3.5 rounded-2xl p-4 text-xs sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-[var(--ox-info-ink)]" />
            <h3 className="text-sm font-bold text-[var(--ox-ink)]">VietQR Settlement Account</h3>
          </div>
          <span className="ox-badge-info rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold">NAPAS 247</span>
        </div>

        <label className="block space-y-1.5">
          <span className="font-semibold text-[var(--ox-ink)]">Receiving Bank (Auto-reconciled via NAPAS 247)</span>
          <select value={linkedBankRailId} onChange={(e) => setLinkedBankRailId(e.target.value)} className="ox-input min-h-[42px] w-full rounded-xl px-3 py-2" required>
            {!isLinkedRailActive && linkedBankRailId && (
              <option value={linkedBankRailId} disabled>{enterprise.bankShortName} · BIN {enterprise.bankBin} (Paused)</option>
            )}
            {activeBanks.map((b) => (
              <option key={b.id} value={b.id}>{b.shortName} — {b.bankName} (BIN {b.bankBin})</option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="font-semibold text-[var(--ox-ink)]">Account Number</span>
            <input value={accountNo} onChange={(e) => setAccountNo(e.target.value)} placeholder="e.g. 03120006789" className="ox-input min-h-[42px] w-full rounded-xl px-3 py-2 font-mono tabular-nums" required />
          </label>
          <label className="block space-y-1.5">
            <span className="font-semibold text-[var(--ox-ink)]">Account Holder Name</span>
            <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="e.g. CALIFORNIA FITNESS LLC" className="ox-input min-h-[42px] w-full rounded-xl px-3 py-2 uppercase" required />
            {accountName.trim() && normalizedHolderPreview !== accountName.trim().toUpperCase() && (
              <span className="block font-mono text-[10px] text-[var(--ox-info-ink)]">VietQR Normalized: {normalizedHolderPreview}</span>
            )}
          </label>
        </div>

        <CustomQrQuickBox persistToServer={false} enabled={useCustomQr} qrImageDataUrl={customQrUrl} onToggle={setUseCustomQr} onChangeImage={setCustomQrUrl} />

        {errorMsg && (
          <div role="alert" className="ox-badge-avax flex items-center gap-2 rounded-xl px-3 py-2 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" /><span>{errorMsg}</span>
          </div>
        )}
        {statusMsg && (
          <div role="status" className="ox-badge-verified flex items-center gap-2 rounded-xl px-3 py-2 font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0" /><span>{statusMsg}</span>
          </div>
        )}

        <button type="submit" disabled={saving || activeBanks.length === 0} className="ox-btn-primary inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2 disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span>Save VietQR Account</span>
        </button>
      </form>
    </div>
  );
}
