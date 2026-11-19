import { createHmac } from "node:crypto";
import { getAddress, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type {
  AuthProviderKind,
  PortalRole,
  UserWalletSession,
  WalletActionConfirmation,
} from "@/types";
import { getGatewayAddresses, isNonZeroAddress } from "@/lib/avalanche/network";

const FALLBACK_ENTERPRISE_GATEWAY = "0xaE97E6Bd5e581D2AFFa6364bdc5975f9eF3f86CB" as const;

function resolveServerWalletPepper(): string {
  return (
    process.env.OPALX_WALLET_AUTH_PEPPER?.trim() ||
    process.env.OPALX_COMMITMENT_PEPPER?.trim() ||
    "opalx-embedded-wallet-pepper-2026"
  );
}

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

function deriveUserPrivateKey(normalizedEmail: string): `0x${string}` {
  const hex = createHmac("sha256", resolveServerWalletPepper())
    .update(`opalx-user-wallet:${normalizedEmail}`)
    .digest("hex");
  return `0x${hex}`;
}

/** Derives deterministic EVM wallet + bound merchant contract address from Google/Email without exposing private key. */
export function deriveEmbeddedUserWallet(params: {
  provider: AuthProviderKind;
  email: string;
  displayName?: string;
  defaultScopeId?: string;
  role?: PortalRole;
  rolePositionId?: string;
}): UserWalletSession {
  const normalizedEmail = normalizeLoginEmail(params.email);
  const pk = deriveUserPrivateKey(normalizedEmail);
  const account = privateKeyToAccount(pk);

  const addrs = getGatewayAddresses();
  const gatewayContractAddress = isNonZeroAddress(addrs.enterpriseGateway)
    ? addrs.enterpriseGateway
    : FALLBACK_ENTERPRISE_GATEWAY;

  const contractSeed = keccak256(
    toHex(`opalx-merchant-contract:${account.address}:${gatewayContractAddress}`),
  );
  const merchantContractAddress = getAddress(`0x${contractSeed.slice(26)}`);
  const contractBindingHash = keccak256(
    toHex(`bind:${account.address}:${merchantContractAddress}:${gatewayContractAddress}`),
  );
  const userId = keccak256(toHex(`uid:${normalizedEmail}`)).slice(0, 18);
  const fallbackName = normalizedEmail.split("@")[0] || "OpalX Member";

  return {
    userId,
    provider: params.provider,
    email: normalizedEmail,
    displayName: params.displayName?.trim() || fallbackName,
    walletAddress: account.address,
    merchantContractAddress,
    gatewayContractAddress,
    contractBindingHash,
    defaultScopeId: params.defaultScopeId?.trim() || "california-fitness",
    ...(params.role ? { role: params.role } : {}),
    ...(params.rolePositionId?.trim() ? { rolePositionId: params.rolePositionId.trim() } : {}),
    createdAtIso: new Date().toISOString(),
  };
}

/** Signs a human-readable confirmation digest using the user's server-derived embedded wallet. */
export async function signUserWalletAction(params: {
  email: string;
  provider?: AuthProviderKind;
  action: WalletActionConfirmation["action"];
  summary: string;
}): Promise<WalletActionConfirmation> {
  const normalizedEmail = normalizeLoginEmail(params.email);
  const session = deriveEmbeddedUserWallet({
    provider: params.provider ?? "EMAIL",
    email: normalizedEmail,
  });
  const account = privateKeyToAccount(deriveUserPrivateKey(normalizedEmail));
  const signedAtIso = new Date().toISOString();
  const digestHex = keccak256(
    toHex(`${params.action}:${session.walletAddress}:${session.merchantContractAddress}:${params.summary}:${signedAtIso}`),
  );
  const message = `OpalX GO Confirmation\nAction: ${params.action}\nWallet: ${session.walletAddress}\nContract: ${session.merchantContractAddress}\nSummary: ${params.summary}\nHash: ${digestHex}`;
  const signature = await account.signMessage({ message });

  return {
    walletAddress: session.walletAddress,
    merchantContractAddress: session.merchantContractAddress,
    action: params.action,
    digestHex,
    signature,
    signedAtIso,
  };
}
