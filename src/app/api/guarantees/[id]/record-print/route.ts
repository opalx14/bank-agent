import { findGuarantee, recordGuaranteePrintFee } from "@/core/ledger/store";
import { computePrintFeeBreakdown } from "@/core/opalx/print-fee";
import { broadcastVerificationFeeAvax } from "@/lib/avalanche/broadcaster";
import { computeCommitmentHash } from "@/lib/avalanche/signer";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const decodedId = decodeURIComponent(id).trim();
  const target = findGuarantee(decodedId);

  if (!target) {
    return Response.json({ error: "GUARANTEE_NOT_FOUND" }, { status: 404 });
  }

  const nextPrintNumber = (target.printCount ?? 0) + 1;
  const printHash = computeCommitmentHash(
    "invoice",
    `reconciliation-print:${target.guaranteeId}:${target.orderCommitment}:${nextPrintNumber}`,
  );
  const receipt = await broadcastVerificationFeeAvax(target.guaranteeId);
  const updated = recordGuaranteePrintFee({
    guaranteeId: target.guaranteeId,
    printHash,
    txHash: receipt.txHash,
  });
  const feeBreakdown = computePrintFeeBreakdown(updated?.printCount ?? nextPrintNumber);

  return Response.json(
    {
      printed: true,
      guarantee: updated ?? target,
      printHash,
      receipt,
      feeBreakdown,
    },
    { status: 200 },
  );
}
