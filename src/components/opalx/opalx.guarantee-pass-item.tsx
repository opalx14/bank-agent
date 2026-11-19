"use client";

import Link from "next/link";
import { Award, Download, ExternalLink, Loader2, Maximize2, Printer, QrCode, Shield, UserCheck } from "lucide-react";
import { computePrintFeeBreakdown } from "@/core/opalx/opalx.print-fee";
import { BrandOrb } from "@/components/shared/shared.brand-orb";
import { formatVnd, truncateHex } from "@/components/shared/shared.formatters";
import { OpalxGuaranteePass } from "@/components/shared/shared.guarantee-pass";
import type { GuaranteeCertificate, GuaranteeRightKind } from "@/types";

const RIGHT_ACTIONS: Array<{ kind: GuaranteeRightKind; label: string; icon: typeof QrCode }> = [
  { kind: "CHECKIN_PASS", label: "Counter Check-in", icon: UserCheck },
  { kind: "VAULT_COVERAGE", label: "PolicyVault Coverage", icon: Shield },
  { kind: "ERC8004_PRIVILEGE", label: "ERC-8004 Privilege", icon: Award },
];

interface GuaranteePassCardItemProps {
  guarantee: GuaranteeCertificate;
  qrDataUrl?: string;
  isHighlighted: boolean;
  claimingKey: string | null;
  onOpenQr: (guarantee: GuaranteeCertificate) => void;
  onClaimRight: (guaranteeId: string, kind: GuaranteeRightKind) => Promise<void>;
}

export function GuaranteePassCardItem({
  guarantee: g,
  qrDataUrl,
  isHighlighted,
  claimingKey,
  onOpenQr,
  onClaimRight,
}: GuaranteePassCardItemProps) {
  const entName = g.enterpriseName?.trim() || "California Fitness & Yoga";
  const catLabel = g.categoryLabel?.trim() || "Gym & Yoga Studio";
  const pkgName = g.productName || g.description || `Order #${g.orderCode}`;
  const encodedId = encodeURIComponent(g.guaranteeId);
  const prints = g.printCount ?? 0;
  const feeInfo = computePrintFeeBreakdown(Math.max(1, prints));
  const isLive = !g.sandbox && g.proofBundle.mode === "LIVE_FUJI_AVAX";
  const statusLabel = g.railMode === "LIVE_BANK" && !g.sandbox ? "[LIVE BANK]" : "[SANDBOX]";
  const txHash = g.lastPrintHash ?? g.proofBundle.guaranteeTxHash;

  return (
    <article className={`ox-pass-surface flex flex-col justify-between gap-4 rounded-3xl p-4 sm:p-5 ${isHighlighted ? "ring-2 ring-[var(--ox-ok)]" : ""}`}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <BrandOrb seed={g.enterpriseId || entName} label={entName} size={34} />
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-[var(--ox-ink)]">{entName}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums ${statusLabel === "[LIVE BANK]" ? "ox-badge-verified" : "ox-badge-warn"}`}>
                  {statusLabel}
                </span>
                <span className="truncate rounded-full border border-[var(--ox-line)] bg-[var(--ox-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--ox-muted)]">
                  {catLabel}
                </span>
              </div>
            </div>
          </div>

          {qrDataUrl && (
            <button type="button" onClick={() => onOpenQr(g)} className="ox-btn-ghost ox-press inline-flex min-h-[32px] shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
              <Maximize2 className="h-3.5 w-3.5 text-[var(--ox-ok-ink)]" />
              <span>QR Check-in</span>
            </button>
          )}
        </div>

        <OpalxGuaranteePass
          variant={isLive ? "jade" : "obsidian"}
          enterpriseName={entName}
          packageName={pkgName}
          amountVnd={g.amountVnd}
          guaranteeId={g.guaranteeId}
          holderLabel={g.payerName || "OpalX Member"}
          bankLabel={g.maskedBankRef}
          statusLabel={statusLabel}
          solidState
          stamped
          tilt
          txRef={txHash}
          className="mx-auto"
        />

        {g.benefits && g.benefits.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {g.benefits.map((benefit) => (
              <span key={benefit} className="rounded-full border border-[var(--ox-line)] bg-[var(--ox-surface)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--ox-ink)]">
                {benefit}
              </span>
            ))}
          </div>
        )}

        <div className="ox-subcard space-y-2 rounded-2xl p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-[var(--ox-ink)]">ECDSA Rights</p>
            <span className="font-mono text-[11px] text-[var(--ox-muted)] tabular-nums">{g.claimedRights?.length ?? 0}/3 signed</span>
          </div>

          <div className="space-y-1.5">
            {RIGHT_ACTIONS.map(({ kind, label, icon: Icon }) => {
              const claimed = g.claimedRights?.find((r) => r.kind === kind);
              const busy = claimingKey === `${g.guaranteeId}:${kind}`;
              return (
                <div key={kind} className="space-y-1">
                  <button
                    type="button"
                    disabled={busy || g.revoked}
                    onClick={() => void onClaimRight(g.guaranteeId, kind)}
                    className={`ox-press flex min-h-[38px] w-full items-center justify-between gap-2 rounded-xl border px-3 py-1.5 text-left text-xs font-semibold transition-all disabled:opacity-55 ${
                      claimed
                        ? "border-[var(--ox-ok)]/40 bg-[var(--ox-ok-tint)]/55 text-[var(--ox-ok-ink)]"
                        : "border-[var(--ox-line)] bg-[var(--ox-surface)] text-[var(--ox-ink)] hover:border-[var(--ox-muted)]/40"
                    }`}
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      {busy ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--ox-ok)]" /> : <Icon className={`h-3.5 w-3.5 shrink-0 ${claimed ? "text-[var(--ox-ok-ink)]" : "text-[var(--ox-avax)]"}`} />}
                      <span className="truncate">{label}</span>
                    </span>
                    {claimed ? (
                      <span className="ox-badge-verified shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px]">{truncateHex(claimed.signature, 4)}</span>
                    ) : (
                      <span className="shrink-0 font-mono text-[10px] text-[var(--ox-muted)]">Sign →</span>
                    )}
                  </button>
                  {claimed && <p className="px-1 text-[11px] leading-relaxed text-[var(--ox-muted)]">{claimed.verificationNote}</p>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-[var(--ox-muted)] tabular-nums">
          <span>Printed {prints}x · {feeInfo.totalFeePerPrintAvax} AVAX (≈ {formatVnd(feeInfo.totalFeePerPrintVnd)})</span>
          <a href={`https://testnet.snowtrace.io/tx/${txHash}`} target="_blank" rel="noreferrer" className="text-[var(--ox-ok-ink)] hover:underline">
            {truncateHex(txHash, 5)}
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 border-t border-[var(--ox-line)] pt-3 sm:grid-cols-3">
        <Link href={`/print/${encodedId}`} className="ox-btn-primary inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs whitespace-nowrap">
          <Printer className="h-3.5 w-3.5 shrink-0" />
          <span>Print Slip</span>
        </Link>
        <a href={`/api/guarantees/${encodedId}/print-html?download=1`} className="ox-btn-ghost inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold whitespace-nowrap">
          <Download className="h-3.5 w-3.5 shrink-0" />
          <span>Download .HTML</span>
        </a>
        <Link href={`/verify/${encodedId}`} className="ox-btn-ghost inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold whitespace-nowrap text-[var(--ox-ok-ink)]">
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          <span>Verify on Fuji</span>
        </Link>
      </div>
    </article>
  );
}
