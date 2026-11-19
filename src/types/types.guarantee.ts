import type { RailMode } from "./types.enterprise";

export type PolicyVerdict = "ALLOW" | "REQUIRE_APPROVAL" | "DENY";

export type EnterpriseCreditTier = "STANDARD" | "SILVER_NET15" | "GOLD_NET30";

export interface PolicyEvaluationResult {
  verdict: PolicyVerdict;
  reasonCode: string;
  wasmExecuted: boolean;
  checks: {
    webhookSignatureValid: boolean;
    bankRefUnique: boolean;
    amountExactMatch: boolean;
    invoiceXmlValid: boolean;
    washTradeClear: boolean;
    withinAutoApproveLimit: boolean;
    vaultActive: boolean;
  };
  evaluatedAtIso: string;
}

export interface GuaranteeProofBundle {
  mode: "LIVE_FUJI_AVAX" | "OFFLINE_FALLBACK";
  enterpriseTxHash: `0x${string}`;
  bankTxHash: `0x${string}`;
  guaranteeTxHash: `0x${string}`;
  feeSettlementTxHash?: `0x${string}`;
  collateralAvax: string;
  blockNumber?: number;
}

export type GuaranteeRightKind = "CHECKIN_PASS" | "VAULT_COVERAGE" | "ERC8004_PRIVILEGE";

export interface GuaranteeRightClaim {
  id: string;
  kind: GuaranteeRightKind;
  label: string;
  claimedByEmail?: string;
  walletAddress: `0x${string}`;
  signature: `0x${string}`;
  digestHex: `0x${string}`;
  claimedAtIso: string;
  verificationNote: string;
}

export interface GuaranteeCertificate {
  guaranteeId: string;
  orderCode: number;
  amountVnd: number;
  railMode: RailMode;
  sandbox: boolean;
  enterpriseId?: string;
  enterpriseName?: string;
  categoryLabel?: string;
  productName?: string;
  payerName?: string;
  buyerEmail?: string;
  benefits?: string[];
  claimedRights?: GuaranteeRightClaim[];
  description?: string;
  maskedBankRef: string;
  orderCommitment: `0x${string}`;
  bankRefCommitment: `0x${string}`;
  invoiceCommitment: `0x${string}`;
  enterpriseAddress: `0x${string}`;
  collateralAvax: string;
  reputationCreditsAwarded: number;
  creditTierAfter: EnterpriseCreditTier;
  proofBundle: GuaranteeProofBundle;
  confirmedByWallet?: `0x${string}`;
  merchantContractAddress?: `0x${string}`;
  printCount?: number;
  feePerPrintAvax?: string;
  estimatedGasPerPrintAvax?: string;
  totalPrintFeeAvax?: string;
  lastPrintHash?: `0x${string}`;
  lastPrintTxHash?: `0x${string}`;
  verifyPath: string;
  issuedAtIso: string;
  revoked: boolean;
}

export interface AvaxTreasurySnapshot {
  chainId: 43113;
  currency: "AVAX";
  totalReserveAvax: number;
  lockedCollateralAvax: number;
  availableReserveAvax: number;
  protocolFeePoolAvax: number;
  utilizationBps: number;
  dailyCapAvax: number;
  spentInWindowAvax: number;
  remainingDailyAllowanceAvax: number;
  minVerificationFeeAvax: number;
  vaultPaused: boolean;
  vndPerAvaxRate: number;
  guaranteedCoverageVnd: number;
  creditTier: EnterpriseCreditTier;
  net30CreditLimitAvax: number;
  liveFujiBlockNumber?: number;
  contracts: {
    enterpriseGateway: `0x${string}`;
    bankGateway: `0x${string}`;
    opalxCore: `0x${string}`;
  };
}

export interface PolicyAuditLogEntry {
  id: string;
  orderCode: number;
  railMode: RailMode;
  amountVnd: number;
  verdict: PolicyVerdict;
  reasonCode: string;
  guaranteeId?: string;
  txHash?: `0x${string}`;
  detail: string;
  createdAtIso: string;
}

export interface AvaxFeeSettlementReceipt {
  guaranteeId: string;
  chainId: 43113;
  currency: "AVAX";
  feeAvax: string;
  feeWei: string;
  payer: `0x${string}`;
  opalxCoreAddress: `0x${string}`;
  mode: "LIVE_FUJI_AVAX" | "OFFLINE_FALLBACK";
  txHash: `0x${string}`;
  blockNumber?: number;
  settledAtIso: string;
}

export interface AvalancheTechPillar {
  id: "FUJI_CHAIN" | "THREE_GATEWAYS" | "WASM_KERNEL" | "ERC_8004" | "X402_USDC" | "PASSKEY_P256";
  title: string;
  status: "VERIFIED" | "STANDBY";
  summary: string;
  proofRef: string;
  explorerUrl?: string;
}

export interface AvalancheStackVerification {
  checkedAtIso: string;
  chainId: 43113;
  rpcHealthy: boolean;
  liveBlockNumber: number | null;
  gasPriceGwei: number | null;
  guaranteeChecked?: {
    guaranteeId: string;
    onChainValid: boolean;
    source: "ON_CHAIN_FUJI_RPC" | "OFFLINE_UNAVAILABLE";
    collateralAvax?: string;
  };
  contracts: {
    enterpriseGateway: `0x${string}`;
    bankGateway: `0x${string}`;
    opalxCore: `0x${string}`;
  };
  erc8004: {
    identityRegistry: `0x${string}`;
    reputationRegistry: `0x${string}`;
    validationRegistry: `0x${string}`;
    agentCardEndpoint: string;
  };
  x402: {
    assetAddress: `0x${string}`;
    domainName: "USD Coin";
    domainVersion: "2";
    caip2: "eip155:43113";
    settleEndpoint: "/api/x402/settle";
  };
  passkeyP256Verifier: `0x${string}`;
  wasmPolicyKernel: {
    verdictSample: "ALLOW" | "REQUIRE_APPROVAL" | "DENY";
    wasmExecuted: boolean;
    zeroPiiOnChain: boolean;
  };
  pillars: AvalancheTechPillar[];
}
