import type {
  BankAttestationProof,
  EnterpriseOrder,
  GuaranteeCertificate,
  MerchantBankConfig,
  OrderStatus,
  PolicyAuditLogEntry,
  UserWalletSession,
} from "@/types";
import { normalizeAccountHolderName } from "@/core/enterprise/enterprise.catalog";
import { computePrintFeeBreakdown } from "@/core/opalx/opalx.print-fee";
import { buildDefaultBankConfig, buildInitialLedgerState, type LedgerState } from "./ledger.seed";
import { readRawLedgerJson, writeRawLedgerJson } from "./ledger.storage-adapter";

function persistLedger(state: LedgerState): void {
  writeRawLedgerJson(JSON.stringify(state, null, 2));
}

const LEGACY_SAAS_CAT = "SaaS & H\u1ea1 t\u1ea7ng AI";
const LEGACY_GYM_CAT = "Ph\u00f2ng T\u1eadp Gym & Yoga";
const LEGACY_CLOUD_PKG = "G\u00f3i API & GPU Inference Cloud";
const LEGACY_TRIAL_PKG = "G\u00f3i T\u1eadp Th\u1eed 1 Th\u00e1ng";

function migrateLegacyCaliLabels<T extends { enterpriseId?: string; enterpriseName?: string; categoryLabel?: string; productName?: string }>(
  item: T,
): T {
  const isLegacy =
    item.enterpriseId === "cali-tech-cloud" ||
    item.enterpriseName === "Cali Tech Cloud" ||
    item.categoryLabel === LEGACY_SAAS_CAT ||
    item.categoryLabel === LEGACY_GYM_CAT ||
    item.productName === LEGACY_TRIAL_PKG;
  if (!isLegacy) return item;
  return {
    ...item,
    enterpriseId: "california-fitness",
    enterpriseName: "California Fitness & Yoga",
    categoryLabel: "Fitness, Gym & Yoga",
    productName:
      item.productName === LEGACY_CLOUD_PKG || item.productName === LEGACY_TRIAL_PKG
        ? "1-Month Trial Pass"
        : item.productName,
  };
}

/** Reads persistent atomic ledger JSON, cold-starting cleanly if absent or corrupt. */
export function readLedger(): LedgerState {
  const raw = readRawLedgerJson();
  if (raw === null) {
    const initial = buildInitialLedgerState();
    persistLedger(initial);
    return initial;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<LedgerState>;
    if (!Array.isArray(parsed.orders) || !Array.isArray(parsed.guarantees)) {
      throw new Error("INVALID_LEDGER_SHAPE");
    }
    return {
      orders: parsed.orders.map((o) => migrateLegacyCaliLabels(o)),
      bankAttestations: Array.isArray(parsed.bankAttestations) ? parsed.bankAttestations : [],
      usedBankRefs: Array.isArray(parsed.usedBankRefs) ? parsed.usedBankRefs : [],
      guarantees: parsed.guarantees.map((g) => migrateLegacyCaliLabels(g)),
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
      vaultPaused: Boolean(parsed.vaultPaused),
      bankConfig: parsed.bankConfig ?? buildDefaultBankConfig(),
      activeUserSession: parsed.activeUserSession ?? null,
      ...(Array.isArray(parsed.bankRails) ? { bankRails: parsed.bankRails } : {}),
      ...(Array.isArray(parsed.enterprises) ? { enterprises: parsed.enterprises } : {}),
    };
  } catch {
    const fallback = buildInitialLedgerState();
    persistLedger(fallback);
    return fallback;
  }
}

export function upsertOrder(order: EnterpriseOrder): EnterpriseOrder {
  const ledger = readLedger();
  const idx = ledger.orders.findIndex((o) => o.orderCode === order.orderCode);
  if (idx >= 0) {
    ledger.orders[idx] = order;
  } else {
    ledger.orders.unshift(order);
  }
  persistLedger(ledger);
  return order;
}

export function findOrder(orderCode: number): EnterpriseOrder | undefined {
  return readLedger().orders.find((o) => o.orderCode === orderCode);
}

export function findGuarantee(guaranteeId: string): GuaranteeCertificate | undefined {
  const needle = guaranteeId.trim().toLowerCase();
  return readLedger().guarantees.find((g) => g.guaranteeId.toLowerCase() === needle);
}

export function isBankRefUsed(commitment: string): boolean {
  return readLedger().usedBankRefs.some((x) => x.toLowerCase() === commitment.toLowerCase());
}

export function setVaultPauseState(paused: boolean): boolean {
  const ledger = readLedger();
  ledger.vaultPaused = paused;
  persistLedger(ledger);
  return ledger.vaultPaused;
}

export function getBankConfig(): MerchantBankConfig {
  return readLedger().bankConfig ?? buildDefaultBankConfig();
}

export function saveBankConfig(cfg: MerchantBankConfig): MerchantBankConfig {
  const ledger = readLedger();
  const next: MerchantBankConfig = {
    ...cfg,
    accountNo: cfg.accountNo.trim(),
    accountName: normalizeAccountHolderName(cfg.accountName) || "OPALX MERCHANT DEMO",
    updatedAtIso: cfg.updatedAtIso || new Date().toISOString(),
  };
  ledger.bankConfig = next;
  persistLedger(ledger);
  return next;
}

export function getActiveUserSession(): UserWalletSession | null {
  return readLedger().activeUserSession ?? null;
}

export function saveActiveUserSession(session: UserWalletSession | null): UserWalletSession | null {
  const ledger = readLedger();
  ledger.activeUserSession = session;
  persistLedger(ledger);
  return ledger.activeUserSession ?? null;
}

export function attachFeeTxToGuarantee(guaranteeId: string, txHash: `0x${string}`): void {
  const ledger = readLedger();
  const target = ledger.guarantees.find(
    (g) => g.guaranteeId.toLowerCase() === guaranteeId.toLowerCase(),
  );
  if (target) {
    target.proofBundle.feeSettlementTxHash = txHash;
    persistLedger(ledger);
  }
}

export function recordGuaranteePrintFee(params: {
  guaranteeId: string;
  printHash: `0x${string}`;
  txHash: `0x${string}`;
}): GuaranteeCertificate | undefined {
  const ledger = readLedger();
  const target = ledger.guarantees.find(
    (g) => g.guaranteeId.toLowerCase() === params.guaranteeId.toLowerCase(),
  );
  if (!target) return undefined;
  const nextCount = (target.printCount ?? 0) + 1;
  const breakdown = computePrintFeeBreakdown(nextCount);
  target.printCount = nextCount;
  target.feePerPrintAvax = String(breakdown.protocolFeePerPrintAvax);
  target.estimatedGasPerPrintAvax = String(breakdown.estimatedGasPerPrintAvax);
  target.totalPrintFeeAvax = String(breakdown.cumulativeFeeAvax);
  target.lastPrintHash = params.printHash;
  target.lastPrintTxHash = params.txHash;
  target.proofBundle.feeSettlementTxHash = params.txHash;
  persistLedger(ledger);
  return target;
}

export function appendLedgerOutcome(params: {
  orderCode: number;
  nextStatus: OrderStatus;
  bankAttestation?: BankAttestationProof;
  bankRefCommitment?: string;
  guarantee?: GuaranteeCertificate;
  auditLog: PolicyAuditLogEntry;
}): void {
  const ledger = readLedger();
  const order = ledger.orders.find((o) => o.orderCode === params.orderCode);
  if (order) {
    order.status = params.nextStatus;
    order.updatedAtIso = new Date().toISOString();
    if (params.guarantee) {
      order.guaranteeId = params.guarantee.guaranteeId;
    }
  }
  if (params.bankAttestation) {
    ledger.bankAttestations.unshift(params.bankAttestation);
  }
  if (params.bankRefCommitment && !ledger.usedBankRefs.includes(params.bankRefCommitment)) {
    ledger.usedBankRefs.push(params.bankRefCommitment);
  }
  if (params.guarantee) {
    ledger.guarantees.unshift(params.guarantee);
  }
  ledger.auditLogs.unshift(params.auditLog);
  persistLedger(ledger);
}

export function mutateLedger<T>(mutator: (state: LedgerState) => T): T {
  const ledger = readLedger();
  const result = mutator(ledger);
  persistLedger(ledger);
  return result;
}
