import type { SepayWebhookPayload } from "@/types";
import {
  resolveSepayOrderCode,
  verifySepayAuthHeader,
} from "@/core/bank/sepay-webhook";
import { findOrder } from "@/core/ledger/store";
import { reconcileAndBroadcastProofs } from "@/core/opalx/reconcile-service";

export async function POST(request: Request): Promise<Response> {
  let payload: SepayWebhookPayload;
  try {
    payload = (await request.json()) as SepayWebhookPayload;
  } catch {
    return Response.json({ error: "INVALID_JSON_BODY" }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return Response.json({ error: "INVALID_SEPAY_PAYLOAD" }, { status: 400 });
  }

  const authValid = verifySepayAuthHeader(
    request.headers.get("authorization"),
    process.env.SEPAY_WEBHOOK_API_KEY,
  );
  if (!authValid) {
    return Response.json(
      { error: "UNAUTHORIZED_SEPAY_WEBHOOK", verified: false },
      { status: 401 },
    );
  }

  if (String(payload.transferType ?? "").trim().toLowerCase() === "out") {
    return Response.json(
      { ignored: true, reason: "OUTGOING_TRANSFER" },
      { status: 200 },
    );
  }

  const orderCode = resolveSepayOrderCode(payload);
  if (orderCode === null) {
    return Response.json(
      { error: "ORDER_CODE_NOT_FOUND_IN_CONTENT" },
      { status: 404 },
    );
  }

  const order = findOrder(orderCode);
  if (!order) {
    return Response.json(
      { error: "ORDER_NOT_FOUND", orderCode },
      { status: 404 },
    );
  }

  const rawRef =
    (typeof payload.referenceCode === "string" && payload.referenceCode.trim()) ||
    (payload.id !== undefined && payload.id !== null && String(payload.id).trim()) ||
    `SEPAY_${orderCode}_${Date.now()}`;

  const outcome = await reconcileAndBroadcastProofs({
    order,
    bankPaidAmountVnd: Math.round(Number(payload.transferAmount || 0)),
    bankReference: rawRef,
    webhookSignatureValid: true,
  });

  return Response.json({ success: true, ...outcome }, { status: 200 });
}
