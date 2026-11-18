"use client";

import { Loader2, Mail, QrCode, ShieldCheck, UserCheck, Zap } from "lucide-react";
import type { EnterpriseServicePackage } from "@/types";
import { formatVnd } from "@/components/shared/formatters";

export type CheckoutPaymentMethod = "VIETQR_BANK_APP" | "OPALX_DIRECT";

interface CheckoutPayerFormProps {
  payerName: string;
  onPayerNameChange: (val: string) => void;
  buyerEmail: string;
  onBuyerEmailChange: (val: string) => void;
  preferredMethod: CheckoutPaymentMethod;
  onPreferredMethodChange: (method: CheckoutPaymentMethod) => void;
  requireInvoiceXml: boolean;
  onRequireInvoiceXmlChange: (val: boolean) => void;
  selectedPkg: EnterpriseServicePackage | null;
  canSubmit: boolean;
  creating: boolean;
}

export function CheckoutPayerForm({
  payerName,
  onPayerNameChange,
  buyerEmail,
  onBuyerEmailChange,
  preferredMethod,
  onPreferredMethodChange,
  requireInvoiceXml,
  onRequireInvoiceXmlChange,
  selectedPkg,
  canSubmit,
  creating,
}: CheckoutPayerFormProps) {
  const ctaLabel = creating
    ? "Đang khởi tạo..."
    : selectedPkg
      ? preferredMethod === "OPALX_DIRECT"
        ? `Thanh toán trực tiếp · ${formatVnd(selectedPkg.amountVnd)}`
        : `Tạo VietQR · ${formatVnd(selectedPkg.amountVnd)}`
      : "Chọn gói để tiếp tục";

  return (
    <section className="space-y-3.5" aria-label="Chủ chứng từ và phương thức thanh toán">
      <h2 className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--ox-ink)]">
        <UserCheck className="h-4 w-4 text-[var(--ox-ok-ink)]" />
        <span>Chủ chứng từ</span>
      </h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor="cust-payer" className="mb-1.5 block text-xs font-medium text-[var(--ox-muted)]">
            Họ tên chủ chứng từ
          </label>
          <input
            id="cust-payer"
            type="text"
            autoComplete="name"
            value={payerName}
            onChange={(e) => onPayerNameChange(e.target.value)}
            placeholder="Khách hàng OpalX"
            className="ox-input min-h-[44px] w-full rounded-xl px-3.5 py-2 text-sm placeholder:text-[var(--ox-muted)]"
          />
        </div>

        <div className="min-w-0">
          <label
            htmlFor="cust-email"
            className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--ox-muted)]"
          >
            <Mail className="h-3.5 w-3.5 text-[var(--ox-ok)]" />
            <span>Email nhận chứng thư</span>
          </label>
          <input
            id="cust-email"
            type="email"
            autoComplete="email"
            value={buyerEmail}
            onChange={(e) => onBuyerEmailChange(e.target.value)}
            placeholder="member@opalx.vn"
            className="ox-input min-h-[44px] w-full rounded-xl px-3.5 py-2 font-mono text-xs"
          />
        </div>
      </div>

      <div
        className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
        role="radiogroup"
        aria-label="Phương thức thanh toán ưu tiên"
      >
        <button
          type="button"
          role="radio"
          aria-checked={preferredMethod === "VIETQR_BANK_APP"}
          onClick={() => onPreferredMethodChange("VIETQR_BANK_APP")}
          className={`ox-press flex items-center gap-2.5 rounded-2xl border px-3.5 py-3 text-left text-xs transition-all ${
            preferredMethod === "VIETQR_BANK_APP"
              ? "border-[var(--ox-ok)] bg-[var(--ox-ok-tint)]/45 ring-1 ring-[var(--ox-ok)]"
              : "ox-subcard hover:border-[var(--ox-muted)]/40"
          }`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--ox-ok-tint)] text-[var(--ox-ok-ink)]">
            <QrCode className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-[var(--ox-ink)]">VietQR App Ngân Hàng</p>
            <p className="truncate text-[11px] text-[var(--ox-muted)]">Quét QR hoặc mở app</p>
          </div>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={preferredMethod === "OPALX_DIRECT"}
          onClick={() => onPreferredMethodChange("OPALX_DIRECT")}
          className={`ox-press flex items-center gap-2.5 rounded-2xl border px-3.5 py-3 text-left text-xs transition-all ${
            preferredMethod === "OPALX_DIRECT"
              ? "border-[var(--ox-avax)] bg-[var(--ox-avax-tint)]/45 ring-1 ring-[var(--ox-avax)]"
              : "ox-subcard hover:border-[var(--ox-muted)]/40"
          }`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--ox-avax-tint)] text-[var(--ox-avax-ink)]">
            <Zap className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-[var(--ox-ink)]">OpalX Direct</p>
            <p className="truncate text-[11px] text-[var(--ox-muted)]">Chuyển khoản &amp; cấp thẻ ngay</p>
          </div>
        </button>
      </div>

      <details className="ox-subcard rounded-xl px-3.5 py-2.5 text-xs">
        <summary className="font-semibold text-[var(--ox-ink)]">Hóa đơn điện tử (TT78 XML)</summary>
        <label className="mt-2.5 flex cursor-pointer items-center justify-between gap-2 border-t border-[var(--ox-line)] pt-2.5 text-[var(--ox-muted)]">
          <span>Đính kèm XML Thông tư 78 để đối soát 3 chiều</span>
          <input
            type="checkbox"
            checked={requireInvoiceXml}
            onChange={(e) => onRequireInvoiceXmlChange(e.target.checked)}
            className="h-4 w-4 accent-[var(--ox-ok)]"
          />
        </label>
      </details>

      <button
        type="submit"
        disabled={!canSubmit || creating}
        className={`${
          preferredMethod === "OPALX_DIRECT" ? "ox-btn-chunky" : "ox-btn-primary"
        } flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs tabular-nums disabled:opacity-55 sm:text-sm`}
      >
        {creating ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        ) : preferredMethod === "OPALX_DIRECT" ? (
          <Zap className="h-4 w-4 shrink-0" />
        ) : (
          <ShieldCheck className="h-4 w-4 shrink-0" />
        )}
        <span className="truncate">{ctaLabel}</span>
      </button>
    </section>
  );
}
