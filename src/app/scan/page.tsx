"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, ExternalLink, FileCheck2, Landmark, Printer, QrCode, ShieldAlert, ShieldCheck } from "lucide-react";
import { parseEmvVietQrPayload } from "@/core/bank/vietqr-parser";
import { buildVietQrFallbackDeeplink, formatVnd } from "@/components/shared/formatters";
import { QrCameraScanner } from "@/components/enterprise/QrCameraScanner";

const QUICK_BANK_APPS = [
  { id: "mb", label: "MB Bank" },
  { id: "vcb", label: "Vietcombank" },
  { id: "tcb", label: "Techcombank" },
] as const;

function extractGuaranteeId(raw: string): string | null {
  const trimmed = raw.trim();
  const pathMatch = trimmed.match(/\/verify\/(OPX-[A-Za-z0-9-]+)/i);
  if (pathMatch?.[1]) return pathMatch[1].toUpperCase();
  if (/^OPX-[A-Za-z0-9-]+$/i.test(trimmed)) return trimmed.toUpperCase();
  return null;
}

export default function PosScanPage() {
  const [decoded, setDecoded] = useState<string>("");
  const guaranteeId = useMemo(() => (decoded ? extractGuaranteeId(decoded) : null), [decoded]);
  const parsed = useMemo(() => (decoded && !guaranteeId ? parseEmvVietQrPayload(decoded) : null), [decoded, guaranteeId]);

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <header className="ox-card flex flex-wrap items-center justify-between gap-3 rounded-3xl p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--ox-ok-tint)] text-[var(--ox-ok-ink)]">
            <QrCode className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[var(--ox-ink)] sm:text-xl">VietQR &amp; Guarantee Scanner</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
              <span className="ox-badge-verified rounded-full px-2 py-0.5 font-semibold">NAPAS 247</span>
              <span className="ox-subcard rounded-full px-2 py-0.5 font-semibold text-[var(--ox-muted)]">CRC-16</span>
              <span className="ox-badge-avax rounded-full px-2 py-0.5 font-semibold">Fuji 43113</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/" className="ox-btn-primary inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs">
            <span>Checkout</span>
          </Link>
          <Link href="/enterprise" className="ox-btn-ghost inline-flex min-h-[38px] items-center rounded-xl px-3.5 py-2 text-xs font-semibold">
            Enterprise
          </Link>
        </div>
      </header>

      <QrCameraScanner onDecoded={setDecoded} />

      {guaranteeId && (
        <section aria-label="Detected OpalX Guarantee Certificate" className="ox-card-glow space-y-4 rounded-3xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-[var(--ox-ok-ink)]" />
              <h2 className="text-sm font-bold text-[var(--ox-ink)]">OpalX Guarantee Certificate</h2>
            </div>
            <span className="ox-badge-verified inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>{guaranteeId}</span>
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href={`/verify/${encodeURIComponent(guaranteeId)}`} className="ox-btn-primary inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs">
              <span>Verify on Fuji</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link href={`/print/${encodeURIComponent(guaranteeId)}`} className="ox-btn-ghost inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold">
              <Printer className="h-3.5 w-3.5" />
              <span>Print Receipt</span>
            </Link>
          </div>
        </section>
      )}

      {parsed && (
        <section aria-label="Decoded VietQR payload" className="ox-card-glow space-y-4 rounded-3xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ox-line)] pb-3">
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-[var(--ox-ok-ink)]" />
              <h2 className="text-sm font-bold text-[var(--ox-ink)]">EMVCo VietQR Decoded</h2>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold ${parsed.crcValid ? "ox-badge-verified" : "ox-badge-avax"}`}>
                {parsed.crcValid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                <span>CRC-16: {parsed.crcValid ? "Valid" : "Invalid"}</span>
              </span>
              <span className="rounded-full border border-[var(--ox-line)] bg-[var(--ox-soft)] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--ox-muted)]">
                {parsed.isDynamic ? "Dynamic VietQR" : "Static VietQR"}
              </span>
            </div>
          </div>

          <dl className="divide-y divide-[var(--ox-line)] text-xs sm:text-sm">
            <div className="flex items-center justify-between gap-3 py-2.5">
              <dt className="text-[var(--ox-muted)]">Beneficiary Bank</dt>
              <dd className="text-right font-semibold text-[var(--ox-ink)]">
                {parsed.bankShortName ?? "Unknown"}
                {parsed.bankBin ? <span className="ml-1.5 font-mono text-xs text-[var(--ox-muted)]">(BIN {parsed.bankBin})</span> : null}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-2.5">
              <dt className="text-[var(--ox-muted)]">Account Number</dt>
              <dd className="font-mono font-bold text-[var(--ox-ink)] tabular-nums">{parsed.accountNo ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-2.5">
              <dt className="text-[var(--ox-muted)]">Amount</dt>
              <dd className="font-mono text-base font-extrabold text-[var(--ox-ok-ink)] tabular-nums">
                {parsed.amountVnd !== undefined ? formatVnd(parsed.amountVnd) : "Open amount"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-2.5">
              <dt className="text-[var(--ox-muted)]">Transfer Memo</dt>
              <dd className="font-mono font-semibold text-[var(--ox-ink)]">{parsed.purpose ?? "—"}</dd>
            </div>
            {parsed.orderCode !== undefined && (
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-[var(--ox-muted)]">OpalX Order Code</dt>
                <dd className="font-mono font-bold text-[var(--ox-avax-ink)] tabular-nums">OPX{parsed.orderCode}</dd>
              </div>
            )}
          </dl>

          {parsed.validFormat && parsed.bankBin && parsed.accountNo && (
            <div className="space-y-2 border-t border-[var(--ox-line)] pt-3">
              <p className="text-xs font-semibold text-[var(--ox-muted)]">Open Bank App (dl.vietqr.io)</p>
              <div className="flex flex-wrap gap-2">
                {QUICK_BANK_APPS.map((b) => (
                  <a
                    key={b.id}
                    href={buildVietQrFallbackDeeplink({
                      bankAppId: b.id,
                      amountVnd: parsed.amountVnd ?? 0,
                      addInfo: parsed.purpose ?? "OPALX",
                      accountNo: parsed.accountNo,
                      bankBin: parsed.bankBin,
                    })}
                    target="_blank"
                    rel="noreferrer"
                    className="ox-btn-ghost ox-press inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold"
                  >
                    <span>{b.label}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
                <Link href="/" className="ox-btn-avax inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs">
                  <span>Pay &amp; Guarantee</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          )}

          <details className="ox-subcard rounded-2xl px-3.5 py-2.5 text-xs">
            <summary className="font-semibold text-[var(--ox-muted)]">Raw EMVCo Payload ({parsed.rawPayload.length} chars)</summary>
            <p className="mt-2 break-all font-mono text-[11px] text-[var(--ox-ink)]">{parsed.rawPayload}</p>
          </details>
        </section>
      )}
    </main>
  );
}
