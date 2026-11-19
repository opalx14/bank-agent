import { formatEther, keccak256, parseEther, toHex } from "viem";
import type { AvaxFeeSettlementReceipt, GuaranteeProofBundle } from "@/types";
import { BANK_GATEWAY_ABI, ENTERPRISE_GATEWAY_ABI, OPALX_CORE_ABI } from "./avalanche.abis";
import {
  AVALANCHE_FUJI_NETWORK,
  getFujiPublicClient,
  getGatewayAddresses,
} from "./avalanche.network";
import { isAgentSignerEnabled } from "./avalanche.agent-wallet";
import {
  getFujiSignerAccount,
  getFujiWalletClient,
  isLiveBroadcastEnabled,
  toBytes32Id,
} from "./avalanche.signer";

function isSigningReady(): boolean {
  return isLiveBroadcastEnabled() && isAgentSignerEnabled();
}

function mockHash(seed: string): `0x${string}` {
  return keccak256(toHex(`opalx-offline:${seed}`));
}

export function vndToCollateralWei(amountVnd: number): bigint {
  const ratio = Math.max(0.0001, Math.min(0.01, amountVnd / 10_000_000_000));
  return parseEther(ratio.toFixed(6));
}

export async function broadcastOrderRegistration(params: {
  orderCommitment: `0x${string}`;
  invoiceCommitment: `0x${string}`;
  enterpriseAddress: `0x${string}`;
}): Promise<{ txHash: `0x${string}`; live: boolean }> {
  const addrs = getGatewayAddresses();
  const wallet = getFujiWalletClient();
  if (!isSigningReady() || !wallet) {
    return { txHash: mockHash(`ent:${params.orderCommitment}`), live: false };
  }

  const pub = getFujiPublicClient();
  const txHash = await wallet.writeContract({
    address: addrs.enterpriseGateway,
    abi: ENTERPRISE_GATEWAY_ABI,
    functionName: "registerEnterpriseOrder",
    args: [params.orderCommitment, params.invoiceCommitment, params.enterpriseAddress],
  });
  await pub.waitForTransactionReceipt({ hash: txHash });
  return { txHash, live: true };
}

export async function broadcastFullReconciliationProofs(params: {
  guaranteeId: string;
  orderCommitment: `0x${string}`;
  bankRefCommitment: `0x${string}`;
  invoiceCommitment: `0x${string}`;
  enterpriseAddress: `0x${string}`;
  amountVnd: number;
  sandbox: boolean;
  existingEnterpriseTxHash?: `0x${string}`;
}): Promise<GuaranteeProofBundle> {
  const collateralWei = vndToCollateralWei(params.amountVnd);
  const collateralAvax = formatEther(collateralWei);
  const addrs = getGatewayAddresses();
  const wallet = getFujiWalletClient();

  if (!isSigningReady() || !wallet) {
    return {
      mode: "OFFLINE_FALLBACK",
      enterpriseTxHash: params.existingEnterpriseTxHash ?? mockHash(`ent:${params.orderCommitment}`),
      bankTxHash: mockHash(`bank:${params.bankRefCommitment}`),
      guaranteeTxHash: mockHash(`core:${params.guaranteeId}`),
      collateralAvax,
    };
  }

  const pub = getFujiPublicClient();
  let enterpriseTxHash = params.existingEnterpriseTxHash;
  const alreadyRegistered = await pub.readContract({
    address: addrs.enterpriseGateway,
    abi: ENTERPRISE_GATEWAY_ABI,
    functionName: "isOrderRegistered",
    args: [params.orderCommitment],
  });

  if (!alreadyRegistered) {
    enterpriseTxHash = await wallet.writeContract({
      address: addrs.enterpriseGateway,
      abi: ENTERPRISE_GATEWAY_ABI,
      functionName: "registerEnterpriseOrder",
      args: [params.orderCommitment, params.invoiceCommitment, params.enterpriseAddress],
    });
    await pub.waitForTransactionReceipt({ hash: enterpriseTxHash });
  }

  const bankTxHash = await wallet.writeContract({
    address: addrs.bankGateway,
    abi: BANK_GATEWAY_ABI,
    functionName: "attestBankSettlement",
    args: [params.bankRefCommitment, params.orderCommitment],
  });
  await pub.waitForTransactionReceipt({ hash: bankTxHash });

  const guaranteeTxHash = await wallet.writeContract({
    address: addrs.opalxCore,
    abi: OPALX_CORE_ABI,
    functionName: "issueGuarantee",
    args: [
      toBytes32Id(params.guaranteeId),
      params.orderCommitment,
      params.bankRefCommitment,
      params.invoiceCommitment,
      params.enterpriseAddress,
      collateralWei,
      params.sandbox,
    ],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: guaranteeTxHash });

  return {
    mode: "LIVE_FUJI_AVAX",
    enterpriseTxHash: enterpriseTxHash ?? mockHash(`ent:${params.orderCommitment}`),
    bankTxHash,
    guaranteeTxHash,
    collateralAvax,
    blockNumber: Number(receipt.blockNumber),
  };
}

export async function broadcastVerificationFeeAvax(
  guaranteeId: string,
): Promise<AvaxFeeSettlementReceipt> {
  const addrs = getGatewayAddresses();
  const wallet = getFujiWalletClient();
  const signer = getFujiSignerAccount();
  const feeWei = parseEther(String(AVALANCHE_FUJI_NETWORK.minVerificationFeeAvax));
  const payer = signer?.address ?? "0x1111111111111111111111111111111111111111";

  if (!isSigningReady() || !wallet) {
    return {
      guaranteeId,
      chainId: 43113,
      currency: "AVAX",
      feeAvax: formatEther(feeWei),
      feeWei: feeWei.toString(),
      payer,
      opalxCoreAddress: addrs.opalxCore,
      mode: "OFFLINE_FALLBACK",
      txHash: mockHash(`fee:${guaranteeId}:${Date.now()}`),
      settledAtIso: new Date().toISOString(),
    };
  }

  const pub = getFujiPublicClient();
  const txHash = await wallet.writeContract({
    address: addrs.opalxCore,
    abi: OPALX_CORE_ABI,
    functionName: "settleVerificationFee",
    args: [toBytes32Id(guaranteeId)],
    value: feeWei,
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: txHash });

  return {
    guaranteeId,
    chainId: 43113,
    currency: "AVAX",
    feeAvax: formatEther(feeWei),
    feeWei: feeWei.toString(),
    payer,
    opalxCoreAddress: addrs.opalxCore,
    mode: "LIVE_FUJI_AVAX",
    txHash,
    blockNumber: Number(receipt.blockNumber),
    settledAtIso: new Date().toISOString(),
  };
}

export async function broadcastCorePauseState(
  paused: boolean,
): Promise<{ txHash: `0x${string}`; mode: "LIVE_FUJI_AVAX" | "OFFLINE_FALLBACK" }> {
  const addrs = getGatewayAddresses();
  const wallet = getFujiWalletClient();
  if (!isSigningReady() || !wallet) {
    return { txHash: mockHash(`pause:${paused}:${Date.now()}`), mode: "OFFLINE_FALLBACK" };
  }

  const pub = getFujiPublicClient();
  const txHash = await wallet.writeContract({
    address: addrs.opalxCore,
    abi: OPALX_CORE_ABI,
    functionName: paused ? "pause" : "unpause",
  });
  await pub.waitForTransactionReceipt({ hash: txHash });
  return { txHash, mode: "LIVE_FUJI_AVAX" };
}
