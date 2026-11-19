import QRCode from "qrcode";
import { findSupportedVnBank } from "@/core/enterprise/catalog";
import type {
  MerchantBankConfig,
  RailMode,
  VietQrBankOption,
  VietQrPaymentPayload,
} from "@/types";

const BANK_APPS: Array<{ appId: string; name: string }> = [
  { appId: "mb", name: "MB Bank" },
  { appId: "vcb", name: "Vietcombank" },
  { appId: "tcb", name: "Techcombank" },
  { appId: "bidv", name: "BIDV" },
  { appId: "acb", name: "ACB" },
  { appId: "icb", name: "VietinBank" },
];

function formatTlv(tag: string, value: string): string {
  const len = String(value.length).padStart(2, "0");
  return `${tag}${len}${value}`;
}

/** Standard EMVCo / VietQR CRC-16/CCITT-FALSE checksum. */
export function computeEmvCrc16(payloadWithoutCrc: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payloadWithoutCrc.length; i++) {
    crc ^= payloadWithoutCrc.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function normalizeVietQrPurpose(raw: string): string {
  const ascii = raw
    .replace(/[đĐ]/g, (ch) => (ch === "đ" ? "d" : "D"))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (ascii || "OPALX PAYMENT").slice(0, 25);
}

/** Builds EMVCo / NAPAS 247 VietQR TLV payload string. */
export function buildVietQrPayloadString(params: {
  bankBin: string;
  accountNo: string;
  amountVnd: number;
  purpose: string;
}): string {
  const beneficiaryInfo =
    formatTlv("00", params.bankBin) + formatTlv("01", params.accountNo);
  const merchantAccountInfo =
    formatTlv("00", "A000000727") +
    formatTlv("01", beneficiaryInfo) +
    formatTlv("02", "QRIBFTTA");
  const additionalData = formatTlv("08", normalizeVietQrPurpose(params.purpose));

  const body =
    formatTlv("00", "01") +
    formatTlv("01", "12") +
    formatTlv("38", merchantAccountInfo) +
    formatTlv("53", "704") +
    formatTlv("54", String(Math.max(1000, Math.round(params.amountVnd)))) +
    formatTlv("58", "VN") +
    formatTlv("62", additionalData) +
    "6304";

  return `${body}${computeEmvCrc16(body)}`;
}

export function buildBankDeeplinks(params: {
  accountNo: string;
  accountName: string;
  bankBin: string;
  amountVnd: number;
  description: string;
}): VietQrBankOption[] {
  const cleanPurpose = encodeURIComponent(normalizeVietQrPurpose(params.description));
  const cleanName = encodeURIComponent(params.accountName);
  return BANK_APPS.map((bank) => ({
    appId: bank.appId,
    name: bank.name,
    deeplink: `https://dl.vietqr.io/pay?app=${bank.appId}&ba=${params.accountNo}@${params.bankBin}&am=${Math.round(params.amountVnd)}&tn=${cleanPurpose}&bn=${cleanName}`,
  }));
}

export function ensureOrderQrDescription(orderCode: number, rawDescription: string): string {
  const trimmed = rawDescription.trim();
  const codeStr = String(orderCode);
  if (!trimmed) return `OPX${codeStr}`;
  if (/opx/i.test(trimmed) && trimmed.includes(codeStr)) return trimmed;
  const cleaned = trimmed.replace(/\bOPX\b[-_\s]*/gi, " ").replace(/\s+/g, " ").trim();
  return cleaned ? `OPX${codeStr} ${cleaned}` : `OPX${codeStr}`;
}

export interface BuildOrderQrParams {
  orderCode: number;
  amountVnd: number;
  description: string;
  railMode?: RailMode;
  bankConfig?: Partial<MerchantBankConfig>;
}

/** Generates deterministic offline QR data URL + bank deeplink options for VietQR order creation. */
export function buildOrderQrStub(params: BuildOrderQrParams): VietQrPaymentPayload {
  const isLive = params.railMode === "LIVE_BANK";
  const cfg = params.bankConfig;
  const hasCustomAcc = Boolean(cfg?.accountNo?.trim());
  const bankBin =
    (hasCustomAcc ? cfg?.bankBin?.trim() : "") ||
    (isLive ? process.env.OPALX_VIETQR_BANK_BIN?.trim() : "") ||
    "970422";
  const bankName =
    (hasCustomAcc ? cfg?.bankName?.trim() || cfg?.bankShortName?.trim() : "") ||
    (hasCustomAcc ? findSupportedVnBank(bankBin)?.shortName : "") ||
    (isLive ? process.env.OPALX_VIETQR_BANK_NAME?.trim() : "") ||
    (isLive ? "MB Bank" : "MB Bank (Demo VietQR)");
  const accountNo =
    (hasCustomAcc ? cfg?.accountNo?.trim() : "") ||
    (isLive ? process.env.OPALX_VIETQR_ACCOUNT_NO?.trim() : "") ||
    "03120006789";
  const accountName =
    (hasCustomAcc ? cfg?.accountName?.trim() : "") ||
    (isLive ? process.env.OPALX_LIVE_MERCHANT_NAME?.trim() : "") ||
    "OPALX MERCHANT DEMO";
  const purpose = ensureOrderQrDescription(params.orderCode, params.description);

  const qrCode = buildVietQrPayloadString({
    bankBin,
    accountNo,
    amountVnd: params.amountVnd,
    purpose,
  });
  const bankOptions = buildBankDeeplinks({
    accountNo,
    accountName,
    bankBin,
    amountVnd: params.amountVnd,
    description: purpose,
  });

  return {
    orderCode: params.orderCode,
    amountVnd: params.amountVnd,
    description: purpose,
    accountNo,
    accountName,
    bankBin,
    bankName,
    qrCode,
    qrSvgDataUrl: "",
    mobileDeeplinkUrl: bankOptions[0].deeplink,
    bankOptions,
  };
}

/** Async version including PNG DataURL for instant UI rendering. */
export async function buildOrderQrWithImage(
  params: BuildOrderQrParams,
): Promise<VietQrPaymentPayload> {
  const stub = buildOrderQrStub(params);
  const qrSvgDataUrl = await QRCode.toDataURL(stub.qrCode, {
    width: 240,
    margin: 2,
    errorCorrectionLevel: "M",
  });
  return { ...stub, qrSvgDataUrl };
}
