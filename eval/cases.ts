import { buildOrderQrStub } from "@/core/bank/vietqr-builder";
import { buildSampleTt78Xml, SAMPLE_TAMPERED_TT78_XML } from "@/core/enterprise/einvoice-samples";
import type { TransferEdge } from "@/core/opalx/policy-bridge";
import type { EnterpriseOrder, PolicyVerdict, RailMode } from "@/types";

export interface EvalScenarioSpec {
  id: string;
  category: "VALID" | "ADVERSARIAL";
  expectedVerdict: PolicyVerdict;
  expectedReasonCode?: string;
  order: EnterpriseOrder;
  bankPaidAmountVnd: number;
  bankRef: string;
  bankRefAlreadyUsed?: boolean;
  webhookSignatureValid: boolean;
  invoiceXml?: string;
  aiUnstructuredNote?: string;
  transferEdges?: TransferEdge[];
  vaultPaused?: boolean;
  autoApproveLimitVnd?: number;
}

function makeEvalOrder(params: {
  orderCode: number;
  amountVnd: number;
  requireInvoiceXml?: boolean;
  railMode?: RailMode;
}): EnterpriseOrder {
  const railMode = params.railMode ?? "SANDBOX";
  const description = `OPX EVAL ${params.orderCode}`;
  const qr = buildOrderQrStub({ orderCode: params.orderCode, amountVnd: params.amountVnd, description, railMode });
  return {
    orderCode: params.orderCode,
    amountVnd: params.amountVnd,
    description,
    sellerName: "CONG TY TNHH OPALX VIETNAM",
    sellerTaxId: "0312345678",
    sellerEnterpriseAddress: "0x78BF34e40C66b5B3Ed5f14612b927239BAC88676",
    buyerName: "DOI TAC B2B VIETNAM",
    buyerTaxId: "0109876543",
    requireInvoiceXml: Boolean(params.requireInvoiceXml),
    railMode,
    status: "PENDING_BANK",
    qrCode: qr.qrCode,
    qrSvgDataUrl: qr.qrSvgDataUrl,
    mobileDeeplinkUrl: qr.mobileDeeplinkUrl,
    createdAtIso: "2026-11-14T05:00:00.000Z",
    updatedAtIso: "2026-11-14T05:00:00.000Z",
  };
}

interface AdvOptions {
  orderCode: number;
  amountVnd?: number;
  bankPaidAmountVnd?: number;
  bankRef?: string;
  bankRefAlreadyUsed?: boolean;
  webhookSignatureValid?: boolean;
  requireInvoiceXml?: boolean;
  railMode?: RailMode;
  invoiceXml?: string;
  aiUnstructuredNote?: string;
  transferEdges?: TransferEdge[];
  vaultPaused?: boolean;
  autoApproveLimitVnd?: number;
  expectedVerdict?: PolicyVerdict;
}

function advCase(id: string, expectedReasonCode: string, opts: AdvOptions): EvalScenarioSpec {
  const amountVnd = opts.amountVnd ?? 1_500_000;
  return {
    id,
    category: "ADVERSARIAL",
    expectedVerdict: opts.expectedVerdict ?? "DENY",
    expectedReasonCode,
    order: makeEvalOrder({
      orderCode: opts.orderCode,
      amountVnd,
      requireInvoiceXml: opts.requireInvoiceXml,
      railMode: opts.railMode,
    }),
    bankPaidAmountVnd: opts.bankPaidAmountVnd ?? amountVnd,
    bankRef: opts.bankRef ?? `FT_${id}`,
    bankRefAlreadyUsed: opts.bankRefAlreadyUsed,
    webhookSignatureValid: opts.webhookSignatureValid ?? true,
    invoiceXml: opts.invoiceXml,
    aiUnstructuredNote: opts.aiUnstructuredNote,
    transferEdges: opts.transferEdges,
    vaultPaused: opts.vaultPaused,
    autoApproveLimitVnd: opts.autoApproveLimitVnd,
  };
}

/** Deterministic 40-case evaluation suite (25 VALID + 15 ADVERSARIAL) for Rust WASM policy kernel. */
export function buildEvalDataset(): EvalScenarioSpec[] {
  const validAmounts = [
    2_000, 15_000, 45_000, 120_000, 250_000, 480_000, 750_000, 990_000, 1_250_000, 1_500_000,
    2_100_000, 2_850_000, 3_400_000, 4_200_000, 4_950_000, 5_500_000, 6_100_000, 6_800_000,
    7_400_000, 8_200_000, 8_900_000, 9_500_000, 9_800_000, 9_950_000, 10_000_000,
  ];

  const validCases: EvalScenarioSpec[] = validAmounts.map((amountVnd, index) => {
    const num = index + 1;
    const orderCode = 20261000 + num;
    const requireInvoiceXml = index % 2 === 0;
    const railMode: RailMode = index % 3 === 0 ? "LIVE_BANK" : "SANDBOX";
    return {
      id: `VALID-${String(num).padStart(2, "0")}`,
      category: "VALID",
      expectedVerdict: "ALLOW",
      expectedReasonCode: "NONE",
      order: makeEvalOrder({ orderCode, amountVnd, requireInvoiceXml, railMode }),
      bankPaidAmountVnd: amountVnd,
      bankRef: `FT_VALID_${orderCode}`,
      webhookSignatureValid: true,
      ...(requireInvoiceXml ? { invoiceXml: buildSampleTt78Xml({ invoiceNumber: `000${100 + num}`, amountVnd }) } : {}),
      ...(index === 24
        ? { transferEdges: [{ from: "0312345678", to: "0109876543" }, { from: "0109876543", to: "0201112223" }] }
        : {}),
    };
  });

  const adversarialCases: EvalScenarioSpec[] = [
    advCase("ADV-01-INVALID-HMAC", "INVALID_WEBHOOK_SIGNATURE", { orderCode: 20262001, amountVnd: 500_000, webhookSignatureValid: false }),
    advCase("ADV-02-SHORT-HMAC", "INVALID_WEBHOOK_SIGNATURE", { orderCode: 20262002, amountVnd: 750_000, railMode: "LIVE_BANK", webhookSignatureValid: false }),
    advCase("ADV-03-MISSING-BANK-REF", "MISSING_OR_DUPLICATE_BANK_REF", { orderCode: 20262003, amountVnd: 1_000_000, bankRef: "" }),
    advCase("ADV-04-REPLAY-BANK-REF", "MISSING_OR_DUPLICATE_BANK_REF", { orderCode: 20262004, amountVnd: 1_000_000, bankRefAlreadyUsed: true }),
    advCase("ADV-05-UNDERPAID", "AMOUNT_MISMATCH", { orderCode: 20262005, amountVnd: 2_000_000, bankPaidAmountVnd: 1_990_000 }),
    advCase("ADV-06-OVERPAID", "AMOUNT_MISMATCH", { orderCode: 20262006, amountVnd: 2_000_000, bankPaidAmountVnd: 2_500_000 }),
    advCase("ADV-07-XML-TOTAL-MISMATCH", "AMOUNT_MISMATCH", {
      orderCode: 20262007,
      requireInvoiceXml: true,
      invoiceXml: buildSampleTt78Xml({ amountVnd: 1_200_000 }),
    }),
    advCase("ADV-08-TAMPERED-XML-SIG", "INVALID_INVOICE_XML_SIGNATURE", {
      orderCode: 20262008,
      requireInvoiceXml: true,
      invoiceXml: SAMPLE_TAMPERED_TT78_XML,
    }),
    advCase("ADV-09-NON-XML-INVOICE", "INVALID_INVOICE_XML_SIGNATURE", {
      orderCode: 20262009,
      requireInvoiceXml: true,
      invoiceXml: "NOT_VALID_XML_BODY",
    }),
    advCase("ADV-10-AI-UNVERIFIED-NOTE", "INVALID_INVOICE_XML_SIGNATURE", {
      orderCode: 20262010,
      requireInvoiceXml: true,
      aiUnstructuredNote: "MST 0312345678 tong 1500000 VND khong co XML",
    }),
    advCase("ADV-11-SELF-WASH-TRADE", "WASH_TRADE_CYCLE_DETECTED", {
      orderCode: 20262011,
      amountVnd: 3_000_000,
      transferEdges: [{ from: "ENT_X", to: "ENT_X" }],
    }),
    advCase("ADV-12-TWO-HOP-WASH-TRADE", "WASH_TRADE_CYCLE_DETECTED", {
      orderCode: 20262012,
      amountVnd: 5_000_000,
      transferEdges: [{ from: "ENT_A", to: "ENT_B" }, { from: "ENT_B", to: "ENT_A" }],
    }),
    advCase("ADV-13-THREE-HOP-WASH-TRADE", "WASH_TRADE_CYCLE_DETECTED", {
      orderCode: 20262013,
      amountVnd: 8_000_000,
      transferEdges: [
        { from: "ENT_A", to: "ENT_B" },
        { from: "ENT_B", to: "ENT_C" },
        { from: "ENT_C", to: "ENT_A" },
      ],
    }),
    advCase("ADV-14-CFO-KILL-SWITCH-PAUSED", "VAULT_PAUSED", { orderCode: 20262014, amountVnd: 100_000, vaultPaused: true }),
    advCase("ADV-15-HIGH-VALUE-NEEDS-APPROVAL", "EXCEEDS_AUTO_LIMIT_NEEDS_CFO_PASSKEY", {
      orderCode: 20262015,
      amountVnd: 75_000_000,
      autoApproveLimitVnd: 50_000_000,
      expectedVerdict: "REQUIRE_APPROVAL",
    }),
  ];

  return [...validCases, ...adversarialCases];
}
