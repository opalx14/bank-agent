export type AuthProviderKind = "GOOGLE" | "EMAIL" | "EXTERNAL_WALLET";
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
  walletConnectorName?: string;
  exportable?: boolean;
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

export interface Web3KeystoreV3 {
  version: 3;
  id: string;
  address: string;
  crypto: {
    cipher: "aes-128-ctr";
    ciphertext: string;
    cipherparams: { iv: string };
    kdf: "pbkdf2";
    kdfparams: {
      c: number;
      dklen: number;
      prf: "hmac-sha256";
      salt: string;
    };
    mac: string;
  };
}

export interface WalletExportPayload {
  walletAddress: `0x${string}`;
  privateKey: `0x${string}`;
  chainId: 43113;
  networkName: string;
  derivationStandard: string;
  importTargets: string[];
  exportedAtIso: string;
  keystoreV3?: Web3KeystoreV3;
}
