"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { ExternalLink, Loader2, Printer, ShieldCheck } from "lucide-react";
import type { GuaranteeCertificate } from "@/types";
import { computePrintFeeBreakdown } from "@/core/opalx/print-fee";
import { formatVnd, truncateHex } from "@/components/shared/formatters";

export function ThermalGuaranteeSlip({
  guarantee,
  onPrinted,
  onOpenVault,
}: {
  guarantee: GuaranteeCertificate | null;
  onPrinted?: () => Promise<void>;
  onOpenVault?: (guaranteeId?: string) => void;
}) {
  const router = useRouter();
  const [verifyQrUrl, setVerifyQrUrl] = useState("");
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!guarantee) return;
    QRCode.toDataURL(`${window.location.origin}${guarantee.verifyPath}`, { width: 160, margin: 1 })
      .then(setVerifyQrUrl)
      .catch(() => setVerifyQrUrl(""));
  }, [guarantee]);

  if (!guarantee) {
    return (
      <div className="ox-card flex min-h-[240px] items-center justify-center rounded-3xl border-dashed p-6 text-center text-sm text-[var(--ox-muted)]">
        Your Avalanche Guarantee Slip &amp; hash proof will appear immediately after payment.
      </div>
    );
  }

  const encodedId = encodeURIComponent(guarantee.guaranteeId);
  const fee = computePrintFeeBreakdown(guarantee.printCount ?? 1);
  const hashPreview = guarantee.lastPrintHash ?? guarantee.proofBundle.guaranteeTxHash;

  const handleHashAndPrint = async () => {
    setPrinting(true);
    try {
      await fetch(`/api/guarantees/${encodedId}/record-print`, { method: "POST" }).catch(() => undefined);
      if (onPrinted) await onPrinted();
      router.push(`/print/${encodedId}`);
    } finally {
      setPrinting(false);
    }
  };

  const rows: Array<[string, string, string?]> = [
    ["Enterprise", guarantee.enterpriseName || "California Fitness & Yoga", "font-semibold"],
    ["Category", guarantee.categoryLabel || "Gym & Fitness"],
    ["Package", guarantee.productName || guarantee.description || `Order #${guarantee.orderCode}`],
    ...(guarantee.buyerEmail ? ([["Holder Email", guarantee.buyerEmail, "font-mono text-xs"]] as Array<[string, string, string?]>) : []),
    ["Amount", formatVnd(guarantee.amountVnd), "font-mono text-base font-bold text-[var(--ox-ok-ink)] tabular-nums"],
    ["Avalanche Hash", truncateHex(hashPreview, 7), "font-mono text-xs font-semibold"],
  ];

  return (
    <article aria-label="Avalanche Guarantee Slip" className="ox-pass-surface overflow-hidden rounded-3xl">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--ox-line)] bg-[var(--ox-ok-tint)]/45 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <ShieldCheck className="h-5 w-5 shrink-0 text-[var(--ox-ok-ink)]" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-[var(--ox-ok-ink)]">Avalanche Guarantee Slip</p>
            <p className="font-mono text-sm font-bold text-[var(--ox-ink)]">{guarantee.guaranteeId}</p>
          </div>
        </div>
        <span className="ox-badge-verified shrink-0 rounded-lg px-2.5 py-1 font-mono text-[11px] font-semibold tabular-nums">
          Printed: {guarantee.printCount ?? 0}x
        </span>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <dl className="divide-y divide-[var(--ox-line)] text-xs sm:text-sm">
          {rows.map(([label, val, cls]) => (
            <div key={label} className="flex items-start justify-between gap-3 py-2">
              <dt className="text-[var(--ox-muted)]">{label}</dt>
              <dd className={`text-right text-[var(--ox-ink)] ${cls ?? "font-medium"}`}>{val}</dd>
            </div>
          ))}
        </dl>

        {guarantee.benefits && guarantee.benefits.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {guarantee.benefits.map((b) => (
              <span key={b} className="rounded-full border border-[var(--ox-line)] bg-[var(--ox-surface)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--ox-ink)]">
                {b}
              </span>
            ))}
          </div>
        )}

        <div className="ox-subcard rounded-2xl p-3 text-xs text-[var(--ox-muted)] tabular-nums">
          <div className="flex items-center justify-between gap-2 font-semibold text-[var(--ox-ink)]">
            <span>Print &amp; hash fee / copy</span>
            <span className="shrink-0 font-mono text-[var(--ox-ok-ink)] whitespace-nowrap">
              ~{fee.totalFeePerPrintAvax} AVAX (≈ {formatVnd(fee.totalFeePerPrintVnd)})
            </span>
          </div>
          <p className="mt-1 text-[11px]">
            Includes {fee.protocolFeePerPrintAvax} AVAX protocol + ~{fee.estimatedGasPerPrintAvax} AVAX Fuji gas.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {verifyQrUrl && (
            <div className="mx-auto shrink-0 rounded-2xl border border-[var(--ox-line)] bg-white p-2 shadow-sm sm:mx-0">
              <img src={verifyQrUrl} alt={`Verification QR ${guarantee.guaranteeId}`} className="h-16 w-16 object-contain" />
            </div>
          )}

          <div className="flex flex-1 flex-col gap-2">
            <button
              type="button"
              disabled={printing}
              onClick={() => void handleHashAndPrint()}
              className="ox-btn-primary inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl px-4 py-2 text-xs disabled:opacity-60 sm:text-sm"
            >
              {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              <span>{printing ? "Hashing & opening print..." : "Print (58mm/80mm/A4)"}</span>
            </button>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {onOpenVault ? (
                <button type="button" onClick={() => onOpenVault(guarantee.guaranteeId)} className="ox-btn-avax inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Open Pass &amp; Benefits</span>
                </button>
              ) : (
                <Link href="/?tab=vault" className="ox-btn-avax inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Open Pass &amp; Benefits</span>
                </Link>
              )}
              <Link href={guarantee.verifyPath} className="ox-btn-ghost inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold">
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Verify on Fuji</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
