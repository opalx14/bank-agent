import { timingSafeEqual } from "node:crypto";
import type { SepayWebhookPayload } from "@/types";

const OPX_ORDER_CODE_REGEX = /OPX[-_\s]?(\d{6,14})/i;

/** Extracts numeric OpalX orderCode (`OPX<6..14 digits>`) from bank transfer description. */
export function extractOrderCodeFromTransferContent(content?: string): number | null {
  if (!content) return null;
  const match = content.match(OPX_ORDER_CODE_REGEX);
  if (!match) return null;
  const num = Number(match[1]);
  return Number.isSafeInteger(num) && num > 0 ? num : null;
}

/** Resolves orderCode from SePay `code`, `content`, or `description` fields. */
export function resolveSepayOrderCode(payload: SepayWebhookPayload): number | null {
  const rawCode = payload.code?.trim();
  if (rawCode) {
    const tagged = extractOrderCodeFromTransferContent(rawCode);
    if (tagged !== null) return tagged;
    if (/^\d{6,14}$/.test(rawCode)) {
      const numeric = Number(rawCode);
      if (Number.isSafeInteger(numeric) && numeric > 0) return numeric;
    }
  }
  return (
    extractOrderCodeFromTransferContent(payload.content) ??
    extractOrderCodeFromTransferContent(payload.description)
  );
}

/** Verifies SePay / Casso Authorization header (`Apikey <key>` or `Bearer <key>`) in constant time. */
export function verifySepayAuthHeader(
  authHeader: string | null,
  expectedApiKey?: string,
): boolean {
  const expected = expectedApiKey?.trim() ?? "";
  if (!expected) {
    return process.env.OPALX_ALLOW_OPEN_SEPAY_SANDBOX !== "false";
  }
  if (!authHeader) return false;
  const match = authHeader.trim().match(/^(?:Apikey|Bearer)\s+(.+)$/i);
  if (!match) return false;
  const provided = match[1].trim();
  const actualBuf = Buffer.from(provided, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  return actualBuf.length === expectedBuf.length && timingSafeEqual(actualBuf, expectedBuf);
}
