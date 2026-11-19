"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ArrowLeft, Check, CheckCircle2, Copy, ExternalLink, Landmark, Loader2, MailCheck, QrCode, ShieldCheck, Zap } from "lucide-react";
import type { EnterpriseOrder } from "@/types";
import { buildVietQrFallbackDeeplink, formatVnd, truncateHex } from "@/components/shared/formatters";
import { OnChainProofBadge } from "@/components/shared/OnChainProofBadge";
import { SegmentedTabs } from "@/components/shared/ui-kit";

const BANK_APPS = [
  { id: "mb", label: "MB" },
  { id: "vcb", label: "VCB" },
  { id: "tcb", label: "TCB" },
  { id: "acb", label: "ACB" },
  { id: "bidv", label: "BIDV" },
] as const;

type PaymentTab = "VIETQR_BANK_APP" | "OPALX_DIRECT";

interface ActiveQrSlipCardProps {
  order: EnterpriseOrder | null;
  confirming: boolean;
  onSimulateBankAndMint: (orderCode: number, method?: PaymentTab) => Promise<void>;
  onBackToForm?: () => void;
  preferredMethod?: PaymentTab;
  onOpenVault?: (guaranteeId?: string) => void;
  fallbackEmail?: string;
}

export function ActiveQrSlipCard({
  order, confirming, onSimulateBankAndMint, onBackToForm, preferredMethod = "VIETQR_BANK_APP", onOpenVault, fallbackEmail,
}: ActiveQrSlipCardProps) {
  const [qrUrl, setQrUrl] = useState("");
  const [copiedMemo, setCopiedMemo] = useState(false);
  const [payTab, setPayTab] = useState<PaymentTab>(order?.paymentMethod ?? preferredMethod);

  useEffect(() => { setPayTab(order?.paymentMethod ?? preferredMethod); }, [order?.orderCode, order?.paymentMethod, preferredMethod]);
  useEffect(() => {
    if (!order) return;
    if (order.customQrImageDataUrl) return setQrUrl(order.customQrImageDataUrl);
    if (order.qrSvgDataUrl) return setQrUrl(order.qrSvgDataUrl);
    let cancelled = false;
    QRCode.toDataURL(order.qrCode || `OPX-${order.orderCode}`, { width: 240, margin: 2 })
      .then((url) => { if (!cancelled) setQrUrl(url); })
      .catch(() => { if (!cancelled) setQrUrl(""); });
    return () => { cancelled = true; };
  }, [order]);

  if (!order) {
    return (
      <div className="ox-card flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-3xl border-dashed p-6 text-center text-sm text-[var(--ox-muted)]">
        <p>Select a service package and create a payment session to display the VietQR code here.</p>
        {onBackToForm && (
          <button type="button" onClick={onBackToForm} className="ox-btn-ghost inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold lg:hidden">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to packages</span>
          </button>
        )}
      </div>
    );
  }

  const transferMemo = order.description || `OPX${order.orderCode}`;
  const isCustomQr = Boolean(order.customQrImageDataUrl);
  const isActivated = order.status === "GUARANTEED";
  const recipientEmail = order.buyerEmail || fallbackEmail || "OpalX Member";
  const contractRef = order.merchantContractAddress ?? order.confirmedByWallet;

  const handleCopyMemo = async () => {
    try {
      await navigator.clipboard.writeText(transferMemo);
      setCopiedMemo(true);
      window.setTimeout(() => setCopiedMemo(false), 1800);
    } catch { /* Ignore clipboard failures */ }
  };

  const rows: Array<[string, string, string?]> = [
    ["Receiving Bank", `${order.bankName || "MB Bank"} · ${order.bankAccountNo || "03120006789"}`, "font-mono font-semibold tabular-nums"],
    ["Receipt Email", recipientEmail, "font-mono"],
    ...(contractRef ? ([["Contract / Wallet", truncateHex(contractRef, 5), "font-mono font-semibold text-[var(--ox-ok-ink)]"]] as Array<[string, string, string?]>) : []),
  ];

  return (
    <div className={`ox-card-glow min-w-0 space-y-4 overflow-hidden rounded-3xl p-4 transition-all sm:p-5 ${isActivated ? "ox-qr-activated border-[var(--ox-ok)]/50" : ""}`}>
      <div className="flex min-w-0 items-start justify-between gap-2 border-b border-[var(--ox-line)] pb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[11px] font-medium text-[var(--ox-muted)] tabular-nums">Order #{order.orderCode} · {order.sellerName}</span>
            <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${order.railMode === "LIVE_BANK" ? "ox-badge-verified" : "ox-badge-warn"}`}>
              {order.railMode === "LIVE_BANK" ? "[LIVE BANK]" : "[SANDBOX]"}
            </span>
          </div>
          <p className="mt-0.5 truncate text-base font-bold text-[var(--ox-ink)]">{order.productName || order.description}</p>
        </div>
        <OnChainProofBadge label="Fuji" txHash={order.enterpriseTxHash} />
      </div>

      {isActivated ? (
        <div className="space-y-2.5 rounded-2xl border border-[var(--ox-ok)]/35 bg-[var(--ox-ok-tint)]/55 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="ox-badge-verified inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[11px] font-bold tabular-nums">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>RECEIVED {formatVnd(order.amountVnd)}</span>
            </span>
            {order.guaranteeId && <span className="font-mono text-xs font-bold text-[var(--ox-ok-ink)]">{order.guaranteeId}</span>}
          </div>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-[var(--ox-ink)]">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ox-ok-ink)]" />
            <span>Payment confirmed for <strong>{order.sellerName}</strong> and issued <strong className="font-mono">{order.guaranteeId ?? "Avalanche"}</strong> to <strong className="font-mono">{recipientEmail}</strong>.</span>
          </p>
        </div>
      ) : (
        <SegmentedTabs ariaLabel="Select payment rail" value={payTab} onChange={setPayTab} items={[{ key: "VIETQR_BANK_APP", label: "Bank App", icon: <QrCode className="h-3.5 w-3.5" /> }, { key: "OPALX_DIRECT", label: "OpalX Direct", icon: <Zap className="h-3.5 w-3.5 text-[var(--ox-avax)]" /> }]} />
      )}

      {(payTab === "VIETQR_BANK_APP" || isActivated) && (
        <div className="ox-subcard flex flex-col items-center rounded-2xl p-4 text-center">
          <div className={`rounded-2xl border border-[var(--ox-line)] bg-white p-3 shadow-sm transition-all ${isActivated ? "ring-4 ring-[var(--ox-ok)]/35" : ""}`}>
            {qrUrl ? <img src={qrUrl} alt={`Payment QR for order ${order.orderCode}`} className="h-44 w-44 object-contain" /> : <div className="flex h-44 w-44 items-center justify-center text-xs text-slate-500">Generating QR...</div>}
          </div>
          <p className="mt-3 font-mono text-2xl font-extrabold text-[var(--ox-ink)] tabular-nums">{formatVnd(order.amountVnd)}</p>
          {isActivated ? (
            <span className="ox-badge-verified mt-1.5 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"><ShieldCheck className="h-3 w-3" /><span>Check-in QR &amp; Settlement Active</span></span>
          ) : isCustomQr ? (
            <span className="mt-1.5 rounded-full border border-[var(--ox-line)] bg-[var(--ox-surface)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--ox-muted)]">Custom Merchant QR Code</span>
          ) : null}
        </div>
      )}

      {payTab === "OPALX_DIRECT" && !isActivated && (
        <div className="ox-pass-surface space-y-2.5 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--ox-ink)]"><Landmark className="h-4 w-4 text-[var(--ox-avax)]" /><span>OpalX GO Direct Payment</span></span>
            <span className="ox-badge-avax rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold">NAPAS 247 + Fuji</span>
          </div>
          <p className="text-xs leading-relaxed text-[var(--ox-muted)]">Transfer directly to <strong>{order.sellerName}</strong> and issue Guarantee Pass instantly.</p>
          <div className="ox-subcard flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5">
            <span className="text-xs text-[var(--ox-muted)]">Payment Amount</span>
            <span className="font-mono text-lg font-bold text-[var(--ox-ok-ink)] tabular-nums">{formatVnd(order.amountVnd)}</span>
          </div>
        </div>
      )}

      <dl className="divide-y divide-[var(--ox-line)] text-xs">
        <div className="flex items-center justify-between gap-2 py-2">
          <dt className="shrink-0 text-[var(--ox-muted)]">Transfer Memo</dt>
          <dd className="flex min-w-0 items-center gap-2">
            <span className="truncate font-mono font-bold text-[var(--ox-ink)]">{transferMemo}</span>
            <button type="button" onClick={() => void handleCopyMemo()} className="ox-btn-ghost ox-press inline-flex min-h-[28px] shrink-0 items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold">
              {copiedMemo ? <Check className="h-3 w-3 text-[var(--ox-ok)]" /> : <Copy className="h-3 w-3" />}
              <span>{copiedMemo ? "Copied" : "Copy"}</span>
            </button>
          </dd>
        </div>
        {rows.map(([label, val, cls]) => (
          <div key={label} className="flex items-center justify-between gap-2 py-2">
            <dt className="shrink-0 text-[var(--ox-muted)]">{label}</dt>
            <dd className={`min-w-0 truncate text-right text-[var(--ox-ink)] ${cls ?? ""}`}>{val}</dd>
          </div>
        ))}
      </dl>

      {!isCustomQr && payTab === "VIETQR_BANK_APP" && !isActivated && (
        <div className="grid grid-cols-5 gap-1.5">
          {BANK_APPS.map((b) => (
            <a key={b.id} href={buildVietQrFallbackDeeplink({ bankAppId: b.id, amountVnd: order.amountVnd, addInfo: transferMemo, accountNo: order.bankAccountNo, bankBin: order.bankBin, accountName: order.bankAccountName })} target="_blank" rel="noreferrer" className="ox-btn-ghost ox-press inline-flex min-h-[38px] items-center justify-center gap-1 rounded-xl px-1.5 py-1 font-mono text-xs font-semibold">
              <span>{b.label}</span><ExternalLink className="hidden h-3 w-3 sm:inline" />
            </a>
          ))}
        </div>
      )}

      {isActivated ? (
        <button type="button" onClick={() => (onOpenVault ? onOpenVault(order.guaranteeId) : window.dispatchEvent(new CustomEvent("opalx:tab", { detail: "VAULT" })))} className="ox-btn-primary flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs sm:text-sm">
          <ShieldCheck className="h-4 w-4 shrink-0" /><span>View Guarantee Pass &amp; Benefits</span>
        </button>
      ) : (
        <button type="button" disabled={confirming} onClick={() => void onSimulateBankAndMint(order.orderCode, payTab)} className={`${payTab === "OPALX_DIRECT" ? "ox-btn-chunky" : "ox-btn-primary"} flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl px-3.5 py-3 text-xs tabular-nums disabled:opacity-55 sm:text-sm`}>
          {confirming ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : payTab === "OPALX_DIRECT" ? <Zap className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
          <span className="truncate">{confirming ? "Confirming & issuing pass..." : payTab === "OPALX_DIRECT" ? `Pay Directly ${formatVnd(order.amountVnd)}` : "Confirm Transfer & Activate QR"}</span>
        </button>
      )}

      {onBackToForm && (
        <button type="button" onClick={onBackToForm} className="inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 text-xs font-semibold text-[var(--ox-muted)] hover:text-[var(--ox-ink)] lg:hidden">
          <ArrowLeft className="h-3.5 w-3.5" /><span>Choose Another Package</span>
        </button>
      )}
    </div>
  );
}
