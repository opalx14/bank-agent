"use client";

import { ExternalLink } from "lucide-react";
import type { AvaxTreasurySnapshot } from "@/types";
import { truncateHex } from "@/components/shared/formatters";

export function ContractAddressesBar({ snapshot }: { snapshot: AvaxTreasurySnapshot | null }) {
  if (!snapshot) return null;
  const items = [
    { label: "EnterpriseGateway", addr: snapshot.contracts.enterpriseGateway },
    { label: "BankGateway", addr: snapshot.contracts.bankGateway },
    { label: "OpalXGoCore", addr: snapshot.contracts.opalxCore },
  ];

  return (
    <div className="ox-card flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {items.map((item) => (
          <a
            key={item.label}
            href={`https://testnet.snowtrace.io/address/${item.addr}`}
            target="_blank"
            rel="noreferrer"
            className="ox-subcard inline-flex min-h-[34px] items-center gap-1.5 rounded-xl px-3 py-1.5 font-mono text-xs transition-colors hover:border-[var(--ox-avax)]"
          >
            <span className="text-[var(--ox-muted)]">{item.label}:</span>
            <span className="font-semibold text-[var(--ox-ink)]">{truncateHex(item.addr, 5)}</span>
            <ExternalLink className="h-3 w-3 text-[var(--ox-muted)]" />
          </a>
        ))}
      </div>
      {snapshot.liveFujiBlockNumber && (
        <span className="font-mono text-xs text-[var(--ox-muted)] tabular-nums">
          Fuji Block #{snapshot.liveFujiBlockNumber}
        </span>
      )}
    </div>
  );
}
