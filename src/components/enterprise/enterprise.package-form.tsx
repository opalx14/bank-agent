"use client";

import { useState } from "react";
import { Check, ImagePlus, Loader2, PackagePlus, Plus, ShieldCheck, X } from "lucide-react";
import { compressImageFileToDataUrl } from "@/components/shared/shared.image-utils";

const BENEFIT_SUGGESTIONS = [
  "All-Club QR Check-in",
  "Fuji PolicyVault Escrow",
  "ERC-8004 Membership Tier",
  "100% Auto-Refund Protection",
  "Passkey P-256 Priority Booking",
] as const;

interface EnterprisePackageFormProps {
  enterpriseId: string;
  onSuccess: (msg: string) => Promise<void> | void;
  onError: (msg: string | null) => void;
}

export function EnterprisePackageForm({ enterpriseId, onSuccess, onError }: EnterprisePackageFormProps) {
  const [label, setLabel] = useState("");
  const [durationLabel, setDurationLabel] = useState("");
  const [amountVnd, setAmountVnd] = useState("");
  const [guaranteeRightLabel, setGuaranteeRightLabel] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [benefits, setBenefits] = useState<string[]>([
    "All-Club QR Check-in",
    "Fuji PolicyVault Escrow",
  ]);
  const [customBenefit, setCustomBenefit] = useState("");
  const [adding, setAdding] = useState(false);

  const toggleBenefitChip = (chip: string) => {
    setBenefits((prev) =>
      prev.includes(chip) ? prev.filter((item) => item !== chip) : prev.length >= 6 ? prev : [...prev, chip],
    );
  };

  const handleAddCustomBenefit = () => {
    const cleaned = customBenefit.trim().slice(0, 120);
    if (cleaned.length < 2) return;
    setBenefits((prev) => (prev.includes(cleaned) || prev.length >= 6 ? prev : [...prev, cleaned]));
    setCustomBenefit("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    onError(null);
    const parsedAmount = Number(amountVnd);
    if (label.trim().length < 2) return onError("Package name must be at least 2 characters.");
    if (!durationLabel.trim()) return onError("Please enter a duration or package description.");
    if (!Number.isFinite(parsedAmount) || parsedAmount < 2000) {
      return onError("Minimum package price is 2,000 ₫.");
    }

    setAdding(true);
    try {
      const res = await fetch("/api/enterprises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ADD_PACKAGE",
          enterpriseId,
          label: label.trim(),
          durationLabel: durationLabel.trim(),
          amountVnd: Math.round(parsedAmount),
          ...(imageDataUrl.trim() ? { imageDataUrl: imageDataUrl.trim() } : {}),
          ...(benefits.length > 0 ? { benefits } : {}),
          ...(guaranteeRightLabel.trim() ? { guaranteeRightLabel: guaranteeRightLabel.trim() } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Action failed (${res.status})`);
      const pkgName = label.trim();
      setLabel("");
      setDurationLabel("");
      setAmountVnd("");
      setGuaranteeRightLabel("");
      setImageDataUrl("");
      setCustomBenefit("");
      await onSuccess(`Published "${pkgName}" with guarantee benefits to OpalX GO.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unable to add service package.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="ox-subcard space-y-3 rounded-2xl p-3.5 text-xs sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold text-[var(--ox-ink)]">+ Publish New Service Package</p>
        <span className="font-mono text-[10px] text-[var(--ox-muted)]">Max 6 benefits / package</span>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-[var(--ox-muted)]">Package Name</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. 3-Month Personal Training" className="ox-input min-h-[40px] w-full rounded-xl px-3 py-2" required />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-[var(--ox-muted)]">Duration / Summary</span>
          <input value={durationLabel} onChange={(e) => setDurationLabel(e.target.value)} placeholder="e.g. 3 months · 24 sessions" className="ox-input min-h-[40px] w-full rounded-xl px-3 py-2" required />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-[var(--ox-muted)]">Price (VND)</span>
          <input type="number" min={2000} step={1000} value={amountVnd} onChange={(e) => setAmountVnd(e.target.value)} placeholder="e.g. 2500000" className="ox-input min-h-[40px] w-full rounded-xl px-3 py-2 font-mono tabular-nums" required />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-[var(--ox-muted)]">Guarantee Pass Label (optional)</span>
          <input value={guaranteeRightLabel} onChange={(e) => setGuaranteeRightLabel(e.target.value)} placeholder="e.g. Club Member & Guarantee Pass" maxLength={80} className="ox-input min-h-[38px] w-full rounded-xl px-3 py-1.5" />
        </label>

        <div className="space-y-1">
          <span className="block text-[11px] font-medium text-[var(--ox-muted)]">Package Cover Image (optional)</span>
          <div className="flex items-center gap-2">
            <label className="ox-btn-ghost inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium">
              <ImagePlus className="h-3.5 w-3.5 text-[var(--ox-ok-ink)]" />
              <span>{imageDataUrl ? "Change Image" : "Upload Image"}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void compressImageFileToDataUrl(file)
                    .then((url) => { setImageDataUrl(url); onError(null); })
                    .catch((err) => onError(err instanceof Error ? err.message : "Unable to process image."));
                }}
              />
            </label>
            {imageDataUrl ? (
              <div className="flex items-center gap-2">
                <img src={imageDataUrl} alt="Package image preview" className="h-9 w-9 rounded-lg border border-[var(--ox-line)] object-cover" />
                <button type="button" onClick={() => setImageDataUrl("")} aria-label="Remove package image" className="rounded-lg p-1 text-[var(--ox-muted)] hover:text-[var(--ox-avax-ink)]">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <span className="text-[11px] text-[var(--ox-muted)]">PNG, JPG, WebP</span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-[var(--ox-line)] bg-[var(--ox-surface)] p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-[var(--ox-ink)]">Guarantee Benefits ({benefits.length}/6)</span>
          <span className="text-[10px] text-[var(--ox-muted)]">Tap chips or add custom</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {BENEFIT_SUGGESTIONS.map((chip) => {
            const selected = benefits.includes(chip);
            return (
              <button key={chip} type="button" onClick={() => toggleBenefitChip(chip)} className={`inline-flex min-h-[30px] items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${selected ? "ox-badge-verified" : "border-[var(--ox-line)] bg-[var(--ox-soft)] text-[var(--ox-muted)] hover:text-[var(--ox-ink)]"}`}>
                {selected ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                <span>{chip}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          <input value={customBenefit} onChange={(e) => setCustomBenefit(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddCustomBenefit(); } }} placeholder="Add custom benefit (e.g. Freeze membership up to 60 days)..." className="ox-input min-h-[38px] min-w-0 flex-1 rounded-xl px-3 py-1.5" />
          <button type="button" disabled={customBenefit.trim().length < 2 || benefits.length >= 6} onClick={handleAddCustomBenefit} className="ox-btn-ghost inline-flex min-h-[38px] shrink-0 items-center justify-center gap-1 rounded-xl px-3 py-1.5 font-semibold disabled:opacity-50">
            <Plus className="h-3.5 w-3.5" /><span>Add</span>
          </button>
        </div>

        {benefits.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {benefits.map((item) => (
              <span key={item} className="ox-subcard inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] text-[var(--ox-ink)]">
                <ShieldCheck className="h-3 w-3 text-[var(--ox-ok-ink)]" />
                <span>{item}</span>
                <button type="button" onClick={() => setBenefits((prev) => prev.filter((b) => b !== item))} aria-label={`Remove benefit ${item}`} className="rounded p-0.5 text-[var(--ox-muted)] hover:text-[var(--ox-avax-ink)]">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={adding} className="ox-btn-primary inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 py-2 disabled:opacity-60">
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackagePlus className="h-3.5 w-3.5" />}
          <span>+ Add Package &amp; Guarantee Rights</span>
        </button>
      </div>
    </form>
  );
}
