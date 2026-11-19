import { readLedger } from "@/core/ledger/store";

export async function GET(): Promise<Response> {
  const ledger = readLedger();
  return Response.json(
    {
      orders: ledger.orders,
      bankAttestations: ledger.bankAttestations,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
