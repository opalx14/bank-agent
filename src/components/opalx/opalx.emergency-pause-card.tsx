"use client";

import { useState } from "react";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { OnChainProofBadge } from "@/components/shared/shared.onchain-proof-badge";

interface EmergencyPauseCardProps {
  paused: boolean;
  onUpdated: () => Promise<void>;
}

export function EmergencyPauseCard({ paused, onUpdated }: EmergencyPauseCardProps) {
  const [loading, setLoading] = useState(false);
  const [lastTxHash, setLastTxHash] = useState<string | undefined>();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const togglePause = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/policy/kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: !paused }),
      });
      const json = (await res.json().catch(() => ({}))) as { txHash?: string; error?: string };
      if (!res.ok) {
        setErrorMsg(json.error ?? "Bank auditor permission required.");
        return;
      }
      if (json.txHash) setLastTxHash(json.txHash);
      await onUpdated();
    } catch {
      setErrorMsg("Unable to reach kill-switch service.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ox-card flex flex-col justify-between space-y-4 rounded-2xl p-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-[var(--ox-ink)]">Kill Switch OpalXGoCore</h2>
          <span
            className={`rounded-full px-2.5 py-0.5 font-mono text-xs font-bold ${
              paused ? "ox-badge-avax" : "ox-badge-verified"
            }`}
          >
            {paused ? "PAUSED" : "ACTIVE"}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-[var(--ox-muted)]">
          Immediately pause all on-chain guarantee issuances and fee settlements on Fuji when anomalies are detected.
        </p>
      </div>

      <div className="space-y-2.5">
        {lastTxHash && <OnChainProofBadge label="Pause Tx" txHash={lastTxHash} />}
        {errorMsg && (
          <p role="alert" className="ox-badge-avax rounded-xl px-3 py-2 text-xs font-medium">
            {errorMsg}
          </p>
        )}
        <button
          type="button"
          disabled={loading}
          onClick={() => void togglePause()}
          className={`inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm disabled:opacity-60 ${
            paused ? "ox-btn-primary" : "ox-btn-avax"
          }`}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : paused ? (
            <ShieldCheck className="h-4 w-4" />
          ) : (
            <ShieldAlert className="h-4 w-4" />
          )}
          <span>{paused ? "Resume System" : "Activate Kill Switch"}</span>
        </button>
      </div>
    </div>
  );
}
