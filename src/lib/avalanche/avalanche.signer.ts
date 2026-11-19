import { createHmac } from "node:crypto";
import { createWalletClient, http, isHex, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import {
  getFujiRpcUrl,
  getGatewayAddresses,
  isNonZeroAddress,
} from "./avalanche.network";

function normalizePrivateKey(raw?: string): `0x${string}` | undefined {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return undefined;
  const candidate = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  return /^0x[a-fA-F0-9]{64}$/.test(candidate)
    ? (candidate as `0x${string}`)
    : undefined;
}

/** Derives the checksum public EVM address without leaking the raw private key. */
export function deriveFujiPublicAddress(rawKey?: string): `0x${string}` | undefined {
  const pk = normalizePrivateKey(rawKey);
  if (!pk) return undefined;
  try {
    return privateKeyToAccount(pk).address;
  } catch {
    return undefined;
  }
}

export function getFujiSignerAccount(
  env: Record<string, string | undefined> = process.env,
) {
  const pk = normalizePrivateKey(env.AVALANCHE_ISSUER_PRIVATE_KEY);
  return pk ? privateKeyToAccount(pk) : null;
}

export function getFujiWalletClient(
  env: Record<string, string | undefined> = process.env,
) {
  const account = getFujiSignerAccount(env);
  if (!account) return null;
  return createWalletClient({
    account,
    chain: avalancheFuji,
    transport: http(getFujiRpcUrl(), { timeout: 15_000, retryCount: 1 }),
  });
}

/** Returns true when live Fuji AVAX transactions should be broadcast on-chain. */
export function isLiveBroadcastEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.OPALX_OFFLINE_TEST === "1") return false;
  const addrs = getGatewayAddresses(env);
  return (
    Boolean(getFujiSignerAccount(env)) &&
    isNonZeroAddress(addrs.enterpriseGateway) &&
    isNonZeroAddress(addrs.bankGateway) &&
    isNonZeroAddress(addrs.opalxCore)
  );
}

/** Deterministic Zero-PII HMAC-SHA256 bytes32 commitment for on-chain storage. */
export function computeCommitmentHash(
  namespace: "order" | "bankRef" | "invoice",
  rawIdentifier: string,
  pepper = process.env.OPALX_COMMITMENT_PEPPER ?? "opalx-dev-pepper",
): `0x${string}` {
  const hex = createHmac("sha256", pepper)
    .update(`${namespace}:${rawIdentifier.trim()}`)
    .digest("hex");
  return `0x${hex}`;
}

export function toBytes32Id(id: string): `0x${string}` {
  if (isHex(id) && id.length === 66) return id as `0x${string}`;
  return keccak256(toHex(id));
}
