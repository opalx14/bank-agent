import { readLedger } from "@/core/ledger/store";

export async function GET(): Promise<Response> {
  const ledger = readLedger();
  return Response.json(
    {
      guarantees: ledger.guarantees,
      bankAttestations: ledger.bankAttestations,
      auditLogs: ledger.auditLogs,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
