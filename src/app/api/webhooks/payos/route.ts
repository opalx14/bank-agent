import type { PayosWebhookPayload } from "@/types";
import { verifyPayosWebhookSignature } from "@/core/bank/bank.payos-webhook";
import { findOrder } from "@/core/ledger/ledger.store";
import { reconcileAndBroadcastProofs } from "@/core/opalx/opalx.reconcile";

export async function POST(request: Request): Promise<Response> {
  let payload: PayosWebhookPayload;
  try {
    payload = (await request.json()) as PayosWebhookPayload;
  } catch {
    return Response.json({ error: "INVALID_JSON_BODY" }, { status: 400 });
  }

  if (!payload?.data || typeof payload.data.orderCode !== "number") {
    return Response.json({ error: "MISSING_WEBHOOK_DATA" }, { status: 400 });
  }

  const checksumKey = process.env.PAYOS_CHECKSUM_KEY?.trim() ?? "";
  const hmacValid = verifyPayosWebhookSignature(payload, checksumKey);
  if (!hmacValid) {
    return Response.json(
      { error: "INVALID_PAYOS_HMAC_SIGNATURE", verified: false },
      { status: 401 },
    );
  }

  const order = findOrder(payload.data.orderCode);
  if (!order) {
    return Response.json(
      { error: "ORDER_NOT_FOUND", orderCode: payload.data.orderCode },
      { status: 404 },
    );
  }

  const outcome = await reconcileAndBroadcastProofs({
    order,
    bankPaidAmountVnd: Math.round(Number(payload.data.amount || 0)),
    bankReference: String(payload.data.reference || ""),
    webhookSignatureValid: true,
  });

  return Response.json(outcome, { status: 200 });
}
