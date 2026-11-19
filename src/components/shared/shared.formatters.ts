import type { EnterpriseCreditTier, PolicyVerdict } from "@/types";

export function formatVnd(amount: number): string {
  if (!Number.isFinite(amount)) return "0 ₫";
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(amount))} ₫`;
}

export function formatAvax(amount: number | string, decimals = 5): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(num)) return "0 AVAX";
  return `${num.toFixed(decimals)} AVAX`;
}

export function truncateHex(value?: string, chars = 6): string {
  if (!value) return "—";
  if (value.length <= chars * 2 + 2) return value;
  return `${value.slice(0, chars + 2)}...${value.slice(-chars)}`;
}

export function formatUtcTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export function getCreditTierLabel(tier: EnterpriseCreditTier): string {
  if (tier === "GOLD_NET30") return "GOLD Net-30";
  if (tier === "SILVER_NET15") return "SILVER Net-15";
  return "STANDARD";
}

export function getVerdictBadgeClasses(verdict: PolicyVerdict): string {
  if (verdict === "ALLOW") return "ox-badge-verified";
  if (verdict === "REQUIRE_APPROVAL") return "ox-badge-warn";
  return "ox-badge-avax";
}

export function buildVietQrFallbackDeeplink(params: {
  bankAppId: string;
  amountVnd: number;
  addInfo: string;
  accountNo?: string;
  bankBin?: string;
  accountName?: string;
}): string {
  const ba = `${params.accountNo || "03120006789"}@${params.bankBin || "970422"}`;
  const tn = encodeURIComponent(params.addInfo.slice(0, 25));
  const bn = params.accountName ? `&bn=${encodeURIComponent(params.accountName)}` : "";
  return `https://dl.vietqr.io/pay?app=${params.bankAppId}&ba=${ba}&am=${Math.round(params.amountVnd)}&tn=${tn}${bn}`;
}
