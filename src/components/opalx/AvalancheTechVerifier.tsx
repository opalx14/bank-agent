"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import type { AvalancheStackVerification } from "@/types";
import { AvalanchePillarGrid } from "./AvalanchePillarGrid";

interface AvalancheTechVerifierProps {
  guaranteeId?: string;
  compact?: boolean;
  defaultOpen?: boolean;
}

export function AvalancheTechVerifier({
  guaranteeId,
  compact = false,
  defaultOpen = true,
}: AvalancheTechVerifierProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AvalancheStackVerification | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);

  const verifyStack = useCallback(async () => {
    setLoading(true);
    setError(null);
    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
      const qs = guaranteeId ? `?guaranteeId=${encodeURIComponent(guaranteeId)}` : "";
      const res = await fetch(`/api/avalanche/verify-stack${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Unable to verify Avalanche Stack (${res.status})`);
      const json = (await res.json()) as AvalancheStackVerification;
      const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
      setLatencyMs(Math.max(1, Math.round(elapsed)));
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to Avalanche Fuji verifier.");
    } finally {
      setLoading(false);
    }
  }, [guaranteeId]);

  useEffect(() => {
    if (open && !data) void verifyStack();
  }, [open, data, verifyStack]);

  useEffect(() => {
    const onOpenVerifier = () => {
      setOpen(true);
      void verifyStack();
      window.setTimeout(() => {
        containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    };
    window.addEventListener("opalx:open-verifier", onOpenVerifier);
    return () => window.removeEventListener("opalx:open-verifier", onOpenVerifier);
  }, [verifyStack]);

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(key);
      window.setTimeout(() => setCopiedId((prev) => (prev === key ? null : prev)), 1600);
    } catch {
      // Ignore clipboard failures in restricted environments.
    }
  };

  const rpcLive = Boolean(data?.rpcHealthy && data.liveBlockNumber !== null);

  return (
    <section
      ref={containerRef}
      id="avalanche-verifier"
      aria-label="6-Pillar Avalanche Fuji Verifier"
      className="ox-card space-y-4 rounded-3xl p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold text-[var(--ox-ink)]">
              <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
                {rpcLive && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                    error ? "bg-[var(--ox-avax)]" : rpcLive ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
              </span>
              <span>Avalanche Fuji · 43113</span>
            </span>

            {data && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${
                  rpcLive ? "bg-[var(--ox-ok-tint)] text-[var(--ox-ok-ink)]" : "bg-[var(--ox-soft)] text-[var(--ox-muted)]"
                }`}
              >
                <span>
                  {data.liveBlockNumber !== null
                    ? `#${data.liveBlockNumber.toLocaleString("en-US")}`
                    : "Standby"}
                </span>
                {latencyMs !== null && <span>· {latencyMs}ms</span>}
                {data.gasPriceGwei !== null && <span>· {data.gasPriceGwei} Gwei</span>}
              </span>
            )}

            {data?.guaranteeChecked && (
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${
                  data.guaranteeChecked.onChainValid
                    ? "bg-[var(--ox-ok-tint)] text-[var(--ox-ok-ink)]"
                    : "bg-[var(--ox-soft)] text-[var(--ox-muted)]"
                }`}
              >
                {data.guaranteeChecked.guaranteeId}:{" "}
                {data.guaranteeChecked.onChainValid ? "On-Chain OK" : data.guaranteeChecked.source}
              </span>
            )}
          </div>

          <h2 className="text-base font-bold tracking-tight text-[var(--ox-ink)] sm:text-lg">
            6-Pillar Avalanche Fuji Verifier
          </h2>
          <p className="text-xs text-[var(--ox-muted)]">
            Live verification of Fuji RPC, 3 Gateway Contracts, Rust WASM, ERC-8004, USDC x402, and Passkey P-256.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              if (!open) setOpen(true);
              void verifyStack();
            }}
            className="ox-btn-avax inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>{loading ? "Verifying..." : "Verify RPC"}</span>
          </button>

          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((prev) => !prev)}
            className="ox-btn-ghost inline-flex min-h-[36px] items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold"
          >
            <span>{open ? "Collapse" : "Expand"}</span>
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-2xl bg-[var(--ox-avax-tint)] px-3.5 py-2 text-xs font-medium text-[var(--ox-avax-ink)]">
          {error}
        </p>
      )}

      {open && (
        <div className="border-t border-[var(--ox-line)] pt-3.5">
          {!data && loading ? (
            <div className="space-y-1.5">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="h-12 animate-pulse rounded-xl bg-[var(--ox-soft)]" />
              ))}
            </div>
          ) : data ? (
            <AvalanchePillarGrid
              data={data}
              compact={compact}
              copiedId={copiedId}
              onCopy={(k, v) => void handleCopy(k, v)}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
