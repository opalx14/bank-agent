"use client";

import type { BankAttestationProof } from "@/types";
import { formatUtcTime, formatVnd, truncateHex } from "@/components/shared/shared.formatters";
import { OnChainProofBadge } from "@/components/shared/shared.onchain-proof-badge";

export function BankAttestationTable({ attestations }: { attestations: BankAttestationProof[] }) {
  return (
    <section
      aria-label="Bank transaction attestation ledger"
      className="ox-card rounded-2xl p-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-[var(--ox-ink)]">
          BankGateway Attestation Ledger ({attestations.length})
        </h2>
        <span className="font-mono text-xs text-[var(--ox-muted)]">Anti-Replay FT</span>
      </div>

      {attestations.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--ox-muted)]">No bank attestations recorded yet.</p>
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {attestations.map((att) => (
              <div key={att.id} className="ox-subcard space-y-2 rounded-xl p-3.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-[var(--ox-ink)]">#{att.orderCode}</span>
                  <span className="font-mono font-bold text-[var(--ox-ok-ink)] tabular-nums">
                    {formatVnd(att.paidAmountVnd)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[var(--ox-muted)]">
                  <span>
                    FT Ref: <strong className="font-mono text-[var(--ox-ink)]">{att.bankRefMask}</strong>
                  </span>
                  <span className="font-mono">{truncateHex(att.bankRefCommitment, 4)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[var(--ox-muted)]">{formatUtcTime(att.attestedAtIso)}</span>
                  <OnChainProofBadge label="Bank" txHash={att.bankTxHash} />
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-xs tabular-nums">
              <thead>
                <tr className="border-b border-[var(--ox-line)] text-xs font-semibold text-[var(--ox-muted)]">
                  <th className="pb-2.5 pr-3">Order</th>
                  <th className="pb-2.5 pr-3">FT Ref (Masked)</th>
                  <th className="pb-2.5 pr-3">FT Commitment</th>
                  <th className="pb-2.5 pr-3 text-right">Amount</th>
                  <th className="pb-2.5 text-right">BankGateway Tx</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ox-line)]">
                {attestations.map((att) => (
                  <tr key={att.id}>
                    <td className="py-3 pr-3 font-mono font-semibold text-[var(--ox-ink)]">
                      #{att.orderCode}
                      <p className="text-[11px] font-normal text-[var(--ox-muted)]">
                        {formatUtcTime(att.attestedAtIso)}
                      </p>
                    </td>
                    <td className="py-3 pr-3 font-mono text-[var(--ox-ink)]">{att.bankRefMask}</td>
                    <td className="py-3 pr-3 font-mono text-[var(--ox-muted)]">
                      {truncateHex(att.bankRefCommitment, 6)}
                    </td>
                    <td className="py-3 pr-3 text-right font-mono font-semibold text-[var(--ox-ok-ink)]">
                      {formatVnd(att.paidAmountVnd)}
                    </td>
                    <td className="py-3 text-right">
                      <OnChainProofBadge label="Bank" txHash={att.bankTxHash} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
