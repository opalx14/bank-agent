"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, CheckCircle2, Copy, ExternalLink, Loader2, X } from "lucide-react";

export type TxToastState = "idle" | "sent" | "ok" | "fail";

export interface TxStatusToastProps {
  open: boolean;
  state: TxToastState;
  label: string;
  txHash?: string;
  explorerUrl?: string;
  latencyMs?: number;
  errorMessage?: string;
  onClose?: () => void;
}

export function TxStatusToast({
  open, state, label, txHash, explorerUrl, latencyMs, errorMessage, onClose,
}: TxStatusToastProps) {
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  if (!open || state === "idle") return null;

  const copied = Boolean(txHash && copiedHash === txHash);
  const resolvedExplorerUrl = explorerUrl || (txHash ? `https://testnet.snowtrace.io/tx/${txHash}` : undefined);
  const latencyLabel =
    typeof latencyMs === "number" && Number.isFinite(latencyMs) && latencyMs >= 0
      ? `Onchain ${(latencyMs / 1000).toFixed(1)}s`
      : null;
  const detailText =
    state === "sent" ? "Đang xác nhận trên Fuji…" : state === "ok" ? "Đã xác nhận on-chain" : errorMessage || "Giao dịch thất bại";

  const handleCopy = async () => {
    if (!txHash || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(txHash);
      setCopiedHash(txHash);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopiedHash(null), 1800);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 md:bottom-6">
      <div
        role={state === "fail" ? "alert" : "status"}
        aria-live="polite"
        data-testid={`tx-${state}`}
        className="ox-sheet pointer-events-auto flex w-full max-w-md items-center gap-2.5 rounded-2xl bg-[var(--ox-ink)] px-4 py-3 text-sm text-[var(--ox-bg)] shadow-xl"
      >
        {state === "sent" ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> : null}
        {state === "ok" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 dark:text-emerald-600" aria-hidden="true" /> : null}
        {state === "fail" ? <AlertCircle className="h-4 w-4 shrink-0 text-[#f87171] dark:text-[#dc2626]" aria-hidden="true" /> : null}

        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{label}</p>
          <p className="truncate text-xs opacity-80">{detailText}</p>
        </div>

        {latencyLabel ? (
          <span className="shrink-0 rounded-full border border-current/20 px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums">
            {latencyLabel}
          </span>
        ) : null}

        {txHash ? (
          <button
            type="button"
            onClick={() => void handleCopy()}
            aria-label={copied ? "Đã sao chép mã giao dịch" : "Sao chép mã giao dịch"}
            title={copied ? "Đã sao chép" : "Sao chép txHash"}
            className="shrink-0 rounded-lg p-1.5 opacity-80 transition-opacity hover:opacity-100"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400 dark:text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        ) : null}

        {resolvedExplorerUrl ? (
          <a href={resolvedExplorerUrl} target="_blank" rel="noreferrer" aria-label="Xem trên Snowtrace Fuji" title="Xem trên Snowtrace Fuji" className="shrink-0 rounded-lg p-1.5 opacity-80 transition-opacity hover:opacity-100">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}

        {onClose ? (
          <button type="button" onClick={onClose} aria-label="Đóng thông báo" className="shrink-0 rounded-lg p-1 opacity-75 transition-opacity hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
        ) : null}
      </div>
    </div>
  );
}
