import { findGuarantee } from "@/core/ledger/ledger.store";
import { verifyGuaranteeOnFuji } from "@/lib/avalanche/avalanche.reader";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const decodedId = decodeURIComponent(id);
  const guarantee = findGuarantee(decodedId);
  const onChain = await verifyGuaranteeOnFuji(decodedId);

  if (!guarantee && !onChain.valid && (onChain.issuedAt ?? 0) === 0) {
    return Response.json(
      { error: "GUARANTEE_NOT_FOUND", guaranteeId: decodedId },
      { status: 404 },
    );
  }

  return Response.json(
    { guarantee: guarantee ?? null, onChain },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
