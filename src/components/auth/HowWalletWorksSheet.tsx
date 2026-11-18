"use client";

import { useState } from "react";
import { FlaskConical, HelpCircle, KeyRound, Sparkles, X } from "lucide-react";
import { PortalSheet } from "@/components/shared/PortalSheet";

export interface HowWalletWorksSheetProps {
  triggerVariant?: "button" | "link" | "compact";
  className?: string;
  roleHint?: "enterprise" | "bank" | "customer";
}

const ROLE_SUBTITLE: Record<NonNullable<HowWalletWorksSheetProps["roleHint"]>, string> = {
  enterprise: "Dành cho Doanh Nghiệp phát hành gói dịch vụ & cam kết Merchant KYB.",
  bank: "Dành cho Ngân Hàng đối soát giao dịch NAPAS 247 & PolicyVault Fuji.",
  customer: "Dành cho Hội Viên thanh toán VietQR trực tiếp & giữ Phiếu Bảo Chứng.",
};

const HELP_ROWS = [
  {
    icon: Sparkles,
    badgeCls: "bg-[var(--ox-avax-tint)] text-[var(--ox-avax-ink)]",
    title: "Passkey P-256 trên máy",
    desc: "Không cần cài ví ngoài; ký bảo chứng nhanh, phí Fuji có thể được hỗ trợ hoặc xác nhận 1 chạm.",
  },
  {
    icon: KeyRound,
    badgeCls: "bg-[var(--ox-info-tint)] text-[var(--ox-info-ink)]",
    title: "Chủ quyền & Bảo mật",
    desc: "Khóa phiên/thiết bị chỉ ký cam kết SHA-256 & chứng từ (0 PII on-chain); hãy giữ an toàn thiết bị hoặc sao lưu phiên khi cần.",
  },
  {
    icon: FlaskConical,
    badgeCls: "bg-[var(--ox-ok-tint)] text-[var(--ox-ok-ink)]",
    title: "Mạng thử nghiệm & Thanh toán thật",
    desc: "Bảo chứng chạy trên Avalanche Fuji (43113); tiền VND luôn chuyển trực tiếp qua VietQR/ngân hàng, không giữ hộ.",
  },
] as const;

export function HowWalletWorksSheet({
  triggerVariant = "button",
  className = "",
  roleHint,
}: HowWalletWorksSheetProps) {
  const [open, setOpen] = useState(false);

  const triggerCls =
    triggerVariant === "link"
      ? "inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ox-muted)] transition-colors hover:text-[var(--ox-ink)] hover:underline"
      : triggerVariant === "compact"
        ? "ox-btn-ghost ox-press inline-flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-[var(--ox-muted)] hover:text-[var(--ox-ink)]"
        : "ox-btn-ghost ox-press inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold sm:text-sm";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${triggerCls} ${className}`.trim()}>
        <HelpCircle className={triggerVariant === "button" ? "h-4 w-4 text-[var(--ox-muted)]" : "h-3.5 w-3.5"} />
        <span>Ví hoạt động thế nào?</span>
      </button>

      <PortalSheet open={open} onClose={() => setOpen(false)} title="Ví OpalX & Bảo Chứng Fuji">
        <button
          type="button"
          aria-label="Đóng"
          onClick={() => setOpen(false)}
          className="ox-btn-ghost absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full"
        >
          <X className="h-4 w-4" />
        </button>

        {roleHint ? <p className="-mt-1 mb-4 text-xs text-[var(--ox-muted)]">{ROLE_SUBTITLE[roleHint]}</p> : null}

        <div className="space-y-3.5">
          {HELP_ROWS.map((row) => {
            const Icon = row.icon;
            return (
              <div key={row.title} className="flex items-start gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${row.badgeCls}`}>
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--ox-ink)]">{row.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-[var(--ox-muted)]">{row.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ox-btn-primary mt-5 inline-flex min-h-[42px] w-full items-center justify-center rounded-xl px-4 text-sm"
        >
          Đã hiểu
        </button>
      </PortalSheet>
    </>
  );
}
