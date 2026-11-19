import { z } from "zod";
import { buildSampleTt78Xml } from "@/core/enterprise/einvoice-samples";
import { findOrder, readLedger, upsertOrder } from "@/core/ledger/store";
import { buildOrderQrWithImage } from "@/core/bank/vietqr-builder";
import { reconcileAndBroadcastProofs } from "@/core/opalx/reconcile-service";
import { computeCommitmentHash } from "@/lib/avalanche/signer";
import type { EnterpriseOrder, SandboxScenario } from "@/types";

const simulateSchema = z.object({
  orderCode: z.number().int().positive().default(20260002),
  scenario: z
    .enum([
      "ALLOW_VALID",
      "DENY_INVALID_HMAC",
      "DENY_REPLAY",
      "DENY_AMOUNT_MISMATCH",
      "REQUIRE_APPROVAL_LIMIT",
    ])
    .default("ALLOW_VALID"),
  bankReference: z.string().optional(),
  invoiceXml: z.string().optional(),
  aiUnstructuredNote: z.string().optional(),
  transferEdges: z.array(z.object({ from: z.string(), to: z.string() })).optional(),
});

async function ensureOrder(orderCode: number, scenario: SandboxScenario): Promise<EnterpriseOrder> {
  const existing = findOrder(orderCode);
  if (existing) return existing;

  const amountVnd = scenario === "REQUIRE_APPROVAL_LIMIT" ? 25_000_000 : 2_000;
  const description = `OPX SIM ${orderCode}`;
  const qr = await buildOrderQrWithImage({
    orderCode,
    amountVnd,
    description,
    railMode: "SANDBOX",
  });
  const nowIso = new Date().toISOString();
  const created: EnterpriseOrder = {
    orderCode,
    amountVnd,
    description,
    sellerName: "OpalX Merchant Demo",
    sellerTaxId: "0316890123",
    sellerEnterpriseAddress: "0x78BF34e40C66b5B3Ed5f14612b927239BAC88676",
    buyerName: "Sandbox Customer",
    buyerTaxId: "0109876543",
    requireInvoiceXml: false,
    railMode: "SANDBOX",
    status: "PENDING_BANK",
    qrCode: qr.qrCode,
    qrSvgDataUrl: qr.qrSvgDataUrl,
    mobileDeeplinkUrl: qr.mobileDeeplinkUrl,
    orderCommitment: computeCommitmentHash("order", `${orderCode}:${amountVnd}:0316890123`),
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
  return upsertOrder(created);
}

export async function POST(request: Request): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON_BODY" }, { status: 400 });
  }

  const parsed = simulateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_SIMULATE_PAYLOAD", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { orderCode, scenario } = parsed.data;
  const order = await ensureOrder(orderCode, scenario);
  const ledger = readLedger();
  const effectiveOrder =
    scenario === "REQUIRE_APPROVAL_LIMIT" && order.amountVnd <= 10_000_000
      ? { ...order, amountVnd: 25_000_000 }
      : order;

  const isInvalidHmac = scenario === "DENY_INVALID_HMAC";
  const isReplay = scenario === "DENY_REPLAY";
  const isMismatch = scenario === "DENY_AMOUNT_MISMATCH";

  const seededRef = "FT2601889921_LIVE_SEED";
  const replayRef =
    isReplay && ledger.usedBankRefs.length > 0 ? seededRef : "";
  const bankReference = isReplay
    ? replayRef
    : parsed.data.bankReference?.trim() || `FT_SBX_${orderCode}_${Date.now()}`;

  const bankPaidAmountVnd = isMismatch
    ? Math.max(1000, effectiveOrder.amountVnd - 500)
    : effectiveOrder.amountVnd;

  const invoiceXml =
    parsed.data.invoiceXml ??
    (effectiveOrder.requireInvoiceXml && !parsed.data.aiUnstructuredNote
      ? buildSampleTt78Xml({
          amountVnd: effectiveOrder.amountVnd,
          sellerTaxId: effectiveOrder.sellerTaxId,
          sellerName: effectiveOrder.sellerName,
        })
      : undefined);

  try {
    const outcome = await reconcileAndBroadcastProofs({
      order: effectiveOrder,
      bankPaidAmountVnd,
      bankReference,
      webhookSignatureValid: !isInvalidHmac,
      invoiceXml,
      aiUnstructuredNote: parsed.data.aiUnstructuredNote,
      transferEdges: parsed.data.transferEdges,
      ...(scenario === "REQUIRE_APPROVAL_LIMIT" ? { autoApproveLimitVnd: 10_000_000 } : {}),
    });

    return Response.json(outcome, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to record Avalanche Fuji guarantee proof";
    return Response.json({ error: msg }, { status: 502 });
  }
}
