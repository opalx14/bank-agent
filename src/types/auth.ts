export type AuthProviderKind = "GOOGLE" | "EMAIL";
export type PortalRole = "CUSTOMER" | "ENTERPRISE" | "BANK";

export interface UserWalletSession {
  userId: string;
  provider: AuthProviderKind;
  email: string;
  displayName: string;
  walletAddress: `0x${string}`;
  merchantContractAddress: `0x${string}`;
  gatewayContractAddress: `0x${string}`;
  contractBindingHash: `0x${string}`;
  defaultScopeId: string;
  role?: PortalRole;
  rolePositionId?: string;
  lastConfirmedAtIso?: string;
  createdAtIso: string;
}

export interface WalletActionConfirmation {
  walletAddress: `0x${string}`;
  merchantContractAddress: `0x${string}`;
  action:
    | "CREATE_PAYMENT"
    | "CONFIRM_RECONCILE"
    | "PRINT_INVOICE"
    | "CLAIM_GUARANTEE_RIGHT"
    | "GENERAL";
  digestHex: `0x${string}`;
  signature: `0x${string}`;
  signedAtIso: string;
}
