import {
  createCipheriv,
  createHmac,
  pbkdf2Sync,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { getAddress, isAddress, keccak256, toHex, verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type {
  AuthProviderKind,
  PortalRole,
  UserWalletSession,
  WalletActionConfirmation,
  WalletExportPayload,
  Web3KeystoreV3,
} from "@/types";
import { resolveSessionSecret } from "@/core/auth/auth.session-guard";
import { getGatewayAddresses, isNonZeroAddress } from "@/lib/avalanche/avalanche.network";

const FALLBACK_ENTERPRISE_GATEWAY = "0xaE97E6Bd5e581D2AFFa6364bdc5975f9eF3f86CB" as const;
const EXTERNAL_CHALLENGE_TTL_MS = 5 * 60 * 1000;

/**
 * Resolves the server-only HMAC pepper for deterministic embedded wallet key derivation.
 * Security boundary: wallet key derivation stays isolated to `OPALX_WALLET_AUTH_PEPPER`
 * (or `OPALX_COMMITMENT_PEPPER`) and never mixes with `OPALX_SESSION_SECRET`, which signs
 * stateless HTTP session cookies (`opalx_session`) in `auth.session-guard.ts`.
 */
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

function computeContractBinding(walletAddress: `0x${string}`): {
  gatewayContractAddress: `0x${string}`;
  merchantContractAddress: `0x${string}`;
  contractBindingHash: `0x${string}`;
} {
  const addrs = getGatewayAddresses();
  const gatewayContractAddress = isNonZeroAddress(addrs.enterpriseGateway)
    ? addrs.enterpriseGateway
    : FALLBACK_ENTERPRISE_GATEWAY;

  const contractSeed = keccak256(
    toHex(`opalx-merchant-contract:${walletAddress}:${gatewayContractAddress}`),
  );
  const merchantContractAddress = getAddress(`0x${contractSeed.slice(26)}`);
  const contractBindingHash = keccak256(
    toHex(`bind:${walletAddress}:${merchantContractAddress}:${gatewayContractAddress}`),
  );
  return { gatewayContractAddress, merchantContractAddress, contractBindingHash };
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
  const { gatewayContractAddress, merchantContractAddress, contractBindingHash } =
    computeContractBinding(account.address);

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
    exportable: params.provider !== "EXTERNAL_WALLET",
    ...(params.role ? { role: params.role } : {}),
    ...(params.rolePositionId?.trim() ? { rolePositionId: params.rolePositionId.trim() } : {}),
    createdAtIso: new Date().toISOString(),
  };
}

/** Builds a session bound to an externally owned self-custodial EVM wallet (MetaMask, Core, Rabby). */
export function buildExternalWalletSession(params: {
  walletAddress: string;
  displayName?: string;
  connectorName?: string;
  defaultScopeId?: string;
  role?: PortalRole;
  rolePositionId?: string;
}): UserWalletSession {
  const checksummed = getAddress(params.walletAddress.trim());
  const { gatewayContractAddress, merchantContractAddress, contractBindingHash } =
    computeContractBinding(checksummed);

  const lower = checksummed.toLowerCase();
  const shortAddr = `${checksummed.slice(0, 6)}...${checksummed.slice(-4)}`;
  const userId = keccak256(toHex(`uid:ext:${lower}`)).slice(0, 18);
  const connector = params.connectorName?.trim() || "External EVM Wallet";
  const syntheticIdentity = `${lower.slice(0, 10)}@wallet.opalx`;

  return {
    userId,
    provider: "EXTERNAL_WALLET",
    email: syntheticIdentity,
    displayName: params.displayName?.trim() || `${connector} (${shortAddr})`,
    walletAddress: checksummed,
    merchantContractAddress,
    gatewayContractAddress,
    contractBindingHash,
    defaultScopeId:
      params.defaultScopeId?.trim() ||
      params.rolePositionId?.trim() ||
      (params.role === "ENTERPRISE" ? lower : "california-fitness"),
    walletConnectorName: connector,
    exportable: false,
    ...(params.role ? { role: params.role } : {}),
    ...(params.rolePositionId?.trim() ? { rolePositionId: params.rolePositionId.trim() } : {}),
    createdAtIso: new Date().toISOString(),
  };
}

interface ExternalChallengePayload {
  walletAddress: `0x${string}`;
  role: PortalRole;
  nonce: string;
  messageHash: `0x${string}`;
  exp: number;
}

function signChallengePayload(payloadB64: string): string {
  return createHmac("sha256", resolveSessionSecret())
    .update(`opalx-ext-challenge:${payloadB64}`)
    .digest("base64url");
}

function safeEqualText(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** Issues a stateless HMAC-signed SIWE-style challenge for external EVM wallet sign-in. */
export function createExternalWalletChallenge(params: {
  walletAddress: string;
  role?: PortalRole;
  domain?: string;
}): {
  walletAddress: `0x${string}`;
  role: PortalRole;
  nonce: string;
  message: string;
  challengeToken: string;
  expiresAtIso: string;
} {
  if (!isAddress(params.walletAddress.trim())) {
    throw new Error("INVALID_WALLET_ADDRESS");
  }
  const checksummed = getAddress(params.walletAddress.trim());
  const role: PortalRole = params.role ?? "CUSTOMER";
  const nonce = randomBytes(16).toString("hex");
  const issuedAtMs = Date.now();
  const expMs = issuedAtMs + EXTERNAL_CHALLENGE_TTL_MS;
  const issuedAtIso = new Date(issuedAtMs).toISOString();
  const expiresAtIso = new Date(expMs).toISOString();
  const domain = params.domain?.trim() || "bankagent.opalx14.com";

  const message = [
    `Bank Agent · OpalX GO wants you to sign in with your EVM wallet:`,
    checksummed,
    "",
    `Statement: Sign in to authenticate your self-custodial wallet session (0 gas, 0 PII on-chain).`,
    `Domain: ${domain}`,
    `Role: ${role}`,
    `Chain ID: 43113 (Avalanche Fuji)`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAtIso}`,
    `Expires At: ${expiresAtIso}`,
  ].join("\n");

  const payload: ExternalChallengePayload = {
    walletAddress: checksummed,
    role,
    nonce,
    messageHash: keccak256(toHex(message)),
    exp: expMs,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const challengeToken = `${payloadB64}.${signChallengePayload(payloadB64)}`;

  return {
    walletAddress: checksummed,
    role,
    nonce,
    message,
    challengeToken,
    expiresAtIso,
  };
}

/** Verifies both the stateless challenge HMAC/expiry and the ECDSA personal_sign signature via viem. */
export async function verifyExternalWalletChallenge(params: {
  walletAddress: string;
  role?: PortalRole;
  message: string;
  challengeToken: string;
  signature: `0x${string}`;
}): Promise<
  | { ok: true; walletAddress: `0x${string}`; role: PortalRole; digestHex: `0x${string}` }
  | { ok: false; error: string }
> {
  if (!isAddress(params.walletAddress.trim())) {
    return { ok: false, error: "INVALID_WALLET_ADDRESS" };
  }
  const checksummed = getAddress(params.walletAddress.trim());
  const parts = params.challengeToken.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, error: "INVALID_CHALLENGE_TOKEN" };
  }
  const [payloadB64, sigB64] = parts;
  if (!safeEqualText(sigB64, signChallengePayload(payloadB64))) {
    return { ok: false, error: "INVALID_CHALLENGE_SIGNATURE" };
  }

  let payload: Partial<ExternalChallengePayload> | null = null;
  try {
    payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as Partial<ExternalChallengePayload>;
  } catch {
    return { ok: false, error: "MALFORMED_CHALLENGE_TOKEN" };
  }

  if (
    !payload ||
    typeof payload.exp !== "number" ||
    !payload.walletAddress ||
    !payload.messageHash ||
    !payload.role
  ) {
    return { ok: false, error: "MALFORMED_CHALLENGE_TOKEN" };
  }
  if (payload.exp <= Date.now()) {
    return { ok: false, error: "CHALLENGE_EXPIRED" };
  }
  if (payload.walletAddress.toLowerCase() !== checksummed.toLowerCase()) {
    return { ok: false, error: "WALLET_ADDRESS_MISMATCH" };
  }
  if (params.role && payload.role !== params.role) {
    return { ok: false, error: "ROLE_MISMATCH" };
  }

  const computedHash = keccak256(toHex(params.message));
  if (!safeEqualText(computedHash, payload.messageHash)) {
    return { ok: false, error: "CHALLENGE_MESSAGE_TAMPERED" };
  }

  try {
    const validSig = await verifyMessage({
      address: checksummed,
      message: params.message,
      signature: params.signature,
    });
    if (!validSig) {
      return { ok: false, error: "INVALID_WALLET_SIGNATURE" };
    }
  } catch {
    return { ok: false, error: "INVALID_WALLET_SIGNATURE" };
  }

  return { ok: true, walletAddress: checksummed, role: payload.role, digestHex: computedHash };
}

/** Encrypts a raw EVM private key into a standard Ethereum/Avalanche Web3 Secret Storage V3 Keystore JSON. */
export function encryptWeb3KeystoreV3(
  privateKeyHex: `0x${string}`,
  walletAddress: `0x${string}`,
  passphrase: string,
): Web3KeystoreV3 {
  const privBytes = Buffer.from(privateKeyHex.slice(2), "hex");
  const salt = randomBytes(32);
  const iv = randomBytes(16);
  const iterations = 100_000;
  const dk = pbkdf2Sync(Buffer.from(passphrase, "utf8"), salt, iterations, 32, "sha256");

  const cipher = createCipheriv("aes-128-ctr", dk.subarray(0, 16), iv);
  const ciphertext = Buffer.concat([cipher.update(privBytes), cipher.final()]);
  const macInput = Buffer.concat([dk.subarray(16, 32), ciphertext]);
  const macHex = keccak256(new Uint8Array(macInput)).slice(2);

  return {
    version: 3,
    id: randomUUID(),
    address: walletAddress.slice(2).toLowerCase(),
    crypto: {
      cipher: "aes-128-ctr",
      ciphertext: ciphertext.toString("hex"),
      cipherparams: { iv: iv.toString("hex") },
      kdf: "pbkdf2",
      kdfparams: {
        c: iterations,
        dklen: 32,
        prf: "hmac-sha256",
        salt: salt.toString("hex"),
      },
      mac: macHex,
    },
  };
}

/** Exports the authenticated user's decentralized embedded wallet private key and optional Web3 V3 keystore. */
export function exportEmbeddedUserWallet(
  session: UserWalletSession,
  options?: { keystorePassphrase?: string },
): WalletExportPayload {
  if (session.provider === "EXTERNAL_WALLET") {
    throw new Error("EXTERNAL_WALLET_SELF_CUSTODIAL");
  }
  const normalizedEmail = normalizeLoginEmail(session.email);
  const privateKey = deriveUserPrivateKey(normalizedEmail);
  const derivedAccount = privateKeyToAccount(privateKey);

  if (derivedAccount.address.toLowerCase() !== session.walletAddress.toLowerCase()) {
    throw new Error("WALLET_KEY_MISMATCH");
  }

  const passphrase = options?.keystorePassphrase?.trim();
  const keystoreV3 =
    passphrase && passphrase.length >= 8
      ? encryptWeb3KeystoreV3(privateKey, derivedAccount.address, passphrase)
      : undefined;

  return {
    walletAddress: derivedAccount.address,
    privateKey,
    chainId: 43113,
    networkName: "Avalanche Fuji C-Chain",
    derivationStandard: "EVM secp256k1 (MetaMask / Core / Rabby Compatible)",
    importTargets: ["MetaMask", "Core Wallet (Avalanche)", "Rabby Wallet", "Foundry cast"],
    exportedAtIso: new Date().toISOString(),
    ...(keystoreV3 ? { keystoreV3 } : {}),
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
