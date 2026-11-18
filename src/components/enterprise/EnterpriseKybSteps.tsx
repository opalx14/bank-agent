"use client";

import {
  Building2, Check, CheckCircle2, Coffee, Cpu, Dumbbell, GraduationCap,
  HeartPulse, ImagePlus, Landmark, Plus, Sparkles, X,
} from "lucide-react";
import type { BankPartnerRail } from "@/types";
import { normalizeAccountHolderName } from "@/core/enterprise/catalog";
import { formatVnd } from "@/components/shared/formatters";
import { compressImageFileToDataUrl } from "@/components/shared/image-utils";

export const KYB_CATEGORY_CHIPS = [
  { value: "Phòng Tập Gym & Yoga", label: "Phòng Tập Gym & Yoga", icon: Dumbbell },
  { value: "F&B & Cà Phê", label: "F&B & Cà Phê", icon: Coffee },
  { value: "Y Tế & Spa", label: "Y Tế & Spa", icon: HeartPulse },
  { value: "Giáo Dục & Khóa Học", label: "Giáo Dục & Khóa Học", icon: GraduationCap },
  { value: "Công Nghệ & SaaS", label: "Công Nghệ & SaaS", icon: Cpu },
  { value: "__CUSTOM__", label: "Khác...", icon: Sparkles },
] as const;

export const KYB_BENEFIT_PRESETS = [
  "Check-in QR quầy lễ tân",
  "Bảo vệ PolicyVault 100%",
  "Ký quỹ bảo chứng Fuji",
  "Tích lũy hạng hội viên ERC-8004",
  "Hoàn tiền tự động khi vi phạm cam kết",
] as const;

export interface KybStepFormProps {
  step: 1 | 2 | 3;
  activeBanks: BankPartnerRail[];
  enterpriseName: string;
  setEnterpriseName: (v: string) => void;
  taxId: string;
  setTaxId: (v: string) => void;
  categoryPreset: string;
  setCategoryPreset: (v: string) => void;
  customCategory: string;
  setCustomCategory: (v: string) => void;
  logoImageUrl: string;
  setLogoImageUrl: (v: string) => void;
  linkedBankRailId: string;
  setLinkedBankRailId: (v: string) => void;
  accountNo: string;
  setAccountNo: (v: string) => void;
  accountName: string;
  setAccountName: (v: string) => void;
  pkgLabel: string;
  setPkgLabel: (v: string) => void;
  pkgDuration: string;
  setPkgDuration: (v: string) => void;
  pkgAmount: string;
  setPkgAmount: (v: string) => void;
  guaranteeRightLabel: string;
  setGuaranteeRightLabel: (v: string) => void;
  benefits: string[];
  setBenefits: React.Dispatch<React.SetStateAction<string[]>>;
  customBenefit: string;
  setCustomBenefit: (v: string) => void;
  onImageError: (msg: string) => void;
}

export function EnterpriseKybSteps(p: KybStepFormProps) {
  const normalizedHolder = normalizeAccountHolderName(p.accountName);
  const parsedAmount = Number(p.pkgAmount);
  const step3Ready = p.pkgLabel.trim().length >= 2 && Number.isFinite(parsedAmount) && parsedAmount >= 2000;

  const toggleBenefit = (preset: string) =>
    p.setBenefits((prev) => (prev.includes(preset) ? prev.filter((item) => item !== preset) : prev.length >= 6 ? prev : [...prev, preset]));

  const addCustomBenefit = () => {
    const cleaned = p.customBenefit.trim().slice(0, 120);
    if (cleaned.length < 2) return;
    p.setBenefits((prev) => (prev.includes(cleaned) || prev.length >= 6 ? prev : [...prev, cleaned]));
    p.setCustomBenefit("");
  };

  if (p.step === 1) {
    return (
      <section className="ox-subcard space-y-3.5 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[var(--ox-ink)]">Bước 1 — Thông tin &amp; Logo Doanh nghiệp</h3>
          <span className="font-mono text-[11px] text-[var(--ox-muted)] tabular-nums">MST {p.taxId.trim().length}/14</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--ox-line)] bg-[var(--ox-surface)] p-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--ox-line)] bg-[var(--ox-soft)]">
            {p.logoImageUrl ? <img src={p.logoImageUrl} alt="Logo doanh nghiệp" className="h-full w-full object-cover" /> : <Building2 className="h-5 w-5 text-[var(--ox-muted)]" />}
          </div>
          <label className="ox-btn-ghost inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold">
            <ImagePlus className="h-3.5 w-3.5 text-[var(--ox-ok-ink)]" />
            <span>{p.logoImageUrl ? "Đổi logo DN" : "Tải logo DN (tùy chọn)"}</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void compressImageFileToDataUrl(file, 400).then(p.setLogoImageUrl).catch((err) => p.onImageError(err instanceof Error ? err.message : "Không thể đọc ảnh."));
            }} />
          </label>
          {p.logoImageUrl ? (
            <button type="button" onClick={() => p.setLogoImageUrl("")} className="ox-btn-ghost rounded-lg p-1.5 text-[var(--ox-muted)] hover:text-[var(--ox-avax-ink)]" aria-label="Xóa logo"><X className="h-3.5 w-3.5" /></button>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="font-semibold text-[var(--ox-ink)]">Tên doanh nghiệp / Thương hiệu</span>
            <input value={p.enterpriseName} onChange={(e) => p.setEnterpriseName(e.target.value)} placeholder="VD: Golden Lotus Fitness & Yoga" className="ox-input min-h-[42px] w-full rounded-xl px-3.5 py-2" />
          </label>
          <label className="block space-y-1.5">
            <span className="font-semibold text-[var(--ox-ink)]">Mã số thuế (MST 10–14 ký tự)</span>
            <input value={p.taxId} onChange={(e) => p.setTaxId(e.target.value)} placeholder="VD: 031234567890" className="ox-input min-h-[42px] w-full rounded-xl px-3.5 py-2 font-mono tabular-nums" />
          </label>
        </div>
        <div className="space-y-2">
          <span className="block font-semibold text-[var(--ox-ink)]">Lĩnh vực kinh doanh</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {KYB_CATEGORY_CHIPS.map((chip) => {
              const Icon = chip.icon;
              const active = p.categoryPreset === chip.value;
              return (
                <button key={chip.value} type="button" aria-pressed={active} onClick={() => p.setCategoryPreset(chip.value)} className={`ox-press flex min-h-[40px] items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-all ${active ? "ox-pill-active" : "border-[var(--ox-line)] bg-[var(--ox-surface)] text-[var(--ox-muted)] hover:text-[var(--ox-ink)]"}`}>
                  <Icon className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{chip.label}</span>
                </button>
              );
            })}
          </div>
          {p.categoryPreset === "__CUSTOM__" && (
            <input value={p.customCategory} onChange={(e) => p.setCustomCategory(e.target.value)} placeholder="VD: Chuỗi Nha Khoa Thẩm Mỹ" className="ox-input min-h-[40px] w-full rounded-xl px-3.5 py-2" />
          )}
        </div>
      </section>
    );
  }

  if (p.step === 2) {
    return (
      <section className="ox-subcard space-y-3.5 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[var(--ox-ink)]">Bước 2 — Tài khoản ngân hàng VietQR</h3>
          <span className="ox-badge-info rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold">NAPAS 247</span>
        </div>
        <label className="block space-y-1.5">
          <span className="flex items-center gap-1.5 font-semibold text-[var(--ox-ink)]"><Landmark className="h-3.5 w-3.5 text-[var(--ox-info-ink)]" /><span>Ngân hàng nhận tiền (tự động đối soát)</span></span>
          <select value={p.linkedBankRailId} onChange={(e) => p.setLinkedBankRailId(e.target.value)} className="ox-input min-h-[42px] w-full rounded-xl px-3.5 py-2">
            {p.activeBanks.length === 0 && <option value="">Hiện chưa có ngân hàng khả dụng</option>}
            {p.activeBanks.map((b) => <option key={b.id} value={b.id}>{b.shortName} — {b.bankName} (BIN {b.bankBin})</option>)}
          </select>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="font-semibold text-[var(--ox-ink)]">Số tài khoản nhận (STK)</span>
            <input value={p.accountNo} onChange={(e) => p.setAccountNo(e.target.value)} placeholder="VD: 03120006789" className="ox-input min-h-[42px] w-full rounded-xl px-3.5 py-2 font-mono tabular-nums" />
          </label>
          <label className="block space-y-1.5">
            <span className="font-semibold text-[var(--ox-ink)]">Tên chủ tài khoản</span>
            <input value={p.accountName} onChange={(e) => p.setAccountName(e.target.value)} placeholder="VD: CONG TY GOLDEN LOTUS" className="ox-input min-h-[42px] w-full rounded-xl px-3.5 py-2 uppercase" />
            {p.accountName.trim() && normalizedHolder !== p.accountName.trim().toUpperCase() && (
              <span className="block font-mono text-[10px] text-[var(--ox-info-ink)]">Chuẩn VietQR: {normalizedHolder}</span>
            )}
          </label>
        </div>
      </section>
    );
  }

  return (
    <section className="ox-subcard space-y-3.5 rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-[var(--ox-ink)]">Bước 3 — Gói dịch vụ &amp; Quyền lợi (tùy chọn)</h3>
        {step3Ready && <span className="ox-badge-verified rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums">{formatVnd(parsedAmount)}</span>}
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <input value={p.pkgLabel} onChange={(e) => p.setPkgLabel(e.target.value)} placeholder="Tên gói (VD: VIP 12 Tháng)" className="ox-input min-h-[40px] w-full rounded-xl px-3 py-2" />
        <input value={p.pkgDuration} onChange={(e) => p.setPkgDuration(e.target.value)} placeholder="Thời hạn (VD: 12 tháng)" className="ox-input min-h-[40px] w-full rounded-xl px-3 py-2" />
        <input type="number" min={2000} step={1000} value={p.pkgAmount} onChange={(e) => p.setPkgAmount(e.target.value)} placeholder="Giá VND (VD: 1500000)" className="ox-input min-h-[40px] w-full rounded-xl px-3 py-2 font-mono tabular-nums" />
      </div>
      <input value={p.guaranteeRightLabel} onChange={(e) => p.setGuaranteeRightLabel(e.target.value)} placeholder="Nhãn thẻ quyền lợi bảo chứng (VD: Thẻ Hội Viên & Bảo Chứng CLB)" maxLength={80} className="ox-input min-h-[40px] w-full rounded-xl px-3 py-2" />
      <div className="space-y-2 rounded-xl border border-[var(--ox-line)] bg-[var(--ox-surface)] p-3">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-[var(--ox-ink)]">Quyền lợi bảo chứng ({p.benefits.length}/6)</span>
          <span className="text-[var(--ox-muted)]">Chạm chọn hoặc tự nhập</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {KYB_BENEFIT_PRESETS.map((preset) => {
            const selected = p.benefits.includes(preset);
            return (
              <button key={preset} type="button" onClick={() => toggleBenefit(preset)} className={`inline-flex min-h-[30px] items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${selected ? "ox-badge-verified" : "border-[var(--ox-line)] bg-[var(--ox-soft)] text-[var(--ox-muted)] hover:text-[var(--ox-ink)]"}`}>
                {selected ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}<span>{preset}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          <input value={p.customBenefit} onChange={(e) => p.setCustomBenefit(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomBenefit(); } }} placeholder="Nhập quyền lợi khác..." className="ox-input min-h-[38px] min-w-0 flex-1 rounded-xl px-3 py-1.5" />
          <button type="button" disabled={p.customBenefit.trim().length < 2 || p.benefits.length >= 6} onClick={addCustomBenefit} className="ox-btn-ghost inline-flex min-h-[38px] shrink-0 items-center justify-center gap-1 rounded-xl px-3 py-1.5 font-semibold disabled:opacity-50"><Plus className="h-3.5 w-3.5" /><span>Thêm</span></button>
        </div>
        {p.benefits.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {p.benefits.map((b) => (
              <span key={b} className="ox-subcard inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] text-[var(--ox-ink)]">
                <CheckCircle2 className="h-3 w-3 text-[var(--ox-ok-ink)]" /><span>{b}</span>
                <button type="button" onClick={() => p.setBenefits((prev) => prev.filter((item) => item !== b))} aria-label={`Bỏ quyền lợi ${b}`} className="rounded p-0.5 text-[var(--ox-muted)] hover:text-[var(--ox-avax-ink)]"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
