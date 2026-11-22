import type {
  BankAttestationProof,
  EnterpriseOrder,
  GuaranteeCertificate,
  PolicyAuditLogEntry,
  PolicyEvaluationResult,
} from "@/types";
import { maskBankReference } from "@/core/bank/bank.payos-webhook";
import {
  extractTt78InvoiceSummary,
  proposeInvoiceFromUnstructuredText,
} from "@/core/enterprise/enterprise.einvoice-parser";
import { computeLiquidityCredits, resolveTierFromCredits } from "@/core/opalx/opalx.treasury";
import { appendLedgerOutcome, isBankRefUsed, readLedger } from "@/core/ledger/ledger.store";
import { findVerifiedEnterprise, listVerifiedEnterprises } from "@/core/registry/registry.portal";
import { broadcastFullReconciliationProofs, vndToCollateralWei } from "@/lib/avalanche/avalanche.broadcaster";
import { computeCommitmentHash } from "@/lib/avalanche/avalanche.signer";
import { formatEther } from "viem";
import { buildNftReceiptProof } from "./opalx.nft-receipt";
import { detectCircularWashTrade, evaluateThreeWayPolicy, type TransferEdge } from "./opalx.policy-bridge";

export interface ReconcileParams {
  order: EnterpriseOrder;
  bankPaidAmountVnd: number;
  bankReference: string;
  webhookSignatureValid: boolean;
  invoiceXml?: string;
  aiUnstructuredNote?: string;
  transferEdges?: TransferEdge[];
  autoApproveLimitVnd?: number;
}

export interface ReconcileResponse {
  decision: PolicyEvaluationResult;
  bankAttestation?: BankAttestationProof;
  guarantee?: GuaranteeCertificate;
  auditLog: PolicyAuditLogEntry;
}

const DEFAULT_GUARANTEE_BENEFITS = [
  "Counter QR member check-in verification",
  "Avalanche Fuji PolicyVault escrow protection",
  "ERC-8004 reputation tier accumulation",
];

export function formatGuaranteeId(orderCode: number, issuedCount: number): string {
  const year = new Date().getUTCFullYear();
  const suffix = String(Math.max(1, issuedCount + 1)).padStart(4, "0");
  return `OPX-${year}-${suffix}-${String(orderCode).slice(-4)}`;
}

/**
 * Runs deterministic 3-way reconciliation (Enterprise Order <-> Bank Reference <-> TT78 XML)
 * and broadcasts real pure-AVAX proofs across the 3 Fuji gateways on ALLOW.
 */
export async function reconcileAndBroadcastProofs(
  params: ReconcileParams,
): Promise<ReconcileResponse> {
  const ledger = readLedger();
  const nowIso = new Date().toISOString();
  let einvoice = params.order.einvoice;

  if (params.invoiceXml?.trim()) {
    try {
      einvoice = extractTt78InvoiceSummary(params.invoiceXml);
    } catch {
      einvoice = undefined;
    }
  } else if (!einvoice && params.aiUnstructuredNote?.trim()) {
    einvoice = proposeInvoiceFromUnstructuredText(params.aiUnstructuredNote);
  }

  const bankRefTrimmed = params.bankReference.trim();
  const bankRefCommitment = computeCommitmentHash("bankRef", bankRefTrimmed || "MISSING");
  const orderCommitment =
    params.order.orderCommitment ??
    computeCommitmentHash("order", `${params.order.orderCode}:${params.order.amountVnd}:${params.order.sellerTaxId}`);
  const invoiceCommitment = einvoice
    ? einvoice.xmlDigestHex
    : (params.order.manualReceiptDigestHex ??
      computeCommitmentHash("invoice", `NO_XML:${params.order.orderCode}`));

  const decision = evaluateThreeWayPolicy({
    orderAmountVnd: params.order.amountVnd,
    bankPaidAmountVnd: params.bankPaidAmountVnd,
    invoiceTotalVnd: einvoice?.totalAmountVnd,
    webhookSignatureValid: params.webhookSignatureValid,
    bankRefPresent: bankRefTrimmed.length > 0,
    bankRefAlreadyUsed: bankRefTrimmed.length > 0 && isBankRefUsed(bankRefCommitment),
    requireInvoiceXml: params.order.requireInvoiceXml,
    invoiceXmlSignatureValid: Boolean(einvoice?.signatureValid && einvoice.source === "TT78_XML"),
    vaultPaused: ledger.vaultPaused,
    washTradeDetected: params.transferEdges ? detectCircularWashTrade(params.transferEdges) : false,
    autoApproveLimitVnd:
      params.autoApproveLimitVnd ??
      (params.order.confirmedByWallet && params.order.walletSignature ? 50_000_000 : undefined),
  });

  if (decision.verdict !== "ALLOW") {
    const auditLog: PolicyAuditLogEntry = {
      id: `AUD-${Date.now()}-${params.order.orderCode}`,
      orderCode: params.order.orderCode,
      railMode: params.order.railMode,
      amountVnd: params.order.amountVnd,
      verdict: decision.verdict,
      reasonCode: decision.reasonCode,
      detail: `Rejected (${decision.reasonCode}) — fail-closed policy guard.`,
      createdAtIso: nowIso,
    };
    appendLedgerOutcome({
      orderCode: params.order.orderCode,
      nextStatus: decision.verdict === "REQUIRE_APPROVAL" ? "NEEDS_APPROVAL" : "DENIED",
      auditLog,
    });
    return { decision, auditLog };
  }

  const guaranteeId = formatGuaranteeId(params.order.orderCode, ledger.guarantees.length);
  const sandbox = params.order.railMode !== "LIVE_BANK";
  const proofBundle = await broadcastFullReconciliationProofs({
    guaranteeId,
    orderCommitment,
    bankRefCommitment,
    invoiceCommitment,
    enterpriseAddress: params.order.sellerEnterpriseAddress,
    amountVnd: params.order.amountVnd,
    sandbox,
    existingEnterpriseTxHash: params.order.enterpriseTxHash,
  });

  const creditsAwarded = sandbox ? 0 : 10;
  const totalCreditsAfter = computeLiquidityCredits(ledger.guarantees) + creditsAwarded;
  const bankAttestation: BankAttestationProof = {
    id: `BNK-${Date.now()}-${params.order.orderCode}`,
    orderCode: params.order.orderCode,
    bankRefMask: maskBankReference(bankRefTrimmed),
    bankRefCommitment,
    orderCommitment,
    paidAmountVnd: params.bankPaidAmountVnd,
    railMode: params.order.railMode,
    hmacVerified: params.webhookSignatureValid,
    bankTxHash: proofBundle.bankTxHash,
    attestedAtIso: nowIso,
  };

  const verifiedEnt =
    findVerifiedEnterprise(params.order.enterpriseId) ??
    listVerifiedEnterprises().find(
      (e) =>
        e.taxId === params.order.sellerTaxId ||
        e.enterpriseName.trim().toLowerCase() === params.order.sellerName.trim().toLowerCase(),
    );
  const matchedPkg = verifiedEnt?.packages.find(
    (p) =>
      params.order.productName &&
      p.label.trim().toLowerCase() === params.order.productName.trim().toLowerCase(),
  );
  const benefits =
    matchedPkg?.benefits && matchedPkg.benefits.length > 0
      ? [...matchedPkg.benefits]
      : DEFAULT_GUARANTEE_BENEFITS;
  const buyerEmail = params.order.buyerEmail?.trim() || undefined;

  const collateralAvax = formatEther(vndToCollateralWei(params.order.amountVnd));
  const guarantee: GuaranteeCertificate = {
    guaranteeId,
    orderCode: params.order.orderCode,
    amountVnd: params.order.amountVnd,
    railMode: params.order.railMode,
    sandbox,
    ...(params.order.enterpriseId ? { enterpriseId: params.order.enterpriseId } : {}),
    enterpriseName: params.order.sellerName,
    ...(params.order.categoryLabel ? { categoryLabel: params.order.categoryLabel } : {}),
    ...(params.order.productName ? { productName: params.order.productName } : {}),
    payerName: params.order.payerName ?? params.order.buyerName,
    ...(buyerEmail ? { buyerEmail } : {}),
    benefits,
    description: params.order.description,
    maskedBankRef: bankAttestation.bankRefMask,
    orderCommitment,
    bankRefCommitment,
    invoiceCommitment,
    enterpriseAddress: params.order.sellerEnterpriseAddress,
    collateralAvax,
    reputationCreditsAwarded: creditsAwarded,
    creditTierAfter: resolveTierFromCredits(totalCreditsAfter),
    proofBundle,
    ...(params.order.confirmedByWallet ? { confirmedByWallet: params.order.confirmedByWallet } : {}),
    ...(params.order.merchantContractAddress ? { merchantContractAddress: params.order.merchantContractAddress } : {}),
    printCount: 0,
    feePerPrintAvax: "0.00001",
    estimatedGasPerPrintAvax: "0.00055",
    nftReceipt: buildNftReceiptProof({
      guaranteeId,
      orderCommitment,
      bankRefCommitment,
      invoiceCommitment,
      manualReceiptImageDataUrl: params.order.manualReceiptImageDataUrl,
      manualReceiptDigestHex: params.order.manualReceiptDigestHex,
      mintedAtIso: nowIso,
    }),
    totalPrintFeeAvax: "0",
    verifyPath: `/verify/${guaranteeId}`,
    issuedAtIso: nowIso,
    revoked: false,
  };

  const auditLog: PolicyAuditLogEntry = {
    id: `AUD-${Date.now()}-${params.order.orderCode}`,
    orderCode: params.order.orderCode,
    railMode: params.order.railMode,
    amountVnd: params.order.amountVnd,
    verdict: "ALLOW",
    reasonCode: "NONE",
    guaranteeId,
    txHash: proofBundle.guaranteeTxHash,
    detail: `Issued ${guaranteeId} (${proofBundle.mode}) across 3 Fuji gateways.`,
    createdAtIso: nowIso,
  };

  appendLedgerOutcome({
    orderCode: params.order.orderCode,
    nextStatus: "GUARANTEED",
    bankAttestation,
    bankRefCommitment,
    guarantee,
    auditLog,
  });

  return { decision, bankAttestation, guarantee, auditLog };
}
