import { findSupportedVnBank } from "@/core/enterprise/enterprise.catalog";
import { computeEmvCrc16 } from "./bank.qr-builder";

export interface ParsedEmvVietQr {
  validFormat: boolean;
  crcValid: boolean;
  isDynamic: boolean;
  bankBin?: string;
  bankShortName?: string;
  accountNo?: string;
  amountVnd?: number;
  purpose?: string;
  orderCode?: number;
  rawPayload: string;
}

function parseTlvMap(input: string): Map<string, string> {
  const map = new Map<string, string>();
  let idx = 0;
  while (idx + 4 <= input.length) {
    const tag = input.slice(idx, idx + 2);
    const lenStr = input.slice(idx + 2, idx + 4);
    if (!/^\d{2}$/.test(lenStr)) break;
    const len = Number(lenStr);
    const start = idx + 4;
    if (start + len > input.length) break;
    map.set(tag, input.slice(start, start + len));
    idx = start + len;
  }
  return map;
}

/** Parses EMVCo / NAPAS 247 VietQR TLV payload strings into human-readable payment fields. */
export function parseEmvVietQrPayload(raw: string): ParsedEmvVietQr {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("0002") || trimmed.length < 24) {
    return { validFormat: false, crcValid: false, isDynamic: false, rawPayload: trimmed };
  }

  const root = parseTlvMap(trimmed);
  const crcIdx = trimmed.lastIndexOf("6304");
  const crcFromPayload = root.get("63")?.toUpperCase();
  const crcValid =
    crcIdx > 0 &&
    Boolean(crcFromPayload) &&
    computeEmvCrc16(trimmed.slice(0, crcIdx + 4)) === crcFromPayload;

  const merchantRaw = root.get("38") ?? root.get("39") ?? "";
  const merchantTlv = merchantRaw ? parseTlvMap(merchantRaw) : new Map<string, string>();
  const beneficiaryRaw = merchantTlv.get("01") ?? "";
  const beneficiaryTlv = beneficiaryRaw ? parseTlvMap(beneficiaryRaw) : new Map<string, string>();

  const bankBin = beneficiaryTlv.get("00") || undefined;
  const accountNo = beneficiaryTlv.get("01") || undefined;
  const bankMeta = findSupportedVnBank(bankBin);

  const amountStr = root.get("54");
  const amountNum = amountStr ? Number(amountStr) : NaN;
  const amountVnd = Number.isFinite(amountNum) && amountNum > 0 ? Math.round(amountNum) : undefined;

  const extraRaw = root.get("62") ?? "";
  const extraTlv = extraRaw ? parseTlvMap(extraRaw) : new Map<string, string>();
  const purpose = (extraTlv.get("08") || extraTlv.get("05") || "").trim() || undefined;
  const orderMatch = purpose?.match(/\bOPX[-_]?(\d{4,})\b/i);
  const orderCode = orderMatch ? Number(orderMatch[1]) : undefined;

  return {
    validFormat: Boolean(bankBin && accountNo),
    crcValid,
    isDynamic: root.get("01") === "12",
    bankBin,
    bankShortName: bankMeta?.shortName ?? (bankBin ? `BIN ${bankBin}` : undefined),
    accountNo,
    amountVnd,
    purpose,
    orderCode: Number.isFinite(orderCode) ? orderCode : undefined,
    rawPayload: trimmed,
  };
}
