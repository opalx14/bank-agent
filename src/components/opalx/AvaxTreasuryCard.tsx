"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { AvaxFeeSettlementReceipt, AvaxTreasurySnapshot, GuaranteeCertificate } from "@/types";
import { useAccountMode } from "@/components/layout/AccountModeProvider";
import { BrandOrb } from "@/components/shared/BrandOrb";
import { formatAvax, formatVnd, getCreditTierLabel, truncateHex } from "@/components/shared/formatters";
import { OnChainProofBadge } from "@/components/shared/OnChainProofBadge";
import { CountUpValue, RadialRing } from "@/components/shared/ui-kit";

interface AvaxTreasuryCardProps {
  snapshot: AvaxTreasurySnapshot | null;
  guarantees: GuaranteeCertificate[];
  onSettled: () => Promise<void>;
}

export function AvaxTreasuryCard({ snapshot, guarantees, onSettled }: AvaxTreasuryCardProps) {
  const { activeProfile } = useAccountMode();
  const [selectedId, setSelectedId] = useState(guarantees[0]?.guaranteeId ?? "OPX-2026-0001");
  const [settling, setSettling] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<AvaxFeeSettlementReceipt | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const syncedHeadRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const head = guarantees[0]?.guaranteeId;
    if (!head) return;
    const hasCurrent = guarantees.some((g) => g.guaranteeId === selectedId);
    if (!hasCurrent || head !== syncedHeadRef.current) {
      syncedHeadRef.current = head;
      setSelectedId(head);
    }
  }, [guarantees, selectedId]);

  const rawRatio = snapshot
    ? snapshot.utilizationBps > 0
      ? snapshot.utilizationBps / 10000
      : snapshot.totalReserveAvax > 0
        ? snapshot.lockedCollateralAvax / snapshot.totalReserveAvax
        : 0
    : 0;
  const utilizationRatio = Math.max(0, Math.min(1, rawRatio));
  const isLiveBank = activeProfile.railMode === "LIVE_BANK";
  const paused = Boolean(snapshot?.vaultPaused);

  const handleSettleFee = async () => {
    setErrorMsg(null);
    setSettling(true);
    try {
      const targetId = selectedId || guarantees[0]?.guaranteeId || "OPX-2026-0001";
      const res = await fetch("/api/avax/settle-fee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guaranteeId: targetId }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; receipt?: AvaxFeeSettlementReceipt };
      if (!res.ok || !json.receipt) throw new Error(json.error ?? "AVAX fee settlement failed");
      setLastReceipt(json.receipt);
      await onSettled();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "AVAX settlement error");
    } finally {
      setSettling(false);
    }
  };

  const telemetryRows = [
    { label: "Available Reserve", value: formatAvax(snapshot?.availableReserveAvax ?? 0.005, 5) },
    { label: "Daily Allowance Left", value: formatAvax(snapshot?.remainingDailyAllowanceAvax ?? 0.05, 4) },
    { label: "Internal FX Rate", value: `1 AVAX = ${formatVnd(snapshot?.vndPerAvaxRate ?? 600_000)}` },
  ];

  return (
    <div className="ox-card space-y-4 rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BrandOrb seed={snapshot?.contracts?.opalxCore || "fuji-treasury"} label="Fuji Treasury" size={38} />
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-[var(--ox-ink)]">Guarantee Vault &amp; 100% AVAX Fees</h2>
            <p className="truncate font-mono text-[11px] text-[var(--ox-muted)] tabular-nums">
              OpalXCore {truncateHex(snapshot?.contracts?.opalxCore, 4)} · 0 PII On-Chain
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ox-soft)] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--ox-ink)] tabular-nums">
            <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
              {!paused && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${paused ? "bg-[var(--ox-avax)]" : "bg-emerald-500"}`} />
            </span>
            <span>Fuji 43113{snapshot?.liveFujiBlockNumber ? ` · #${snapshot.liveFujiBlockNumber.toLocaleString("en-US")}` : ""}</span>
          </span>
          <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${isLiveBank ? "bg-[var(--ox-ok-tint)] text-[var(--ox-ok-ink)]" : "bg-[var(--ox-warn-tint)] text-[var(--ox-warn-ink)]"}`}>
            {activeProfile.badgeLabel}
          </span>
          <span className="ox-badge-info rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold">
            {snapshot ? getCreditTierLabel(snapshot.creditTier) : "STANDARD"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--ox-soft)] px-4 py-3">
        <div className="flex items-center gap-3">
          <RadialRing value={utilizationRatio} size={44} stroke={4.5} danger={utilizationRatio > 0.85} label="AVAX Collateral Utilization" />
          <div className="leading-tight">
            <p className="text-[11px] font-medium text-[var(--ox-muted)]">Collateral Utilization</p>
            <p className="font-mono text-base font-bold text-[var(--ox-ink)] tabular-nums">
              <CountUpValue value={utilizationRatio * 100} format={(n) => `${n.toFixed(1)}%`} />
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs tabular-nums">
          <div>
            <span className="text-[10px] text-[var(--ox-muted)]">Reserve AVAX</span>
            <p className="font-bold text-[var(--ox-ink)]">
              <CountUpValue value={snapshot?.totalReserveAvax ?? 0.005} format={(n) => formatAvax(n, 4)} />
            </p>
          </div>
          <div>
            <span className="text-[10px] text-[var(--ox-muted)]">Locked</span>
            <p className="font-bold text-[var(--ox-warn-ink)]">
              <CountUpValue value={snapshot?.lockedCollateralAvax ?? 0} format={(n) => formatAvax(n, 5)} />
            </p>
          </div>
        </div>
      </div>

      <dl className="divide-y divide-[var(--ox-line)] font-mono text-xs tabular-nums">
        <div className="flex items-center justify-between gap-3 py-2">
          <dt className="text-[var(--ox-muted)]">Protocol Fee Pool</dt>
          <dd className="font-bold text-[var(--ox-ok-ink)]">
            <CountUpValue value={snapshot?.protocolFeePoolAvax ?? 0} format={(n) => formatAvax(n, 5)} />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 py-2">
          <dt className="text-[var(--ox-muted)]">Guaranteed VND</dt>
          <dd className="font-bold text-[var(--ox-ink)]">
            <CountUpValue value={snapshot?.guaranteedCoverageVnd ?? 0} format={formatVnd} />
          </dd>
        </div>
        {telemetryRows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 py-2">
            <dt className="text-[var(--ox-muted)]">{row.label}</dt>
            <dd className="font-semibold text-[var(--ox-ink)]">{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2.5 border-t border-[var(--ox-line)] pt-3 sm:flex-row sm:items-center">
        <select
          aria-label="Select guarantee ID for AVAX verification fee"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="ox-input min-h-[44px] flex-1 rounded-xl px-3.5 py-2 font-mono text-xs"
        >
          {guarantees.map((g) => (
            <option key={g.guaranteeId} value={g.guaranteeId}>
              {g.guaranteeId} ({formatVnd(g.amountVnd)})
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={settling || guarantees.length === 0}
          onClick={() => void handleSettleFee()}
          className="ox-btn-primary inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs disabled:opacity-50"
        >
          {settling && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          <span>Settle Fee ({snapshot?.minVerificationFeeAvax ?? 0.00001} AVAX)</span>
        </button>
      </div>

      {errorMsg && <p className="text-xs font-medium text-[var(--ox-avax-ink)]">{errorMsg}</p>}
      {lastReceipt && (
        <div className="ox-badge-verified flex flex-wrap items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-xs">
          <span className="font-medium tabular-nums">
            Settled {lastReceipt.feeAvax} AVAX ({lastReceipt.mode})
          </span>
          <OnChainProofBadge label="Fee Tx" txHash={lastReceipt.txHash} blockNumber={lastReceipt.blockNumber} />
        </div>
      )}
    </div>
  );
}
