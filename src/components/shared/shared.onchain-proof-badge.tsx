"use client";

import { ExternalLink } from "lucide-react";
import { truncateHex } from "./shared.formatters";

interface OnChainProofBadgeProps {
  label: string;
  txHash?: string;
  blockNumber?: number;
}

export function OnChainProofBadge({ label, txHash, blockNumber }: OnChainProofBadgeProps) {
  if (!txHash) {
    return (
      <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-lg border border-[var(--ox-line)] bg-[var(--ox-soft)] px-2.5 py-0.5 font-mono text-[11px] text-[var(--ox-muted)]">
        {label}: Pending
      </span>
    );
  }

  return (
    <a
      href={`https://testnet.snowtrace.io/tx/${txHash}`}
      target="_blank"
      rel="noreferrer"
      className="ox-badge-verified inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-0.5 font-mono text-[11px] font-semibold transition-opacity hover:opacity-85 print:border-black print:bg-transparent print:text-black"
    >
      <span>
        {label}: {truncateHex(txHash, 5)}
        {blockNumber ? ` (#${blockNumber})` : ""}
      </span>
      <ExternalLink className="h-3 w-3 print:hidden" />
    </a>
  );
}
