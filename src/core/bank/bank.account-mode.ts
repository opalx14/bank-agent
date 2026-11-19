import type {
  AccountClassificationResponse,
  AccountProfileKind,
  AvaxFaucetResource,
  MerchantAccountProfile,
} from "@/types";
import { getGatewayAddresses, isNonZeroAddress } from "@/lib/avalanche/avalanche.network";
import { deriveFujiPublicAddress } from "@/lib/avalanche/avalanche.signer";

const DEFAULT_ENTERPRISE_ADDRESS = "0x1111111111111111111111111111111111111111" as const;

export const AVAX_FAUCET_RESOURCES: AvaxFaucetResource[] = [
  {
    tokenSymbol: "AVAX",
    network: "Avalanche Fuji (43113)",
    purpose:
      "Sole fuel for gas fees, guarantee collateral locking, and reconciliation fee settlement (0.00001 AVAX/tx) across Enterprise, Bank & OpalXGo gateways.",
    faucetName: "Core Testnet Faucet (AVAX)",
    faucetUrl: "https://core.app/tools/testnet-faucet/?subnet=c&token=c",
    secondaryFaucetUrl: "https://build.avax.network/console/primary-network/faucet",
    recommendedAmount: "0.05 - 2 AVAX",
  },
];

export const DEFAULT_DEMO_PROFILE: MerchantAccountProfile = {
  kind: "DEMO_ACCOUNT",
  railMode: "SANDBOX",
  badgeLabel: "[SANDBOX]",
  title: "Demo Account ([SANDBOX])",
  subtitle: "Internal HMAC simulation · Records real AVAX proof on Fuji when Live Broadcast is enabled",
  sellerName: "OpalX Merchant Demo",
  sellerTaxId: "0316890123",
  sellerEnterpriseAddress: DEFAULT_ENTERPRISE_ADDRESS,
  bankName: "MB Bank (Demo BIN 970422)",
  bankBin: "970422",
  maskedBankAccount: "0312***6789 (Demo)",
  settlementRail: "Sandbox Bank Simulator + Rust Policy Kernel + Avalanche Fuji AVAX",
  creditEligibilityNote:
    "No live ERC-8004 reputation credits awarded (+0 pts) to prevent score inflation.",
};

export function maskBankAccount(raw?: string): string {
  const cleaned = raw?.trim() ?? "";
  if (!cleaned) return "Live bank account not configured";
  return cleaned.length <= 4 ? `****${cleaned}` : `****${cleaned.slice(-4)}`;
}

function normalizeAddress(raw?: string): `0x${string}` {
  const trimmed = raw?.trim() ?? "";
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed)
    ? (trimmed as `0x${string}`)
    : DEFAULT_ENTERPRISE_ADDRESS;
}

/** Resolves [SANDBOX] Demo vs [LIVE BANK] Enterprise readiness and public AVAX wallet info. */
export function resolveAccountClassification(
  env: Record<string, string | undefined> = process.env,
): AccountClassificationResponse {
  const payosConfigured = Boolean(
    env.PAYOS_CLIENT_ID?.trim() && env.PAYOS_API_KEY?.trim() && env.PAYOS_CHECKSUM_KEY?.trim(),
  );
  const liveBankAcc = env.OPALX_VIETQR_ACCOUNT_NO?.trim() ?? "";
  const bankAccountConfigured = Boolean(liveBankAcc);
  const fujiWalletAddress = deriveFujiPublicAddress(env.AVALANCHE_ISSUER_PRIVATE_KEY);
  const fujiIssuerKeyConfigured = Boolean(fujiWalletAddress);
  const addrs = getGatewayAddresses(env);
  const fujiContractsDeployed =
    isNonZeroAddress(addrs.enterpriseGateway) &&
    isNonZeroAddress(addrs.bankGateway) &&
    isNonZeroAddress(addrs.opalxCore);

  const missingEnvKeys: string[] = [];
  if (!env.PAYOS_CLIENT_ID?.trim()) missingEnvKeys.push("PAYOS_CLIENT_ID");
  if (!env.PAYOS_API_KEY?.trim()) missingEnvKeys.push("PAYOS_API_KEY");
  if (!env.PAYOS_CHECKSUM_KEY?.trim()) missingEnvKeys.push("PAYOS_CHECKSUM_KEY");
  if (!liveBankAcc) missingEnvKeys.push("OPALX_VIETQR_ACCOUNT_NO");
  if (!fujiIssuerKeyConfigured) missingEnvKeys.push("AVALANCHE_ISSUER_PRIVATE_KEY");
  if (!isNonZeroAddress(addrs.enterpriseGateway)) missingEnvKeys.push("NEXT_PUBLIC_ENTERPRISE_GATEWAY_ADDRESS");
  if (!isNonZeroAddress(addrs.bankGateway)) missingEnvKeys.push("NEXT_PUBLIC_BANK_GATEWAY_ADDRESS");
  if (!isNonZeroAddress(addrs.opalxCore)) missingEnvKeys.push("NEXT_PUBLIC_OPALX_CORE_ADDRESS");

  const bankBin = env.OPALX_VIETQR_BANK_BIN?.trim() || "970422";
  const bankName = env.OPALX_VIETQR_BANK_NAME?.trim() || "MB Bank";
  const liveDirectProfile: MerchantAccountProfile = {
    kind: "LIVE_DIRECT_ACCOUNT",
    railMode: "LIVE_BANK",
    badgeLabel: "[LIVE BANK]",
    title: "Live Direct Account ([LIVE BANK])",
    subtitle: "Direct NAPAS 247 A2A into business bank account · PayOS HMAC Webhook",
    sellerName: env.OPALX_LIVE_MERCHANT_NAME?.trim() || "CONG TY TNHH OPALX VIETNAM",
    sellerTaxId: env.OPALX_LIVE_MERCHANT_TAX_ID?.trim() || "0312345678",
    sellerEnterpriseAddress: normalizeAddress(env.OPALX_LIVE_ENTERPRISE_ADDRESS),
    bankName: `${bankName} (BIN ${bankBin})`,
    bankBin,
    maskedBankAccount: maskBankAccount(liveBankAcc),
    settlementRail: "PayOS NAPAS 247 A2A + 3-Gateway Fuji AVAX Contracts",
    creditEligibilityNote:
      "Awards +10 reputation credits on OpalXGoCore (GOLD_NET30 >= 100 pts) on valid live reconciliation.",
  };

  const readyForLiveBank = payosConfigured && bankAccountConfigured;
  const readyForLiveFujiTx = fujiIssuerKeyConfigured && fujiContractsDeployed;
  const sandboxForcedFalse =
    (env.OPALX_SANDBOX_MODE?.trim().toLowerCase() ?? "true") === "false";
  const defaultProfile: AccountProfileKind =
    readyForLiveBank && sandboxForcedFalse ? "LIVE_DIRECT_ACCOUNT" : "DEMO_ACCOUNT";

  return {
    defaultProfile,
    profiles: {
      DEMO_ACCOUNT: DEFAULT_DEMO_PROFILE,
      LIVE_DIRECT_ACCOUNT: liveDirectProfile,
    },
    liveReadiness: {
      payosConfigured,
      bankAccountConfigured,
      fujiIssuerKeyConfigured,
      fujiContractsDeployed,
      ...(fujiWalletAddress ? { fujiWalletAddress } : {}),
      readyForLiveBank,
      readyForLiveFujiTx,
      missingEnvKeys,
    },
    faucets: AVAX_FAUCET_RESOURCES,
    checkedAtIso: new Date().toISOString(),
  };
}
