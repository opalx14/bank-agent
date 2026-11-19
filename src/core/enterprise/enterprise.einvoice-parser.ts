import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import type { EinvoiceSummary } from "@/types";
import { isValidVnTaxId } from "@/core/opalx/opalx.policy-bridge";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

function asObj(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const obj = asObj(value);
  return typeof obj?.["#text"] === "string" ? obj["#text"].trim() : "";
}

function findDeepText(node: unknown, targetKey: string): string {
  if (!node || typeof node !== "object") return "";
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findDeepText(item, targetKey);
      if (hit) return hit;
    }
    return "";
  }
  const record = node as Record<string, unknown>;
  if (targetKey in record) {
    const direct = asText(record[targetKey]);
    if (direct) return direct;
  }
  for (const child of Object.values(record)) {
    const hit = findDeepText(child, targetKey);
    if (hit) return hit;
  }
  return "";
}

function hasValidXmlSignature(root: Record<string, unknown>): boolean {
  const sigText = findDeepText(root, "SignatureValue");
  return sigText.length >= 16;
}

/** Parses Vietnamese Circular 78 XML e-invoices fail-closed into structured summary. */
export function extractTt78InvoiceSummary(xmlString: string): EinvoiceSummary {
  const trimmed = xmlString.trim();
  if (!trimmed.startsWith("<")) {
    throw new Error("INVALID_TT78_XML_FORMAT");
  }

  const digestHex = `0x${createHash("sha256").update(trimmed).digest("hex")}` as `0x${string}`;
  const parsed = asObj(xmlParser.parse(trimmed));
  const hdon = asObj(parsed?.HDon) ?? parsed;
  if (!hdon) throw new Error("MISSING_TT78_HDON_ROOT");

  const dlhdon = asObj(hdon.DLHDon) ?? hdon;
  const ttChung = asObj(dlhdon.TTChung);
  const ndHdon = asObj(dlhdon.NDHDon);
  const nBan = asObj(ndHdon?.NBan);
  const nMua = asObj(ndHdon?.NMua);
  const tToan = asObj(ndHdon?.TToan);

  const invoiceNumber = asText(ttChung?.SHDon) || findDeepText(hdon, "SHDon");
  const invoiceSerial = asText(ttChung?.KHHDon) || findDeepText(hdon, "KHHDon");
  const sellerTaxId = asText(nBan?.MST) || findDeepText(nBan ?? hdon, "MST");
  const sellerName = asText(nBan?.Ten) || "UNKNOWN SELLER";
  const buyerTaxId = asText(nMua?.MST) || undefined;
  const rawTotal = asText(tToan?.TgTTTBSo) || findDeepText(hdon, "TgTTTBSo");
  const totalAmountVnd = Number(rawTotal.replace(/[^\d.-]/g, ""));

  if (!invoiceNumber || !invoiceSerial) {
    throw new Error("MISSING_TT78_INVOICE_IDENTIFIERS");
  }
  if (!isValidVnTaxId(sellerTaxId)) {
    throw new Error("INVALID_TT78_SELLER_MST");
  }
  if (!Number.isFinite(totalAmountVnd) || totalAmountVnd <= 0) {
    throw new Error("INVALID_TT78_AMOUNT");
  }

  return {
    invoiceNumber,
    invoiceSerial,
    sellerTaxId,
    sellerName,
    ...(buyerTaxId ? { buyerTaxId } : {}),
    totalAmountVnd: Math.round(totalAmountVnd),
    signatureValid: hasValidXmlSignature(hdon),
    source: "TT78_XML",
    xmlDigestHex: digestHex,
  };
}

/**
 * Bounded AI extraction helper for unstructured text notes:
 * strictly non-authoritative (`signatureValid: false`) so Policy Kernel enforces fail-closed.
 */
export function proposeInvoiceFromUnstructuredText(rawText: string): EinvoiceSummary {
  const trimmed = rawText.trim();
  const digestHex = `0x${createHash("sha256").update(trimmed).digest("hex")}` as `0x${string}`;
  const mstMatch = trimmed.match(/\b(\d{10}(?:-\d{3})?)\b/);
  const amountMatch = trimmed.match(/([\d.,]{4,})\s*(?:vnd|đ|d\b)/i);
  const parsedAmount = amountMatch
    ? Number(amountMatch[1].replace(/[.,]/g, ""))
    : 0;

  return {
    invoiceNumber: "AI-DRAFT",
    invoiceSerial: "UNVERIFIED",
    sellerTaxId: mstMatch?.[1] ?? "0000000000",
    sellerName: "AI Proposal (Unsigned XML)",
    totalAmountVnd: Number.isFinite(parsedAmount) ? parsedAmount : 0,
    signatureValid: false,
    source: "AI_BOUNDED_PROPOSAL",
    xmlDigestHex: digestHex,
  };
}
