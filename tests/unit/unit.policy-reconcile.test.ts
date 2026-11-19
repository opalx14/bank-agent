import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildOrderQrStub } from "@/core/bank/bank.qr-builder";
import { buildSampleTt78Xml } from "@/core/enterprise/enterprise.einvoice-samples";
import {
  detectCircularWashTrade,
  evaluateThreeWayPolicy,
  isValidVnTaxId,
} from "@/core/opalx/opalx.policy-bridge";
import { formatGuaranteeId, reconcileAndBroadcastProofs } from "@/core/opalx/opalx.reconcile";
import type { EnterpriseOrder } from "@/types";

let tempDir = "";
let prevLedgerPath: string | undefined;
let prevOffline: string | undefined;

beforeAll(() => {
  prevLedgerPath = process.env.OPALX_LEDGER_PATH;
  prevOffline = process.env.OPALX_OFFLINE_TEST;
  tempDir = mkdtempSync(path.join(tmpdir(), "opalx-policy-test-"));
  process.env.OPALX_LEDGER_PATH = path.join(tempDir, "ledger.json");
  process.env.OPALX_OFFLINE_TEST = "1";
});

afterAll(() => {
  if (prevLedgerPath === undefined) delete process.env.OPALX_LEDGER_PATH;
  else process.env.OPALX_LEDGER_PATH = prevLedgerPath;
  if (prevOffline === undefined) delete process.env.OPALX_OFFLINE_TEST;
  else process.env.OPALX_OFFLINE_TEST = prevOffline;
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

function sampleOrder(orderCode: number, amountVnd: number, railMode: "SANDBOX" | "LIVE_BANK"): EnterpriseOrder {
  const qr = buildOrderQrStub({ orderCode, amountVnd, description: `OPX ${orderCode}`, railMode });
  return {
    orderCode,
    amountVnd,
    description: `OPX ${orderCode}`,
    sellerName: "OpalX Enterprise",
    sellerTaxId: "0312345678",
    sellerEnterpriseAddress: "0x78BF34e40C66b5B3Ed5f14612b927239BAC88676",
    buyerName: "Partner Co",
    buyerTaxId: "0109876543",
    requireInvoiceXml: railMode === "LIVE_BANK",
    railMode,
    status: "PENDING_BANK",
    qrCode: qr.qrCode,
    qrSvgDataUrl: qr.qrSvgDataUrl,
    mobileDeeplinkUrl: qr.mobileDeeplinkUrl,
    createdAtIso: "2026-11-14T05:00:00.000Z",
    updatedAtIso: "2026-11-14T05:00:00.000Z",
  };
}

describe("OpalXGo Rust WASM Policy Kernel & Reconciliation", () => {
  test("validates Vietnamese MST formats and detects wash-trade cycles", () => {
    expect(isValidVnTaxId("0312345678")).toBe(true);
    expect(isValidVnTaxId("0312345678-001")).toBe(true);
    expect(isValidVnTaxId("12345")).toBe(false);

    expect(detectCircularWashTrade([{ from: "A", to: "B" }, { from: "B", to: "C" }])).toBe(false);
    expect(detectCircularWashTrade([{ from: "A", to: "A" }])).toBe(true);
    expect(
      detectCircularWashTrade([{ from: "A", to: "B" }, { from: "B", to: "C" }, { from: "C", to: "A" }]),
    ).toBe(true);
  });

  test("executes compiled WASM policy kernel deterministically", () => {
    const allow = evaluateThreeWayPolicy({
      orderAmountVnd: 1_500_000,
      bankPaidAmountVnd: 1_500_000,
      invoiceTotalVnd: 1_500_000,
      webhookSignatureValid: true,
      bankRefPresent: true,
      bankRefAlreadyUsed: false,
      requireInvoiceXml: true,
      invoiceXmlSignatureValid: true,
      vaultPaused: false,
      washTradeDetected: false,
    });
    expect(allow.wasmExecuted).toBe(true);
    expect(allow.verdict).toBe("ALLOW");

    const escalate = evaluateThreeWayPolicy({
      orderAmountVnd: 25_000_000,
      bankPaidAmountVnd: 25_000_000,
      webhookSignatureValid: true,
      bankRefPresent: true,
      bankRefAlreadyUsed: false,
      requireInvoiceXml: false,
      invoiceXmlSignatureValid: false,
      vaultPaused: false,
      washTradeDetected: false,
    });
    expect(escalate.wasmExecuted).toBe(true);
    expect(escalate.verdict).toBe("REQUIRE_APPROVAL");
  });

  test("issues AVAX guarantee certificates without awarding sandbox credits and blocks replays", async () => {
    expect(formatGuaranteeId(20260055, 4)).toMatch(/^OPX-\d{4}-0005-0055$/);

    const sandboxOutcome = await reconcileAndBroadcastProofs({
      order: sampleOrder(20260055, 2_000, "SANDBOX"),
      bankPaidAmountVnd: 2_000,
      bankReference: "FT_UNIT_SBX_01",
      webhookSignatureValid: true,
    });
    expect(sandboxOutcome.decision.verdict).toBe("ALLOW");
    expect(sandboxOutcome.guarantee?.reputationCreditsAwarded).toBe(0);
    expect(sandboxOutcome.guarantee?.sandbox).toBe(true);

    const liveOutcome = await reconcileAndBroadcastProofs({
      order: sampleOrder(20260056, 1_500_000, "LIVE_BANK"),
      bankPaidAmountVnd: 1_500_000,
      bankReference: "FT_UNIT_LIVE_01",
      webhookSignatureValid: true,
      invoiceXml: buildSampleTt78Xml({ amountVnd: 1_500_000 }),
    });
    expect(liveOutcome.decision.verdict).toBe("ALLOW");
    expect(liveOutcome.guarantee?.reputationCreditsAwarded).toBe(10);

    const replayOutcome = await reconcileAndBroadcastProofs({
      order: sampleOrder(20260057, 1_500_000, "SANDBOX"),
      bankPaidAmountVnd: 1_500_000,
      bankReference: "FT_UNIT_LIVE_01",
      webhookSignatureValid: true,
    });
    expect(replayOutcome.decision.verdict).toBe("DENY");
    expect(replayOutcome.decision.reasonCode).toBe("MISSING_OR_DUPLICATE_BANK_REF");
  });
});
