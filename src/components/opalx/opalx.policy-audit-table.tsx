"use client";

import type { GuaranteeCertificate, PolicyAuditLogEntry } from "@/types";
import { formatUtcTime, formatVnd, getVerdictBadgeClasses } from "@/components/shared/shared.formatters";
import { OnChainProofBadge } from "@/components/shared/shared.onchain-proof-badge";

export function PolicyAuditTable({
  auditLogs,
}: {
  guarantees?: GuaranteeCertificate[];
  auditLogs: PolicyAuditLogEntry[];
}) {
  return (
    <section className="ox-card rounded-2xl p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-[var(--ox-ink)]">
          Policy Kernel Audit Log ({auditLogs.length})
        </h2>
        <span className="font-mono text-xs text-[var(--ox-muted)]">Rust WASM Deterministic</span>
      </div>

      {auditLogs.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--ox-muted)]">No policy audit logs yet.</p>
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {auditLogs.map((log) => (
              <div key={log.id} className="ox-subcard space-y-2 rounded-xl p-3.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-[var(--ox-ink)] tabular-nums">
                    #{log.orderCode} · {formatVnd(log.amountVnd)}
                  </span>
                  <span className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-bold ${getVerdictBadgeClasses(log.verdict)}`}>
                    {log.verdict}
                  </span>
                </div>
                <p className="font-mono text-[var(--ox-ink)]">Reason: {log.reasonCode}</p>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[var(--ox-muted)]">{formatUtcTime(log.createdAtIso)}</span>
                  <OnChainProofBadge label="Proof" txHash={log.txHash} />
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-xs tabular-nums">
              <thead>
                <tr className="border-b border-[var(--ox-line)] text-xs font-semibold text-[var(--ox-muted)]">
                  <th className="pb-2.5 pr-3">Timestamp</th>
                  <th className="pb-2.5 pr-3">Order</th>
                  <th className="pb-2.5 pr-3">Verdict</th>
                  <th className="pb-2.5 pr-3">Reason</th>
                  <th className="pb-2.5 text-right">Proof</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ox-line)]">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-3 pr-3 font-mono text-[var(--ox-muted)]">{formatUtcTime(log.createdAtIso)}</td>
                    <td className="py-3 pr-3 font-mono font-semibold text-[var(--ox-ink)]">#{log.orderCode}</td>
                    <td className="py-3 pr-3">
                      <span className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-bold ${getVerdictBadgeClasses(log.verdict)}`}>
                        {log.verdict}
                      </span>
                    </td>
                    <td className="py-3 pr-3 font-mono text-[var(--ox-ink)]">{log.reasonCode}</td>
                    <td className="py-3 text-right">
                      <OnChainProofBadge label="Proof" txHash={log.txHash} />
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
