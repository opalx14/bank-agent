import type {
  AvaxTreasurySnapshot,
  EnterpriseCreditTier,
  GuaranteeCertificate,
} from "@/types";
import { AVALANCHE_FUJI_NETWORK, getGatewayAddresses } from "@/lib/avalanche/network";
import { readPortalContractsTelemetry, type CoreOnChainState } from "@/lib/avalanche/reader";
import { readLedger } from "@/core/ledger/store";

export function resolveTierFromCredits(credits: number): EnterpriseCreditTier {
  if (credits >= 100) return "GOLD_NET30";
  if (credits >= 30) return "SILVER_NET15";
  return "STANDARD";
}

export function computeLiquidityCredits(guarantees: GuaranteeCertificate[]): number {
  return guarantees.reduce((sum, g) => {
    if (g.revoked || g.sandbox) return sum;
    return sum + (g.reputationCreditsAwarded || 10);
  }, 0);
}

function computeCreditLimitAvax(tier: EnterpriseCreditTier, availableAvax: number): number {
  if (tier === "GOLD_NET30") return Number((availableAvax * 0.25).toFixed(4));
  if (tier === "SILVER_NET15") return Number((availableAvax * 0.1).toFixed(4));
  return 0;
}

/** Computes pure-AVAX vault reserve, collateral lock, fee pool, and credit tier snapshot. */
export function buildAvaxTreasurySnapshot(options?: {
  onChain?: CoreOnChainState | null;
  guarantees?: GuaranteeCertificate[];
  vaultPaused?: boolean;
}): AvaxTreasurySnapshot {
  const ledger = options?.guarantees ? null : readLedger();
  const guarantees = options?.guarantees ?? ledger?.guarantees ?? [];
  const onChain = options?.onChain ?? null;

  const totalReserveAvax =
    onChain && onChain.totalReserveAvax > 0 ? onChain.totalReserveAvax : 0.005;
  const ledgerLockedAvax = guarantees.reduce((acc, g) => {
    if (g.revoked) return acc;
    const val = Number(g.collateralAvax);
    return acc + (Number.isFinite(val) ? val : 0);
  }, 0);
  const lockedCollateralAvax = Number(
    Math.max(ledgerLockedAvax, onChain?.lockedCollateralAvax ?? 0).toFixed(6),
  );
  const availableReserveAvax = Math.max(
    0,
    Number((totalReserveAvax - lockedCollateralAvax).toFixed(6)),
  );
  const dailyCapAvax =
    onChain && onChain.dailyCapAvax > 0
      ? onChain.dailyCapAvax
      : AVALANCHE_FUJI_NETWORK.defaultDailyCapAvax;
  const spentInWindowAvax = Number(
    Math.max(ledgerLockedAvax, onChain?.spentInWindowAvax ?? 0).toFixed(6),
  );
  const remainingDailyAllowanceAvax = Math.max(
    0,
    Number((dailyCapAvax - spentInWindowAvax).toFixed(6)),
  );
  const utilizationBps =
    totalReserveAvax > 0
      ? Math.min(10_000, Math.round((lockedCollateralAvax / totalReserveAvax) * 10_000))
      : 0;

  const guaranteedCoverageVnd = guarantees.reduce(
    (sum, g) => (g.revoked ? sum : sum + g.amountVnd),
    0,
  );
  const credits = computeLiquidityCredits(guarantees);
  const creditTier = resolveTierFromCredits(credits);
  const contracts = getGatewayAddresses();

  return {
    chainId: 43113,
    currency: "AVAX",
    totalReserveAvax,
    lockedCollateralAvax,
    availableReserveAvax,
    protocolFeePoolAvax: onChain?.protocolFeePoolAvax ?? 0.00001,
    utilizationBps,
    dailyCapAvax,
    spentInWindowAvax,
    remainingDailyAllowanceAvax,
    minVerificationFeeAvax:
      onChain?.minVerificationFeeAvax ?? AVALANCHE_FUJI_NETWORK.minVerificationFeeAvax,
    vaultPaused: Boolean(onChain?.paused || options?.vaultPaused || ledger?.vaultPaused),
    vndPerAvaxRate: AVALANCHE_FUJI_NETWORK.defaultVndPerAvaxRate,
    guaranteedCoverageVnd,
    creditTier,
    net30CreditLimitAvax: computeCreditLimitAvax(creditTier, availableReserveAvax),
    ...(onChain?.liveBlockNumber !== undefined
      ? { liveFujiBlockNumber: onChain.liveBlockNumber }
      : {}),
    contracts,
  };
}

export async function getLiveAvaxTreasurySnapshot(
  includeRpc = true,
): Promise<AvaxTreasurySnapshot> {
  const onChain = includeRpc ? await readPortalContractsTelemetry() : null;
  return buildAvaxTreasurySnapshot({ onChain });
}
