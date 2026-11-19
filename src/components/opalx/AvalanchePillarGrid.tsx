"use client";

import {
  Award,
  Check,
  Coins,
  Copy,
  Cpu,
  ExternalLink,
  KeyRound,
  Layers,
  Radio,
} from "lucide-react";
import type { AvalancheStackVerification, AvalancheTechPillar } from "@/types";
import { truncateHex } from "@/components/shared/formatters";

const PILLAR_ICONS: Record<AvalancheTechPillar["id"], typeof Radio> = {
  FUJI_CHAIN: Radio,
  THREE_GATEWAYS: Layers,
  WASM_KERNEL: Cpu,
  ERC_8004: Award,
  X402_USDC: Coins,
  PASSKEY_P256: KeyRound,
};

function formatProofRef(raw: string): string {
  if (/^0x[a-fA-F0-9]{20,}$/.test(raw)) return truncateHex(raw, 6);
  return raw;
}

interface AvalanchePillarGridProps {
  data: AvalancheStackVerification;
  compact?: boolean;
  copiedId: string | null;
  onCopy: (key: string, value: string) => void;
}

export function AvalanchePillarGrid({
  data,
  compact = false,
  copiedId,
  onCopy,
}: AvalanchePillarGridProps) {
  const verifiedCount = data.pillars.filter((p) => p.status === "VERIFIED").length;
  const gatewayLinks = [
    ["EnterpriseGW", data.contracts.enterpriseGateway],
    ["BankGW", data.contracts.bankGateway],
    ["OpalXCore", data.contracts.opalxCore],
  ] as const;

  return (
    <div className="space-y-3.5">
      <div className={`grid grid-cols-2 gap-2 ${compact ? "sm:grid-cols-3" : "sm:grid-cols-3"}`}>
        <div className="rounded-2xl bg-[var(--ox-soft)] px-3 py-2.5">
          <div className="font-mono text-sm font-bold text-[var(--ox-ink)] tabular-nums sm:text-base">
            {data.liveBlockNumber !== null ? `#${data.liveBlockNumber.toLocaleString("en-US")}` : "43113"}
          </div>
          <div className="text-[11px] text-[var(--ox-muted)]">
            {data.rpcHealthy ? "Fuji Block Live" : "Fuji Standby"}
          </div>
        </div>
        <div className="rounded-2xl bg-[var(--ox-soft)] px-3 py-2.5">
          <div className="font-mono text-sm font-bold text-[var(--ox-ok-ink)] tabular-nums sm:text-base">
            {verifiedCount}/{data.pillars.length}
          </div>
          <div className="text-[11px] text-[var(--ox-muted)]">Verified Pillars</div>
        </div>
        <div className="col-span-2 rounded-2xl bg-[var(--ox-soft)] px-3 py-2.5 sm:col-span-1">
          <div className="font-mono text-sm font-bold text-[var(--ox-ink)] sm:text-base">
            {data.wasmPolicyKernel.verdictSample}
          </div>
          <div className="text-[11px] text-[var(--ox-muted)]">
            {data.wasmPolicyKernel.wasmExecuted ? "Rust WASM · 0 PII" : "Guard Fallback · 0 PII"}
          </div>
        </div>
      </div>

      <ul className="divide-y divide-[var(--ox-line)]">
        {data.pillars.map((pillar) => {
          const Icon = PILLAR_ICONS[pillar.id];
          const verified = pillar.status === "VERIFIED";
          const isCopied = copiedId === pillar.id;
          return (
            <li
              key={pillar.id}
              data-pillar={pillar.id}
              className="flex flex-col gap-2 py-2.5 transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-3"
            >
              <div className="flex min-w-0 items-start gap-2.5 sm:items-center">
                <span
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full sm:mt-0 ${
                    verified
                      ? "bg-[var(--ox-ok-tint)] text-[var(--ox-ok-ink)]"
                      : "bg-[var(--ox-warn-tint)] text-[var(--ox-warn-ink)]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="truncate text-xs font-bold text-[var(--ox-ink)]">{pillar.title}</h3>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${
                        verified
                          ? "bg-[var(--ox-ok-tint)] text-[var(--ox-ok-ink)]"
                          : "bg-[var(--ox-warn-tint)] text-[var(--ox-warn-ink)]"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${verified ? "bg-emerald-500" : "bg-amber-500"}`}
                        aria-hidden="true"
                      />
                      <span>{pillar.status}</span>
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-[var(--ox-muted)]">{pillar.summary}</p>
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-between gap-1.5 pl-9 sm:justify-end sm:pl-0">
                <code
                  className="max-w-[170px] truncate rounded-lg bg-[var(--ox-soft)] px-2 py-1 font-mono text-[11px] text-[var(--ox-ink)] tabular-nums"
                  title={pillar.proofRef}
                >
                  {formatProofRef(pillar.proofRef)}
                </code>
                <button
                  type="button"
                  onClick={() => onCopy(pillar.id, pillar.proofRef)}
                  aria-label={`Copy ${pillar.title}`}
                  className="ox-press inline-flex h-7 items-center gap-1 rounded-lg bg-[var(--ox-soft)] px-2 font-mono text-[10px] font-semibold text-[var(--ox-ink)] hover:opacity-80"
                >
                  {isCopied ? <Check className="h-3 w-3 text-[var(--ox-ok-ink)]" /> : <Copy className="h-3 w-3" />}
                  <span>{isCopied ? "Copied" : "Copy"}</span>
                </button>
                {pillar.explorerUrl && (
                  <a
                    href={pillar.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`View ${pillar.title} on Snowtrace`}
                    className="ox-press inline-flex h-7 items-center gap-1 rounded-lg bg-[var(--ox-soft)] px-2 font-mono text-[10px] font-semibold text-[var(--ox-ink)] hover:text-[var(--ox-avax)]"
                  >
                    <span>Snowtrace</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ox-line)] pt-3 font-mono text-[11px] text-[var(--ox-muted)]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {gatewayLinks.map(([label, addr]) => (
            <a
              key={label}
              href={`https://testnet.snowtrace.io/address/${addr}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-[var(--ox-avax)]"
            >
              <span>{label}:</span>
              <span className="font-semibold text-[var(--ox-ink)] tabular-nums">{truncateHex(addr, 4)}</span>
            </a>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={data.erc8004.agentCardEndpoint}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-[var(--ox-ok-ink)] hover:underline"
          >
            <span>ERC-8004 Agent Card</span>
            <ExternalLink className="h-3 w-3" />
          </a>
          <span className="tabular-nums">
            x402: {data.x402.domainName} v{data.x402.domainVersion}
          </span>
        </div>
      </div>
    </div>
  );
}
