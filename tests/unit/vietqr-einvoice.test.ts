import { describe, expect, test } from "bun:test";
import {
  computePayosHmacSignature,
  maskBankReference,
  verifyPayosWebhookSignature,
} from "@/core/bank/payos-webhook";
import {
  extractOrderCodeFromTransferContent,
  resolveSepayOrderCode,
  verifySepayAuthHeader,
} from "@/core/bank/sepay-webhook";
import {
  buildOrderQrStub,
  buildVietQrPayloadString,
  computeEmvCrc16,
  normalizeVietQrPurpose,
} from "@/core/bank/vietqr-builder";
import { parseEmvVietQrPayload } from "@/core/bank/vietqr-parser";
import { GET as getPrintHtml } from "@/app/api/guarantees/[id]/print-html/route";
import {
  ENTERPRISE_PRODUCT_CATALOG,
  findSupportedVnBank,
  normalizeAccountHolderName,
  resolveEnterpriseCategory,
  SUPPORTED_VN_BANKS,
} from "@/core/enterprise/catalog";
import {
  extractTt78InvoiceSummary,
  proposeInvoiceFromUnstructuredText,
} from "@/core/enterprise/einvoice-parser";
import {
  buildSampleTt78Xml,
  SAMPLE_TAMPERED_TT78_XML,
  SAMPLE_VALID_TT78_XML,
} from "@/core/enterprise/einvoice-samples";
import type { PayosWebhookPayload } from "@/types";

describe("Enterprise VietQR, PayOS HMAC & TT78 XML", () => {
  test("computes EMVCo CRC-16 and builds valid VietQR TLV strings", () => {
    const raw = buildVietQrPayloadString({
      bankBin: "970422",
      accountNo: "03120006789",
      amountVnd: 2000,
      purpose: "OPX 20260002 QUICK QR",
    });
    expect(raw.startsWith("000201010212")).toBe(true);
    expect(raw.includes("530370454")).toBe(true);
    const body = raw.slice(0, -4);
    expect(raw.slice(-4)).toBe(computeEmvCrc16(body));
    expect(normalizeVietQrPurpose("Hóa đơn @# 123!")).toBe("Hoa don 123");
  });

  test("distinguishes SANDBOX and LIVE_BANK VietQR deeplinks cleanly", () => {
    const sbx = buildOrderQrStub({ orderCode: 101, amountVnd: 2000, description: "TEST", railMode: "SANDBOX" });
    const live = buildOrderQrStub({ orderCode: 102, amountVnd: 1500000, description: "LIVE", railMode: "LIVE_BANK" });
    expect(sbx.bankOptions.length).toBeGreaterThanOrEqual(4);
    expect(sbx.mobileDeeplinkUrl.startsWith("https://dl.vietqr.io/pay?")).toBe(true);
    expect(live.qrCode.endsWith(computeEmvCrc16(live.qrCode.slice(0, -4)))).toBe(true);
  });

  test("verifies canonical PayOS HMAC-SHA256 webhook signature in constant time", () => {
    const checksumKey = "test_checksum_key_opalx_2026";
    const data: PayosWebhookPayload["data"] = {
      orderCode: 20260099,
      amount: 1_500_000,
      description: "OPX B2B ORDER",
      reference: "FT2601889921",
      transactionDateTime: "2026-11-14 08:00:00",
      currency: "VND",
    };
    const signature = computePayosHmacSignature(data, checksumKey);
    const validPayload: PayosWebhookPayload = {
      code: "00",
      desc: "success",
      success: true,
      signature,
      data,
    };

    expect(verifyPayosWebhookSignature(validPayload, checksumKey)).toBe(true);
    expect(verifyPayosWebhookSignature({ ...validPayload, signature: "a".repeat(64) }, checksumKey)).toBe(false);
    expect(verifyPayosWebhookSignature({ ...validPayload, signature: "short" }, checksumKey)).toBe(false);
    expect(maskBankReference("FT2601889921")).toBe("FT26***9921");
  });

  test("parses valid TT78 XML and flags tampered or AI-proposed invoices as untrusted", () => {
    const valid = extractTt78InvoiceSummary(SAMPLE_VALID_TT78_XML);
    expect(valid.source).toBe("TT78_XML");
    expect(valid.signatureValid).toBe(true);
    expect(valid.totalAmountVnd).toBe(1_500_000);
    expect(valid.sellerTaxId).toBe("0312345678");

    const tampered = extractTt78InvoiceSummary(SAMPLE_TAMPERED_TT78_XML);
    expect(tampered.signatureValid).toBe(false);

    const custom = extractTt78InvoiceSummary(buildSampleTt78Xml({ amountVnd: 2_500_000, invoiceNumber: "000999" }));
    expect(custom.totalAmountVnd).toBe(2_500_000);

    const aiProposal = proposeInvoiceFromUnstructuredText("MST 0312345678 payment 1500000 VND");
    expect(aiProposal.source).toBe("AI_BOUNDED_PROPOSAL");
    expect(aiProposal.signatureValid).toBe(false);

    expect(() => extractTt78InvoiceSummary("plain text")).toThrow("INVALID_TT78_XML_FORMAT");
  });

  test("resolves enterprise catalog, VN banks, custom VietQR bankConfig, and SePay parsing", () => {
    expect(ENTERPRISE_PRODUCT_CATALOG).toHaveLength(4);
    expect(SUPPORTED_VN_BANKS).toHaveLength(10);
    expect(resolveEnterpriseCategory("cali-tech-cloud")?.taxId).toBe("0312345678");
    expect(resolveEnterpriseCategory("unknown-id")).toBeUndefined();
    expect(findSupportedVnBank("970436")?.appId).toBe("vcb");
    expect(normalizeAccountHolderName("Nguyễn Minh Đức - Công Ty")).toBe("NGUYEN MINH DUC CONG TY");

    const customQr = buildOrderQrStub({
      orderCode: 20267788,
      amountVnd: 150_000,
      description: "API payment",
      railMode: "SANDBOX",
      bankConfig: {
        bankBin: "970436",
        bankName: "Vietcombank",
        accountNo: "001100999888",
        accountName: "CONG TY CALI TECH",
      },
    });
    expect(customQr.bankBin).toBe("970436");
    expect(customQr.bankName).toBe("Vietcombank");
    expect(customQr.accountNo).toBe("001100999888");
    expect(customQr.accountName).toBe("CONG TY CALI TECH");
    expect(customQr.description.startsWith("OPX20267788")).toBe(true);
    expect(customQr.qrCode).toContain("001100999888");
    expect(customQr.qrCode).toContain("OPX20267788");

    expect(extractOrderCodeFromTransferContent("MBVCB.123.OPX20267788.CT")).toBe(20267788);
    expect(extractOrderCodeFromTransferContent("opx-20267799 payment")).toBe(20267799);
    expect(extractOrderCodeFromTransferContent("REGULAR BANK TRANSFER")).toBeNull();
    expect(resolveSepayOrderCode({ code: "OPX20268888", content: "other" })).toBe(20268888);

    expect(verifySepayAuthHeader("Apikey sepay_secret_99", "sepay_secret_99")).toBe(true);
    expect(verifySepayAuthHeader("Bearer sepay_secret_99", "sepay_secret_99")).toBe(true);
    expect(verifySepayAuthHeader("Apikey wrong_key", "sepay_secret_99")).toBe(false);
    expect(verifySepayAuthHeader(null, "")).toBe(true);
  });

  test("parses EMVCo VietQR TLV payload and renders 58mm POS print HTML", async () => {
    const raw = buildVietQrPayloadString({
      bankBin: "970436",
      accountNo: "001100999888",
      amountVnd: 450_000,
      purpose: "OPX20269901 CALI",
    });
    const parsed = parseEmvVietQrPayload(raw);
    expect(parsed.validFormat).toBe(true);
    expect(parsed.crcValid).toBe(true);
    expect(parsed.isDynamic).toBe(true);
    expect(parsed.bankBin).toBe("970436");
    expect(parsed.bankShortName).toBe("Vietcombank");
    expect(parsed.accountNo).toBe("001100999888");
    expect(parsed.amountVnd).toBe(450_000);
    expect(parsed.purpose).toBe("OPX20269901 CALI");
    expect(parsed.orderCode).toBe(20269901);

    const invalidParsed = parseEmvVietQrPayload(`${raw.slice(0, -1)}0`);
    expect(invalidParsed.crcValid).toBe(false);
    expect(parseEmvVietQrPayload("NOT_EMV_QR").validFormat).toBe(false);

    const pos58Res = await getPrintHtml(
      new Request("http://localhost/api/guarantees/OPX-2026-0001/print-html?paper=pos58"),
      { params: Promise.resolve({ id: "OPX-2026-0001" }) },
    );
    expect(pos58Res.status).toBe(200);
    const pos58Html = await pos58Res.text();
    expect(pos58Html).toContain("58mm auto");
    expect(pos58Html).toContain("width:52mm");
    expect(pos58Html).toContain("GUARANTEE RECONCILIATION CERTIFICATE");
  });
});
