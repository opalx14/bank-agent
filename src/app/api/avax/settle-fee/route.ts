import { z } from "zod";
import { attachFeeTxToGuarantee, findGuarantee } from "@/core/ledger/store";
import { broadcastVerificationFeeAvax } from "@/lib/avalanche/broadcaster";
import { AVALANCHE_FUJI_NETWORK, getGatewayAddresses } from "@/lib/avalanche/network";

const feeSchema = z.object({
  guaranteeId: z.string().trim().min(3),
});

export async function GET(): Promise<Response> {
  return Response.json(
    {
      chainId: AVALANCHE_FUJI_NETWORK.chainId,
      currency: "AVAX",
      minVerificationFeeAvax: AVALANCHE_FUJI_NETWORK.minVerificationFeeAvax,
      opalxCoreAddress: getGatewayAddresses().opalxCore,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON_BODY" }, { status: 400 });
  }

  const parsed = feeSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: "INVALID_FEE_PAYLOAD" }, { status: 400 });
  }

  const target = findGuarantee(parsed.data.guaranteeId);
  if (!target) {
    return Response.json({ error: "GUARANTEE_NOT_FOUND" }, { status: 404 });
  }

  const receipt = await broadcastVerificationFeeAvax(target.guaranteeId);
  attachFeeTxToGuarantee(target.guaranteeId, receipt.txHash);

  return Response.json({ settled: true, receipt }, { status: 200 });
}
