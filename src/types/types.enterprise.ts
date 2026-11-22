export type RailMode = "SANDBOX" | "LIVE_BANK";

export type AccountProfileKind = "DEMO_ACCOUNT" | "LIVE_DIRECT_ACCOUNT";

export type OrderStatus =
  | "PENDING_BANK"
  | "PAID_CONFIRMED"
  | "GUARANTEED"
  | "NEEDS_APPROVAL"
  | "DENIED"
  | "REVOKED";

export interface VietQrBankOption {
  appId: string;
  name: string;
  deeplink: string;
}

export interface VietQrPaymentPayload {
  orderCode: number;
  amountVnd: number;
  description: string;
  accountNo: string;
  accountName: string;
  bankBin: string;
  bankName: string;
  qrCode: string;
  qrSvgDataUrl: string;
  mobileDeeplinkUrl: string;
  bankOptions: VietQrBankOption[];
}

export interface EinvoiceSummary {
  invoiceNumber: string;
  invoiceSerial: string;
  sellerTaxId: string;
  sellerName: string;
  buyerTaxId?: string;
  totalAmountVnd: number;
  signatureValid: boolean;
  source: "TT78_XML" | "AI_BOUNDED_PROPOSAL";
  xmlDigestHex: `0x${string}`;
}

export interface EnterprisePackageOption {
  id: string;
  label: string;
  durationLabel: string;
  amountVnd: number;
}

export interface EnterpriseCategoryItem {
  id: string;
  enterpriseName: string;
  taxId: string;
  categoryCode: string;
  categoryLabel: string;
  productName: string;
  defaultAmountVnd: number;
  accentTone: "rose" | "sky" | "emerald" | "amber";
  enterpriseAddress: `0x${string}`;
  packages?: EnterprisePackageOption[];
}

export interface EnterpriseOrder {
  orderCode: number;
  amountVnd: number;
  description: string;
  enterpriseId?: string;
  categoryLabel?: string;
  productName?: string;
  payerName?: string;
  buyerEmail?: string;
  paymentMethod?: "VIETQR_BANK_APP" | "OPALX_DIRECT";
  sellerName: string;
  sellerTaxId: string;
  sellerEnterpriseAddress: `0x${string}`;
  buyerName: string;
  buyerTaxId: string;
  bankBin?: string;
  bankName?: string;
  bankAccountNo?: string;
  bankAccountName?: string;
  customQrImageDataUrl?: string;
  manualReceiptImageDataUrl?: string;
  manualReceiptDigestHex?: `0x${string}`;
  confirmedByWallet?: `0x${string}`;
  merchantContractAddress?: `0x${string}`;
  walletSignature?: `0x${string}`;
  requireInvoiceXml: boolean;
  railMode: RailMode;
  status: OrderStatus;
  qrCode: string;
  qrSvgDataUrl: string;
  mobileDeeplinkUrl: string;
  einvoice?: EinvoiceSummary;
  orderCommitment?: `0x${string}`;
  enterpriseTxHash?: `0x${string}`;
  guaranteeId?: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface AvaxFaucetResource {
  tokenSymbol: "AVAX";
  network: "Avalanche Fuji (43113)";
  purpose: string;
  faucetName: string;
  faucetUrl: string;
  secondaryFaucetUrl?: string;
  recommendedAmount: string;
}

export interface LiveReadinessStatus {
  payosConfigured: boolean;
  bankAccountConfigured: boolean;
  fujiIssuerKeyConfigured: boolean;
  fujiContractsDeployed: boolean;
  fujiWalletAddress?: `0x${string}`;
  readyForLiveBank: boolean;
  readyForLiveFujiTx: boolean;
  missingEnvKeys: string[];
}

export interface MerchantAccountProfile {
  kind: AccountProfileKind;
  railMode: RailMode;
  badgeLabel: "[SANDBOX]" | "[LIVE BANK]";
  title: string;
  subtitle: string;
  sellerName: string;
  sellerTaxId: string;
  sellerEnterpriseAddress: `0x${string}`;
  bankName: string;
  bankBin: string;
  maskedBankAccount: string;
  settlementRail: string;
  creditEligibilityNote: string;
}

export interface AccountClassificationResponse {
  defaultProfile: AccountProfileKind;
  profiles: Record<AccountProfileKind, MerchantAccountProfile>;
  liveReadiness: LiveReadinessStatus;
  faucets: AvaxFaucetResource[];
  checkedAtIso: string;
}

export interface EnterpriseServicePackage {
  id: string;
  label: string;
  durationLabel: string;
  amountVnd: number;
  active: boolean;
  imageDataUrl?: string;
  benefits?: string[];
  guaranteeRightLabel?: string;
}

export interface VerifiedEnterpriseProfile {
  id: string;
  enterpriseName: string;
  taxId: string;
  categoryCode: string;
  categoryLabel: string;
  description?: string;
  logoImageUrl?: string;
  ownerEmail?: string;
  ownerWalletAddress: `0x${string}`;
  merchantContractAddress: `0x${string}`;
  kybCommitmentHash?: `0x${string}`;
  contractDeploymentTxHash?: `0x${string}`;
  contractDeployedAtIso?: string;
  kybVerified: boolean;
  linkedBankRailId: string;
  bankBin: string;
  bankShortName: string;
  accountNo: string;
  accountName: string;
  useCustomQrImage?: boolean;
  customQrImageDataUrl?: string;
  packages: EnterpriseServicePackage[];
  updatedAtIso: string;
}
