import { createHmac, timingSafeEqual } from "node:crypto";
import type { PayosWebhookPayload } from "@/types";

function canonicalSortString(data: Record<string, unknown>): string {
  return Object.keys(data)
    .sort()
    .map((key) => {
      const value = data[key];
      if (value === null || value === undefined || value === "null" || value === "undefined") {
        return `${key}=`;
      }
      if (typeof value === "object") {
        return `${key}=${JSON.stringify(value)}`;
      }
      return `${key}=${String(value)}`;
    })
    .join("&");
}

/** Computes canonical PayOS HMAC-SHA256 webhook signature. */
export function computePayosHmacSignature(
  data: Record<string, unknown>,
  checksumKey: string,
): string {
  return createHmac("sha256", checksumKey)
    .update(canonicalSortString(data))
    .digest("hex");
}

/** Constant-time verification for PayOS HMAC-SHA256 webhooks. */
export function verifyPayosWebhookSignature(
  payload: PayosWebhookPayload,
  checksumKey: string,
): boolean {
  if (!checksumKey || !payload.signature || !/^[a-fA-F0-9]{64}$/.test(payload.signature)) {
    return false;
  }
  const expectedHex = computePayosHmacSignature(payload.data, checksumKey);
  const actualBuf = Buffer.from(payload.signature.toLowerCase(), "hex");
  const expectedBuf = Buffer.from(expectedHex.toLowerCase(), "hex");
  return actualBuf.length === expectedBuf.length && timingSafeEqual(actualBuf, expectedBuf);
}

export function maskBankReference(rawRef: string): string {
  const trimmed = rawRef.trim();
  if (trimmed.length <= 4) return "****";
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
}
