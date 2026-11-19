"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Building2, Check, CheckCircle2, Copy, ExternalLink, ImagePlus, Loader2, Save, ShieldCheck, X } from "lucide-react";
import type { VerifiedEnterpriseProfile } from "@/types";
import { truncateHex } from "@/components/shared/formatters";
import { compressImageFileToDataUrl } from "@/components/shared/image-utils";

interface EnterpriseProfileCardProps {
  enterprise: VerifiedEnterpriseProfile;
  onUpdated: () => Promise<void> | void;
}

export function EnterpriseProfileCard({ enterprise, onUpdated }: EnterpriseProfileCardProps) {
  const [enterpriseName, setEnterpriseName] = useState(enterprise.enterpriseName);
  const [categoryLabel, setCategoryLabel] = useState(enterprise.categoryLabel);
  const [description, setDescription] = useState(enterprise.description ?? "");
  const [logoImageUrl, setLogoImageUrl] = useState(enterprise.logoImageUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    setEnterpriseName(enterprise.enterpriseName);
    setCategoryLabel(enterprise.categoryLabel);
    setDescription(enterprise.description ?? "");
    setLogoImageUrl(enterprise.logoImageUrl ?? "");
    setErrorMsg(null);
    setStatusMsg(null);
  }, [enterprise]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    if (enterpriseName.trim().length < 2) {
      setErrorMsg("Enterprise name must be at least 2 characters.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/enterprises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_PROFILE",
          enterpriseId: enterprise.id,
          enterpriseName: enterpriseName.trim(),
          categoryLabel: categoryLabel.trim(),
          description: description.trim(),
          logoImageUrl: logoImageUrl.trim(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Update failed (${res.status})`);
      setStatusMsg("Enterprise profile & brand details saved.");
      await onUpdated();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unable to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleCopyContract = () => {
    void navigator.clipboard?.writeText(enterprise.merchantContractAddress).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <section className="ox-card rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--ox-line)] pb-4">
        <div>
          <h2 className="text-base font-bold text-[var(--ox-ink)]">Enterprise Profile &amp; Brand</h2>
          <p className="mt-1 text-xs text-[var(--ox-muted)]">
            Update name, description, checkout logo, and verification details.
          </p>
        </div>
        <span className="ox-badge-verified inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>KYB Verified</span>
        </span>
      </div>

      <form onSubmit={(e) => void handleSave(e)} className="mt-5 space-y-4 text-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="ox-subcard flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl">
            {logoImageUrl ? (
              <img src={logoImageUrl} alt={enterpriseName} className="h-full w-full object-cover" />
            ) : (
              <Building2 className="h-7 w-7 text-[var(--ox-muted)]" />
            )}
          </div>
          <div className="space-y-1.5">
            <p className="font-semibold text-[var(--ox-ink)]">Enterprise Logo / Avatar</p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="ox-btn-ghost inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium">
                <ImagePlus className="h-3.5 w-3.5 text-[var(--ox-ok-ink)]" />
                <span>{logoImageUrl ? "Change Logo" : "Upload Logo"}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void compressImageFileToDataUrl(file, 400)
                      .then((url) => { setLogoImageUrl(url); setErrorMsg(null); })
                      .catch((err) => setErrorMsg(err instanceof Error ? err.message : "Unable to process image."));
                  }}
                />
              </label>
              {logoImageUrl ? (
                <button
                  type="button"
                  onClick={() => setLogoImageUrl("")}
                  className="ox-btn-ghost inline-flex min-h-[34px] items-center gap-1 rounded-xl px-2.5 py-1 text-[var(--ox-muted)] hover:text-[var(--ox-avax-ink)]"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Remove</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="font-medium text-[var(--ox-muted)]">Enterprise Name</span>
            <input value={enterpriseName} onChange={(e) => setEnterpriseName(e.target.value)} className="ox-input min-h-[42px] w-full rounded-xl px-3.5 py-2 text-sm" required />
          </label>
          <label className="block space-y-1.5">
            <span className="font-medium text-[var(--ox-muted)]">Business Category</span>
            <input value={categoryLabel} onChange={(e) => setCategoryLabel(e.target.value)} className="ox-input min-h-[42px] w-full rounded-xl px-3.5 py-2 text-sm" required />
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="font-medium text-[var(--ox-muted)]">Short Description (optional)</span>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe services, branch locations, or customer guarantee commitments..."
            maxLength={400}
            className="ox-input w-full rounded-xl px-3.5 py-2.5 text-sm placeholder:text-[var(--ox-muted)]"
          />
        </label>

        {errorMsg ? (
          <div role="alert" className="ox-badge-avax flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" /><span>{errorMsg}</span>
          </div>
        ) : null}
        {statusMsg ? (
          <div role="status" className="ox-badge-verified flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0" /><span>{statusMsg}</span>
          </div>
        ) : null}

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="ox-btn-primary inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold disabled:opacity-60">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>Save Profile</span>
          </button>
        </div>
      </form>

      <div className="mt-6 grid grid-cols-1 gap-3 border-t border-[var(--ox-line)] pt-4 text-xs sm:grid-cols-2">
        <div className="ox-subcard rounded-xl p-3">
          <p className="text-[11px] text-[var(--ox-muted)]">Tax ID (KYB)</p>
          <p className="mt-1 font-mono font-semibold text-[var(--ox-ink)] tabular-nums">{enterprise.taxId}</p>
        </div>
        <div className="ox-subcard rounded-xl p-3">
          <p className="text-[11px] text-[var(--ox-muted)]">Smart Contract (Avalanche Fuji)</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="truncate font-mono font-semibold text-[var(--ox-ink)]">{truncateHex(enterprise.merchantContractAddress, 6)}</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={handleCopyContract} aria-label="Copy Contract Address" className="rounded-md p-1 text-[var(--ox-muted)] hover:bg-[var(--ox-surface)] hover:text-[var(--ox-ink)]">
                {copied ? <Check className="h-3.5 w-3.5 text-[var(--ox-ok-ink)]" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <a href={`https://testnet.snowtrace.io/address/${enterprise.merchantContractAddress}`} target="_blank" rel="noreferrer" aria-label="Open on Snowtrace" className="rounded-md p-1 text-[var(--ox-muted)] hover:bg-[var(--ox-surface)] hover:text-[var(--ox-ink)]">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
