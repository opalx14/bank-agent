import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { z } from "zod";
import {
  DEFAULT_X402_MAX_SPEND_UNITS, DEFAULT_X402_PRICE_UNITS, FUJI_CAIP2,
  FUJI_USDC_ADDRESS, FUJI_USDC_EIP712_EXTRA, buildFujiPaymentRequired,
  decodePaymentSignatureHeader, getPrimaryFacilitatorUrl, getX402PayToAddress,
  signFujiX402Payment, verifyAndSettleFujiX402,
} from "@/lib/avalanche/avalanche.x402";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const SettleBodySchema = z.union([
  z.object({
    mode: z.literal("demo-buyer-agent"),
    guaranteeId: z.string().trim().min(1).optional(),
    overrideAmountUnits: z.string().trim().regex(/^\d+$/).optional(),
  }),
  z.object({
    paymentSignatureHeader: z.string().trim().min(1),
    guaranteeId: z.string().trim().min(1).optional(),
  }),
  z.object({
    paymentPayload: z.record(z.unknown()),
    paymentRequirements: z.object({
      scheme: z.string().min(1), network: z.string().includes(":"),
      asset: z.string().min(1), amount: z.string().min(1), payTo: z.string().min(1),
      maxTimeoutSeconds: z.number(), extra: z.record(z.unknown()),
    }),
  }),
]);

export async function GET(): Promise<Response> {
  return Response.json(
    {
      protocol: "x402", version: 2, network: FUJI_CAIP2, asset: FUJI_USDC_ADDRESS,
      eip712Extra: FUJI_USDC_EIP712_EXTRA, defaultPriceUsdc: "0.01",
      defaultPriceUnits: DEFAULT_X402_PRICE_UNITS, payTo: getX402PayToAddress(),
      resourceEndpoint: "/api/x402/audit-proof", primaryFacilitator: getPrimaryFacilitatorUrl(),
      selfHostedFallback: true,
    },
    { status: 200, headers: NO_STORE },
  );
}

export async function POST(request: Request): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ ok: false, error: "INVALID_JSON" }, { status: 400, headers: NO_STORE });
  }

  const parsed = SettleBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "INVALID_X402_SETTLE_BODY", issues: parsed.error.issues }, { status: 400, headers: NO_STORE });
  }

  const origin = new URL(request.url).origin;
  const data = parsed.data;

  if ("mode" in data) {
    const gid = data.guaranteeId || "OPX-2026-0001";
    const { paymentRequired } = buildFujiPaymentRequired(
      `${origin}/api/x402/audit-proof?guaranteeId=${encodeURIComponent(gid)}`,
      `OpalX GO Fuji 3-Gateway Audit Proof (${gid})`,
      data.overrideAmountUnits ?? DEFAULT_X402_PRICE_UNITS,
    );
    const req0 = paymentRequired.accepts[0]!;
    let signed: Awaited<ReturnType<typeof signFujiX402Payment>>;
    try {
      signed = await signFujiX402Payment({ paymentRequired });
    } catch (err) {
      return Response.json(
        { ok: false, blockedBySpendControls: true, error: err instanceof Error ? err.message : "SPEND_CONTROLS_REJECTED", maxAllowedUnits: DEFAULT_X402_MAX_SPEND_UNITS },
        { status: 400, headers: NO_STORE },
      );
    }
    const settleRes = await verifyAndSettleFujiX402(signed.paymentPayload, req0);
    if (!settleRes.isValid) return Response.json({ ok: false, ...settleRes }, { status: 402, headers: NO_STORE });
    const auth = (signed.paymentPayload.payload as { authorization: Record<string, unknown> }).authorization;
    return Response.json(
      {
        ok: true,
        paymentSignatureHeader: signed.paymentSignatureHeader,
        paymentResponseHeader: settleRes.paymentResponseHeader,
        handshake: {
          step1Challenge402: { status: 402, amountUnits: req0.amount, asset: FUJI_USDC_ADDRESS, eip712Extra: FUJI_USDC_EIP712_EXTRA, payTo: req0.payTo },
          step2SignedPayload: { payer: signed.payer, nonce: auth.nonce, validBefore: auth.validBefore, value: auth.value },
          step3Verification: {
            isValid: settleRes.isValid, settled: settleRes.settled, settlementMode: settleRes.settlementMode,
            transaction: settleRes.transaction, payer: settleRes.payer, network: settleRes.network,
          },
        },
      },
      { status: 200, headers: { ...NO_STORE, "PAYMENT-RESPONSE": settleRes.paymentResponseHeader } },
    );
  }

  let payload: PaymentPayload;
  let requirements: PaymentRequirements;
  if ("paymentSignatureHeader" in data) {
    try {
      payload = decodePaymentSignatureHeader(data.paymentSignatureHeader);
    } catch {
      return Response.json({ ok: false, error: "MALFORMED_PAYMENT_SIGNATURE_HEADER" }, { status: 400, headers: NO_STORE });
    }
    const gid = data.guaranteeId || "OPX-2026-0001";
    requirements = buildFujiPaymentRequired(
      `${origin}/api/x402/audit-proof?guaranteeId=${encodeURIComponent(gid)}`,
      `OpalX GO Fuji 3-Gateway Audit Proof (${gid})`,
    ).paymentRequired.accepts[0]!;
  } else {
    payload = data.paymentPayload as PaymentPayload;
    requirements = data.paymentRequirements as PaymentRequirements;
  }

  const res = await verifyAndSettleFujiX402(payload, requirements);
  if (!res.isValid) return Response.json({ ok: false, ...res }, { status: 402, headers: NO_STORE });
  return Response.json({ ok: true, ...res }, { status: 200, headers: { ...NO_STORE, "PAYMENT-RESPONSE": res.paymentResponseHeader } });
}
