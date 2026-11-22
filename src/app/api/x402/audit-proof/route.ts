import type { PaymentPayload } from "@x402/core/types";
import { findGuarantee } from "@/core/ledger/ledger.store";
import { evaluateThreeWayPolicy } from "@/core/opalx/opalx.policy-bridge";
import { buildAgentRegistrationCard } from "@/lib/avalanche/avalanche.agent-card";
import { getGatewayAddresses } from "@/lib/avalanche/avalanche.network";
import { verifyGuaranteeOnFuji, type OnChainGuaranteeVerification } from "@/lib/avalanche/avalanche.reader";
import {
  FUJI_USDC_ADDRESS,
  buildFujiPaymentRequired,
  decodePaymentSignatureHeader,
  verifyAndSettleFujiX402,
} from "@/lib/avalanche/avalanche.x402";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const guaranteeId = url.searchParams.get("guaranteeId")?.trim() || "OPX-2026-0001";
  const sigHeader = request.headers.get("payment-signature") ?? request.headers.get("x-payment");

  const { paymentRequired, paymentRequiredHeader } = buildFujiPaymentRequired(
    request.url,
    `OpalX GO Fuji 3-Gateway Audit Proof (${guaranteeId})`,
  );
  const challengeHeaders = {
    "PAYMENT-REQUIRED": paymentRequiredHeader,
    "Cache-Control": "no-store",
  } as const;

  if (!sigHeader) {
    return Response.json(
      {
        error: "PAYMENT_REQUIRED",
        x402Version: 2,
        paymentRequired,
        instructions:
          "Sign EIP-3009 USDC authorization on eip155:43113 and retry with PAYMENT-SIGNATURE header.",
      },
      { status: 402, headers: challengeHeaders },
    );
  }

  let decoded: PaymentPayload;
  try {
    decoded = decodePaymentSignatureHeader(sigHeader);
  } catch {
    return Response.json(
      { error: "PAYMENT_REJECTED", invalidReason: "MALFORMED_PAYMENT_SIGNATURE_HEADER" },
      { status: 402, headers: challengeHeaders },
    );
  }

  const requirement = paymentRequired.accepts[0]!;
  const res = await verifyAndSettleFujiX402(decoded, requirement);
  if (!res.isValid) {
    return Response.json(
      { error: "PAYMENT_REJECTED", invalidReason: res.invalidReason },
      { status: 402, headers: challengeHeaders },
    );
  }

  const guarantee = findGuarantee(guaranteeId) ?? null;
  const offline = process.env.OPALX_OFFLINE_TEST === "1";
  const onChainFuji: OnChainGuaranteeVerification = offline
    ? {
        guaranteeId,
        chainId: 43113,
        opalxCoreAddress: getGatewayAddresses().opalxCore,
        valid: false,
        revoked: false,
        sandbox: guarantee?.sandbox ?? true,
        source: "OFFLINE_UNAVAILABLE",
      }
    : await verifyGuaranteeOnFuji(guaranteeId);

  const amountVnd = guarantee?.amountVnd ?? 1_500_000;
  const policyKernel = evaluateThreeWayPolicy({
    orderAmountVnd: amountVnd,
    bankPaidAmountVnd: amountVnd,
    invoiceTotalVnd: amountVnd,
    webhookSignatureValid: true,
    bankRefPresent: Boolean(guarantee ? guarantee.maskedBankRef : true),
    bankRefAlreadyUsed: false,
    requireInvoiceXml: true,
    invoiceXmlSignatureValid: true,
    vaultPaused: false,
    washTradeDetected: false,
  });

  const erc8004 = buildAgentRegistrationCard(url.origin);

  return Response.json(
    {
      unlocked: true,
      guaranteeId,
      x402: {
        protocol: "x402-v2",
        network: res.network,
        asset: FUJI_USDC_ADDRESS,
        amountUnits: requirement.amount,
        payer: res.payer,
        settlementMode: res.settlementMode,
        transaction: res.transaction,
        verifiedAtIso: new Date().toISOString(),
      },
      guarantee,
      onChainFuji,
      policyKernel,
      erc8004,
    },
    {
      status: 200,
      headers: {
        "PAYMENT-RESPONSE": res.paymentResponseHeader,
        "Cache-Control": "no-store",
      },
    },
  );
}
