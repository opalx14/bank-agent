import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type {
  BankAttestationProof,
  BankPartnerRail,
  EinvoiceSummary,
  EnterpriseOrder,
  GuaranteeCertificate,
  MerchantBankConfig,
  PolicyAuditLogEntry,
  RailMode,
  UserWalletSession,
  VerifiedEnterpriseProfile,
} from "@/types";
import { buildOrderQrStub } from "@/core/bank/vietqr-builder";
import {
  findSupportedVnBank,
  normalizeAccountHolderName,
  resolveEnterpriseCategory,
} from "@/core/enterprise/catalog";
import { extractTt78InvoiceSummary } from "@/core/enterprise/einvoice-parser";
import { buildSampleTt78Xml } from "@/core/enterprise/einvoice-samples";
import { computeCommitmentHash } from "@/lib/avalanche/signer";

interface SeedLiveProofs {
  guaranteeId: string;
  orderCode: number;
  orderCommitment: `0x${string}`;
  bankRefCommitment: `0x${string}`;
  invoiceCommitment: `0x${string}`;
  enterpriseAddress: `0x${string}`;
  collateralWei: string;
  enterpriseTxHash: `0x${string}`;
  bankTxHash: `0x${string}`;
  guaranteeTxHash: `0x${string}`;
  feeSettlementTxHash: `0x${string}`;
  feeBlock?: number;
  seededAtIso: string;
}

export interface LedgerState {
  orders: EnterpriseOrder[];
  bankAttestations: BankAttestationProof[];
  usedBankRefs: string[];
  guarantees: GuaranteeCertificate[];
  auditLogs: PolicyAuditLogEntry[];
  vaultPaused: boolean;
  bankConfig?: MerchantBankConfig;
  activeUserSession?: UserWalletSession | null;
  bankRails?: BankPartnerRail[];
  enterprises?: VerifiedEnterpriseProfile[];
}

export function buildDefaultBankConfig(nowIso = new Date().toISOString()): MerchantBankConfig {
  const bankBin = process.env.OPALX_VIETQR_BANK_BIN?.trim() || "970422";
  const supported = findSupportedVnBank(bankBin);
  const accountNo = process.env.OPALX_VIETQR_ACCOUNT_NO?.trim() || "03120006789";
  const rawName = process.env.OPALX_LIVE_MERCHANT_NAME?.trim() || "OPALX MERCHANT DEMO";
  const accountName = normalizeAccountHolderName(rawName) || "OPALX MERCHANT DEMO";
  const bankName = process.env.OPALX_VIETQR_BANK_NAME?.trim() || supported?.shortName || "MB Bank";
  const webhookProvider = process.env.PAYOS_CHECKSUM_KEY?.trim()
    ? "PAYOS"
    : process.env.SEPAY_WEBHOOK_API_KEY?.trim()
      ? "SEPAY"
      : "SANDBOX";
  return {
    bankBin,
    bankShortName: supported?.shortName || bankName,
    bankName,
    accountNo,
    accountName,
    webhookProvider,
    updatedAtIso: nowIso,
  };
}

function loadLiveFujiSeed(): SeedLiveProofs | null {
  const proofPath = path.join(process.cwd(), "src", "core", "ledger", "live-fuji-proofs.json");
  if (!existsSync(proofPath)) return null;
  try {
    return JSON.parse(readFileSync(proofPath, "utf8")) as SeedLiveProofs;
  } catch {
    return null;
  }
}

function makeSeedOrder(params: {
  orderCode: number;
  amountVnd: number;
  description: string;
  enterpriseId: string;
  sellerName: string;
  sellerTaxId: string;
  buyerName: string;
  buyerTaxId: string;
  requireInvoiceXml: boolean;
  railMode: RailMode;
  status: EnterpriseOrder["status"];
  enterpriseAddress: `0x${string}`;
  nowIso: string;
  bankConfig: MerchantBankConfig;
  einvoice?: EinvoiceSummary;
  orderCommitment?: `0x${string}`;
  enterpriseTxHash?: `0x${string}`;
  guaranteeId?: string;
}): EnterpriseOrder {
  const cat = resolveEnterpriseCategory(params.enterpriseId);
  const qr = buildOrderQrStub({
    orderCode: params.orderCode,
    amountVnd: params.amountVnd,
    description: params.description,
    railMode: params.railMode,
    bankConfig: params.bankConfig,
  });
  return {
    orderCode: params.orderCode,
    amountVnd: params.amountVnd,
    description: qr.description,
    enterpriseId: params.enterpriseId,
    categoryLabel: cat?.categoryLabel,
    productName: cat?.productName,
    payerName: params.buyerName,
    sellerName: params.sellerName,
    sellerTaxId: params.sellerTaxId,
    sellerEnterpriseAddress: params.enterpriseAddress,
    buyerName: params.buyerName,
    buyerTaxId: params.buyerTaxId,
    bankBin: qr.bankBin,
    bankName: qr.bankName,
    bankAccountNo: qr.accountNo,
    bankAccountName: qr.accountName,
    requireInvoiceXml: params.requireInvoiceXml,
    railMode: params.railMode,
    status: params.status,
    qrCode: qr.qrCode,
    qrSvgDataUrl: qr.qrSvgDataUrl,
    mobileDeeplinkUrl: qr.mobileDeeplinkUrl,
    ...(params.einvoice ? { einvoice: params.einvoice } : {}),
    orderCommitment:
      params.orderCommitment ??
      computeCommitmentHash("order", `${params.orderCode}:${params.amountVnd}:${params.sellerTaxId}`),
    ...(params.enterpriseTxHash ? { enterpriseTxHash: params.enterpriseTxHash } : {}),
    ...(params.guaranteeId ? { guaranteeId: params.guaranteeId } : {}),
    createdAtIso: params.nowIso,
    updatedAtIso: params.nowIso,
  };
}

/** Builds clean initial 3-gateway state hydrated with verified Avalanche Fuji AVAX proofs. */
export function buildInitialLedgerState(): LedgerState {
  const live = loadLiveFujiSeed();
  const nowIso = live?.seededAtIso ?? "2026-11-14T05:00:00.000Z";
  const enterpriseAddress =
    live?.enterpriseAddress ?? ("0x78BF34e40C66b5B3Ed5f14612b927239BAC88676" as const);
  const bankConfig = buildDefaultBankConfig(nowIso);
  const sampleEinvoice = extractTt78InvoiceSummary(buildSampleTt78Xml());
  const gId = live?.guaranteeId ?? "OPX-2026-0001";
  const ordCommit1 = live?.orderCommitment ?? computeCommitmentHash("order", "20260001:1500000:0312345678");
  const bankCommit1 = live?.bankRefCommitment ?? computeCommitmentHash("bankRef", "FT2601889921_LIVE_SEED");
  const invCommit1 = live?.invoiceCommitment ?? sampleEinvoice.xmlDigestHex;

  const orders: EnterpriseOrder[] = [
    makeSeedOrder({
      orderCode: 20260001, amountVnd: 1_500_000, description: "OPX 20260001 CALI GYM",
      enterpriseId: "california-fitness", sellerName: "California Fitness & Yoga", sellerTaxId: "0312345678",
      buyerName: "California Demo Member", buyerTaxId: "0109876543", requireInvoiceXml: true,
      railMode: "LIVE_BANK", status: "GUARANTEED", enterpriseAddress, nowIso, bankConfig,
      einvoice: sampleEinvoice, orderCommitment: ordCommit1, enterpriseTxHash: live?.enterpriseTxHash, guaranteeId: gId,
    }),
    makeSeedOrder({
      orderCode: 20260002, amountVnd: 12_000_000, description: "OPX 20260002 GYM 12M",
      enterpriseId: "california-fitness", sellerName: "California Fitness & Yoga", sellerTaxId: "0312345678",
      buyerName: "12-Month Pass Member", buyerTaxId: "0316890124", requireInvoiceXml: false,
      railMode: "SANDBOX", status: "PENDING_BANK", enterpriseAddress, nowIso, bankConfig,
    }),
    makeSeedOrder({
      orderCode: 20260003, amountVnd: 5_000_000, description: "OPX 20260003 HIGH VAL",
      enterpriseId: "mekong-agro", sellerName: "Mekong Agro Supply", sellerTaxId: "0109876543",
      buyerName: "B2B Bulk Buyer Corp", buyerTaxId: "0109876543", requireInvoiceXml: true,
      railMode: "SANDBOX", status: "PENDING_BANK", enterpriseAddress, nowIso, bankConfig,
    }),
  ];

  const proofMode = live ? ("LIVE_FUJI_AVAX" as const) : ("OFFLINE_FALLBACK" as const);
  const guarantees: GuaranteeCertificate[] = live ? [{
    guaranteeId: gId, orderCode: 20260001, amountVnd: 1_500_000, railMode: "LIVE_BANK", sandbox: false,
    enterpriseId: "california-fitness", enterpriseName: "California Fitness & Yoga",
    categoryLabel: "Fitness, Gym & Yoga", productName: "1-Month Trial Pass",
    payerName: "California Demo Member", description: orders[0].description,
    maskedBankRef: "FT26***SEED", orderCommitment: ordCommit1, bankRefCommitment: bankCommit1,
    invoiceCommitment: invCommit1, enterpriseAddress, collateralAvax: "0.0002",
    reputationCreditsAwarded: 10, creditTierAfter: "STANDARD", verifyPath: `/verify/${gId}`,
    printCount: 1, feePerPrintAvax: "0.00001", estimatedGasPerPrintAvax: "0.00055", totalPrintFeeAvax: "0.00056",
    lastPrintHash: invCommit1, lastPrintTxHash: live.feeSettlementTxHash,
    issuedAtIso: nowIso, revoked: false,
    proofBundle: {
      mode: proofMode, enterpriseTxHash: live.enterpriseTxHash, bankTxHash: live.bankTxHash,
      guaranteeTxHash: live.guaranteeTxHash, feeSettlementTxHash: live.feeSettlementTxHash,
      collateralAvax: "0.0002", blockNumber: live.feeBlock,
    },
  }] : [];

  const bankAttestations: BankAttestationProof[] = live ? [{
    id: "BNK-SEED-20260001", orderCode: 20260001, bankRefMask: "FT26***SEED",
    bankRefCommitment: bankCommit1, orderCommitment: ordCommit1, paidAmountVnd: 1_500_000,
    railMode: "LIVE_BANK", hmacVerified: true, bankTxHash: live.bankTxHash, attestedAtIso: nowIso,
  }] : [];

  const auditLogs: PolicyAuditLogEntry[] = live ? [{
    id: "AUD-SEED-20260001", orderCode: 20260001, railMode: "LIVE_BANK", amountVnd: 1_500_000,
    verdict: "ALLOW", reasonCode: "NONE", guaranteeId: gId, txHash: live.guaranteeTxHash,
    detail: "Seeded with verified 3-gateway AVAX transactions on Avalanche Fuji (43113).", createdAtIso: nowIso,
  }] : [];

  return {
    orders, bankAttestations, usedBankRefs: live ? [bankCommit1] : [],
    guarantees, auditLogs, vaultPaused: false, bankConfig,
  };
}
