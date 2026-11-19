import { formatEther } from "viem";
import type { EnterpriseCreditTier } from "@/types";
import { BANK_GATEWAY_ABI, ENTERPRISE_GATEWAY_ABI, OPALX_CORE_ABI } from "./abis";
import {
  getFujiPublicClient,
  getGatewayAddresses,
  isNonZeroAddress,
} from "./network";
import { deriveFujiPublicAddress, toBytes32Id } from "./signer";

export interface CoreOnChainState {
  paused: boolean;
  totalReserveAvax: number;
  lockedCollateralAvax: number;
  availableReserveAvax: number;
  protocolFeePoolAvax: number;
  dailyCapAvax: number;
  spentInWindowAvax: number;
  remainingDailyAllowanceAvax: number;
  minVerificationFeeAvax: number;
  totalOrdersRegistered: number;
  totalBankAttestations: number;
  totalGuaranteesIssued: number;
  liveBlockNumber: number;
}

export interface OnChainGuaranteeVerification {
  guaranteeId: string;
  chainId: 43113;
  opalxCoreAddress: `0x${string}`;
  valid: boolean;
  revoked: boolean;
  sandbox: boolean;
  source: "ON_CHAIN_FUJI_RPC" | "OFFLINE_UNAVAILABLE";
  enterprise?: `0x${string}`;
  collateralAvax?: string;
  issuedAt?: number;
  orderCommitment?: `0x${string}`;
  bankRefCommitment?: `0x${string}`;
  invoiceCommitment?: `0x${string}`;
  creditTier?: EnterpriseCreditTier;
  reputationCredits?: number;
  liveBlockNumber?: number;
}

export function resolveCreditTier(credits: number): EnterpriseCreditTier {
  if (credits >= 100) return "GOLD_NET30";
  if (credits >= 30) return "SILVER_NET15";
  return "STANDARD";
}

/** Reads live AVAX reserve, collateral, fee pool, pause & counter state from all 3 contracts. */
export async function readPortalContractsTelemetry(): Promise<CoreOnChainState | null> {
  if (process.env.OPALX_OFFLINE_TEST === "1") return null;
  const addrs = getGatewayAddresses();
  if (!isNonZeroAddress(addrs.opalxCore)) return null;

  try {
    const client = getFujiPublicClient();
    const [
      paused,
      totalReserveWei,
      lockedCollateralWei,
      protocolFeePoolWei,
      dailyCapWei,
      spentInWindowWei,
      remainingWei,
      minFeeWei,
      totalGuarantees,
      totalOrders,
      totalBankAttestations,
      blockNumber,
    ] = await Promise.all([
      client.readContract({ address: addrs.opalxCore, abi: OPALX_CORE_ABI, functionName: "paused" }),
      client.readContract({ address: addrs.opalxCore, abi: OPALX_CORE_ABI, functionName: "totalReserveWei" }),
      client.readContract({ address: addrs.opalxCore, abi: OPALX_CORE_ABI, functionName: "lockedCollateralWei" }),
      client.readContract({ address: addrs.opalxCore, abi: OPALX_CORE_ABI, functionName: "protocolFeePoolWei" }),
      client.readContract({ address: addrs.opalxCore, abi: OPALX_CORE_ABI, functionName: "dailyCapWei" }),
      client.readContract({ address: addrs.opalxCore, abi: OPALX_CORE_ABI, functionName: "spentInWindowWei" }),
      client.readContract({ address: addrs.opalxCore, abi: OPALX_CORE_ABI, functionName: "remainingDailyAllowanceWei" }),
      client.readContract({ address: addrs.opalxCore, abi: OPALX_CORE_ABI, functionName: "minVerificationFeeWei" }),
      client.readContract({ address: addrs.opalxCore, abi: OPALX_CORE_ABI, functionName: "totalGuaranteesIssued" }),
      isNonZeroAddress(addrs.enterpriseGateway)
        ? client.readContract({ address: addrs.enterpriseGateway, abi: ENTERPRISE_GATEWAY_ABI, functionName: "totalOrdersRegistered" })
        : Promise.resolve(0n),
      isNonZeroAddress(addrs.bankGateway)
        ? client.readContract({ address: addrs.bankGateway, abi: BANK_GATEWAY_ABI, functionName: "totalSettlementsAttested" })
        : Promise.resolve(0n),
      client.getBlockNumber(),
    ]);

    const totalReserveAvax = Number(formatEther(totalReserveWei));
    const lockedCollateralAvax = Number(formatEther(lockedCollateralWei));
    return {
      paused,
      totalReserveAvax,
      lockedCollateralAvax,
      availableReserveAvax: Math.max(0, Number((totalReserveAvax - lockedCollateralAvax).toFixed(6))),
      protocolFeePoolAvax: Number(formatEther(protocolFeePoolWei)),
      dailyCapAvax: Number(formatEther(dailyCapWei)),
      spentInWindowAvax: Number(formatEther(spentInWindowWei)),
      remainingDailyAllowanceAvax: Number(formatEther(remainingWei)),
      minVerificationFeeAvax: Number(formatEther(minFeeWei)),
      totalOrdersRegistered: Number(totalOrders),
      totalBankAttestations: Number(totalBankAttestations),
      totalGuaranteesIssued: Number(totalGuarantees),
      liveBlockNumber: Number(blockNumber),
    };
  } catch {
    return null;
  }
}

/** Reads and verifies an on-chain guarantee certificate directly from OpalXGoCore on Fuji. */
export async function verifyGuaranteeOnFuji(
  guaranteeId: string,
): Promise<OnChainGuaranteeVerification> {
  const addrs = getGatewayAddresses();
  if (process.env.OPALX_OFFLINE_TEST === "1" || !isNonZeroAddress(addrs.opalxCore)) {
    return {
      guaranteeId,
      chainId: 43113,
      opalxCoreAddress: addrs.opalxCore,
      valid: false,
      revoked: false,
      sandbox: true,
      source: "OFFLINE_UNAVAILABLE",
    };
  }

  try {
    const client = getFujiPublicClient();
    const [[valid, record], liveBlockNumber] = await Promise.all([
      client.readContract({
        address: addrs.opalxCore,
        abi: OPALX_CORE_ABI,
        functionName: "verifyGuarantee",
        args: [toBytes32Id(guaranteeId)],
      }),
      client.getBlockNumber(),
    ]);

    const creditsRaw = record.enterprise
      ? await client
          .readContract({
            address: addrs.opalxCore,
            abi: OPALX_CORE_ABI,
            functionName: "enterpriseReputationCredits",
            args: [record.enterprise],
          })
          .catch(() => 0n)
      : 0n;
    const reputationCredits = Number(creditsRaw);

    return {
      guaranteeId,
      chainId: 43113,
      opalxCoreAddress: addrs.opalxCore,
      valid: Boolean(valid),
      revoked: Boolean(record.revoked),
      sandbox: Boolean(record.sandbox),
      source: "ON_CHAIN_FUJI_RPC",
      enterprise: record.enterprise,
      collateralAvax: formatEther(record.collateralWei),
      issuedAt: Number(record.issuedAt),
      orderCommitment: record.orderCommitment,
      bankRefCommitment: record.bankRefCommitment,
      invoiceCommitment: record.invoiceCommitment,
      creditTier: resolveCreditTier(reputationCredits),
      reputationCredits,
      liveBlockNumber: Number(liveBlockNumber),
    };
  } catch {
    return {
      guaranteeId,
      chainId: 43113,
      opalxCoreAddress: addrs.opalxCore,
      valid: false,
      revoked: false,
      sandbox: true,
      source: "OFFLINE_UNAVAILABLE",
    };
  }
}

export async function readWalletAvaxBalance(): Promise<string | null> {
  if (process.env.OPALX_OFFLINE_TEST === "1") return null;
  const addr = deriveFujiPublicAddress(process.env.AVALANCHE_ISSUER_PRIVATE_KEY);
  if (!addr) return null;
  try {
    const bal = await getFujiPublicClient().getBalance({ address: addr });
    return formatEther(bal);
  } catch {
    return null;
  }
}
