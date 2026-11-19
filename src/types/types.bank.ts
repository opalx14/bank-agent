import type { RailMode } from "./types.enterprise";

export type SandboxScenario =
  | "ALLOW_VALID"
  | "DENY_INVALID_HMAC"
  | "DENY_REPLAY"
  | "DENY_AMOUNT_MISMATCH"
  | "REQUIRE_APPROVAL_LIMIT";

export interface PayosWebhookPayload {
  code: string;
  desc: string;
  success: boolean;
  signature: string;
  data: {
    orderCode: number;
    amount: number;
    description: string;
    reference: string;
    transactionDateTime: string;
    currency: string;
    paymentLinkId?: string;
    counterAccountBankId?: string;
    counterAccountNumber?: string;
    counterAccountName?: string;
  };
}

export interface BankAttestationProof {
  id: string;
  orderCode: number;
  bankRefMask: string;
  bankRefCommitment: `0x${string}`;
  orderCommitment: `0x${string}`;
  paidAmountVnd: number;
  railMode: RailMode;
  hmacVerified: boolean;
  bankTxHash?: `0x${string}`;
  attestedAtIso: string;
}

export interface SupportedVnBank {
  bin: string;
  shortName: string;
  name: string;
  appId: string;
}

export interface MerchantBankConfig {
  bankBin: string;
  bankShortName: string;
  bankName: string;
  accountNo: string;
  accountName: string;
  webhookProvider: "SEPAY" | "PAYOS" | "SANDBOX";
  useCustomQrImage?: boolean;
  customQrImageDataUrl?: string;
  updatedAtIso: string;
}

export interface SepayWebhookPayload {
  id?: number | string;
  gateway?: string;
  transactionDate?: string;
  accountNumber?: string;
  code?: string | null;
  content?: string;
  transferType?: "in" | "out" | string;
  transferAmount?: number;
  accumulated?: number;
  referenceCode?: string;
  description?: string;
}

export interface BankPartnerRail {
  id: string;
  bankBin: string;
  shortName: string;
  bankName: string;
  appId: string;
  webhookProvider: "SEPAY" | "PAYOS" | "SANDBOX";
  settlementRailLabel: string;
  feeBps: number;
  active: boolean;
  gatewayContractAddress: `0x${string}`;
  updatedAtIso: string;
}
