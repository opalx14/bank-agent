import { z } from "zod";
import type { EinvoiceSummary, EnterpriseOrder, MerchantBankConfig } from "@/types";
import { resolveRequestSession } from "@/core/auth/auth.session-guard";
import {
  buildOrderQrWithImage,
  ensureOrderQrDescription,
} from "@/core/bank/bank.qr-builder";
import { resolveEnterpriseCategory } from "@/core/enterprise/enterprise.catalog";
import { extractTt78InvoiceSummary } from "@/core/enterprise/enterprise.einvoice-parser";
import { getBankConfig, upsertOrder } from "@/core/ledger/ledger.store";
import {
  findBankPartnerRail,
  findVerifiedEnterprise,
} from "@/core/registry/registry.portal";
import { broadcastOrderRegistration } from "@/lib/avalanche/avalanche.broadcaster";
import { computeCommitmentHash } from "@/lib/avalanche/avalanche.signer";
import { computeEvidenceImageDigest } from "@/core/opalx/opalx.nft-receipt";

const createOrderSchema = z.object({
  orderCode: z.number().int().positive().optional(),
  amountVnd: z.number().finite().min(2000),
  description: z.string().trim().min(1).max(60).optional(),
  enterpriseId: z.string().trim().min(1).max(64).optional(),
  categoryLabel: z.string().trim().min(1).max(80).optional(),
  productName: z.string().trim().min(1).max(120).optional(),
  payerName: z.string().trim().min(1).max(100).optional(),
  buyerEmail: z.string().trim().email().optional().or(z.literal("")),
  paymentMethod: z.enum(["VIETQR_BANK_APP", "OPALX_DIRECT"]).optional(),
  sellerName: z.string().trim().min(1).optional(),
  sellerTaxId: z.string().trim().min(10).max(14).optional(),
  sellerEnterpriseAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  buyerName: z.string().trim().min(1).optional(),
  buyerTaxId: z.string().trim().min(10).max(14).default("0109876543"),
  customQrImageDataUrl: z
    .string()
    .max(600_000)
    .refine((v) => v === "" || v.startsWith("data:image/"), "INVALID_QR_IMAGE_DATA_URL")
    .optional(),
  manualReceiptImageDataUrl: z
    .string()
    .max(900_000)
    .refine((v) => v === "" || v.startsWith("data:image/"), "INVALID_MANUAL_RECEIPT_IMAGE")
    .optional(),
  confirmedByWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  merchantContractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  walletSignature: z.string().max(300).optional(),
  requireInvoiceXml: z.boolean().default(false),
  invoiceXml: z.string().optional(),
  railMode: z.enum(["SANDBOX", "LIVE_BANK"]).default("SANDBOX"),
  useEnterpriseBank: z.boolean().optional(),
  broadcastOnChain: z.boolean().optional(),
});

export async function POST(request: Request): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON_BODY" }, { status: 400 });
  }

  const parsed = createOrderSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_ORDER_PAYLOAD", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const orderCode =
    data.orderCode ?? Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 900);
  const amountVnd = Math.round(data.amountVnd);
  const verifiedEnt = findVerifiedEnterprise(data.enterpriseId);
  const catalogItem = verifiedEnt ? undefined : resolveEnterpriseCategory(data.enterpriseId);
  const session = resolveRequestSession(request);
  const sellerName =
    data.sellerName ?? verifiedEnt?.enterpriseName ?? catalogItem?.enterpriseName ?? "California Fitness & Yoga";
  const sellerTaxId = data.sellerTaxId ?? verifiedEnt?.taxId ?? catalogItem?.taxId ?? "0312345678";
  const enterpriseAddr = (data.sellerEnterpriseAddress ??
    verifiedEnt?.merchantContractAddress ??
    catalogItem?.enterpriseAddress ??
    "0x78BF34e40C66b5B3Ed5f14612b927239BAC88676") as `0x${string}`;
  const categoryLabel = data.categoryLabel ?? verifiedEnt?.categoryLabel ?? catalogItem?.categoryLabel;
  const productName =
    data.productName ?? verifiedEnt?.packages.find((p) => p.active)?.label ?? catalogItem?.productName;
  const buyerName = data.buyerName ?? data.payerName ?? session?.displayName ?? "OpalX Customer";
  const payerName = data.payerName ?? buyerName;
  const buyerEmail = data.buyerEmail?.trim().toLowerCase() || session?.email || undefined;
  const rawDesc =
    data.description ??
    (productName ? `OPX${orderCode} ${productName}` : `OPX${orderCode} PAYMENT`);
  const orderDescription = ensureOrderQrDescription(orderCode, rawDesc);

  let einvoice: EinvoiceSummary | undefined;
  if (data.invoiceXml?.trim()) {
    try {
      einvoice = extractTt78InvoiceSummary(data.invoiceXml);
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "INVALID_TT78_XML" },
        { status: 400 },
      );
    }
  }

  const baseBankConfig = getBankConfig();
  const linkedRail = verifiedEnt ? findBankPartnerRail(verifiedEnt.linkedBankRailId) : undefined;
  const bankConfig: MerchantBankConfig =
    data.useEnterpriseBank && verifiedEnt
      ? {
          bankBin: verifiedEnt.bankBin,
          bankShortName: verifiedEnt.bankShortName,
          bankName: linkedRail?.bankName ?? verifiedEnt.bankShortName,
          accountNo: verifiedEnt.accountNo,
          accountName: verifiedEnt.accountName,
          webhookProvider: linkedRail?.webhookProvider ?? "SANDBOX",
          useCustomQrImage: verifiedEnt.useCustomQrImage,
          customQrImageDataUrl: verifiedEnt.customQrImageDataUrl,
          updatedAtIso: verifiedEnt.updatedAtIso,
        }
      : baseBankConfig;

  const qr = await buildOrderQrWithImage({
    orderCode,
    amountVnd,
    description: orderDescription,
    railMode: data.railMode,
    bankConfig,
  });

  const customQrImageDataUrl =
    data.customQrImageDataUrl ||
    (data.useEnterpriseBank && verifiedEnt
      ? verifiedEnt.useCustomQrImage
        ? verifiedEnt.customQrImageDataUrl
        : undefined
      : baseBankConfig.useCustomQrImage
        ? baseBankConfig.customQrImageDataUrl
        : undefined);
  const confirmedByWallet = (data.confirmedByWallet ?? session?.walletAddress) as `0x${string}` | undefined;
  const merchantContractAddress = (data.merchantContractAddress ??
    session?.merchantContractAddress ??
    verifiedEnt?.merchantContractAddress) as `0x${string}` | undefined;
  const walletSignature = data.walletSignature as `0x${string}` | undefined;

  const manualReceiptImageDataUrl = data.manualReceiptImageDataUrl?.trim() || undefined;
  const manualReceiptDigestHex = manualReceiptImageDataUrl
    ? computeEvidenceImageDigest(manualReceiptImageDataUrl)
    : undefined;

  const orderCommitment = computeCommitmentHash(
    "order",
    `${orderCode}:${amountVnd}:${sellerTaxId}:${Date.now()}`,
  );
  const invoiceCommitment = einvoice
    ? einvoice.xmlDigestHex
    : (manualReceiptDigestHex ?? computeCommitmentHash("invoice", `PENDING_XML:${orderCode}`));

  let enterpriseTxHash: `0x${string}` | undefined;
  if (data.broadcastOnChain !== false) {
    const reg = await broadcastOrderRegistration({
      orderCommitment,
      invoiceCommitment,
      enterpriseAddress: enterpriseAddr,
    });
    enterpriseTxHash = reg.txHash;
  }

  const nowIso = new Date().toISOString();
  const resolvedEnterpriseId = verifiedEnt?.id ?? catalogItem?.id ?? data.enterpriseId;
  const order: EnterpriseOrder = {
    orderCode,
    amountVnd,
    description: orderDescription,
    ...(resolvedEnterpriseId ? { enterpriseId: resolvedEnterpriseId } : {}),
    ...(categoryLabel ? { categoryLabel } : {}),
    ...(productName ? { productName } : {}),
    ...(payerName ? { payerName } : {}),
    ...(buyerEmail ? { buyerEmail } : {}),
    ...(data.paymentMethod ? { paymentMethod: data.paymentMethod } : {}),
    sellerName,
    sellerTaxId,
    sellerEnterpriseAddress: enterpriseAddr,
    buyerName,
    buyerTaxId: data.buyerTaxId,
    bankBin: qr.bankBin,
    bankName: qr.bankName,
    bankAccountNo: qr.accountNo,
    bankAccountName: qr.accountName,
    ...(customQrImageDataUrl ? { customQrImageDataUrl } : {}),
    ...(manualReceiptImageDataUrl ? { manualReceiptImageDataUrl } : {}),
    ...(manualReceiptDigestHex ? { manualReceiptDigestHex } : {}),
    ...(confirmedByWallet ? { confirmedByWallet } : {}),
    ...(merchantContractAddress ? { merchantContractAddress } : {}),
    ...(walletSignature ? { walletSignature } : {}),
    requireInvoiceXml: data.requireInvoiceXml,
    railMode: data.railMode,
    status: "PENDING_BANK",
    qrCode: qr.qrCode,
    qrSvgDataUrl: qr.qrSvgDataUrl,
    mobileDeeplinkUrl: qr.mobileDeeplinkUrl,
    ...(einvoice ? { einvoice } : {}),
    orderCommitment,
    ...(enterpriseTxHash ? { enterpriseTxHash } : {}),
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  upsertOrder(order);
  return Response.json({ order, qr }, { status: 201 });
}
