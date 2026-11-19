import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { AVALANCHE_FUJI_NETWORK, getGatewayAddresses } from "./network";

export interface AgentWalletStatus {
  agentEnabled: boolean;
  popupFree: true;
  extensionRequired: false;
  activeDriver: "PRIVY_DELEGATED_SIGNER" | "FUJI_SERVER_SIGNER";
  walletAddress?: `0x${string}`;
  chainId: 43113;
  maxPerTxAvax: string;
  allowedContracts: [`0x${string}`, `0x${string}`, `0x${string}`];
  privyConfigured: boolean;
  missingPrivyKeys: string[];
}

const PRIVY_ENV_KEYS = [
  "NEXT_PUBLIC_PRIVY_APP_ID",
  "PRIVY_APP_SECRET",
  "PRIVY_AGENT_SIGNER_ID",
  "PRIVY_AGENT_POLICY_ID",
  "PRIVY_AGENT_PRIVATE_KEY",
] as const;

function resolveSessionPath(): string {
  const ledgerPath = process.env.OPALX_LEDGER_PATH?.trim();
  const baseDir = ledgerPath ? path.dirname(ledgerPath) : path.join(process.cwd(), ".opalx");
  return path.join(baseDir, "agent-session.json");
}

function readPublicAddress(rawKey?: string): `0x${string}` | undefined {
  const trimmed = rawKey?.trim() ?? "";
  if (!trimmed) return undefined;
  const candidate = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(candidate)) return undefined;
  try {
    return privateKeyToAccount(candidate as `0x${string}`).address;
  } catch {
    return undefined;
  }
}

export function isAgentSignerEnabled(): boolean {
  const filePath = resolveSessionPath();
  if (!existsSync(filePath)) return true;
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as { agentEnabled?: unknown };
    return typeof parsed.agentEnabled === "boolean" ? parsed.agentEnabled : true;
  } catch {
    return true;
  }
}

export function setAgentSignerEnabled(enabled: boolean): boolean {
  const filePath = resolveSessionPath();
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(
    tmp,
    JSON.stringify({ agentEnabled: enabled, updatedAtIso: new Date().toISOString() }, null, 2),
    "utf8",
  );
  renameSync(tmp, filePath);
  return enabled;
}

/** Reports 0-popup server/Privy delegated signer policy status without leaking secrets. */
export function getAgentWalletStatus(
  env: Record<string, string | undefined> = process.env,
): AgentWalletStatus {
  const missingPrivyKeys = PRIVY_ENV_KEYS.filter((k) => !(env[k] ?? "").trim());
  const privyConfigured = missingPrivyKeys.length === 0;
  const addrs = getGatewayAddresses(env);
  const walletAddress = readPublicAddress(env.AVALANCHE_ISSUER_PRIVATE_KEY);

  return {
    agentEnabled: isAgentSignerEnabled(),
    popupFree: true,
    extensionRequired: false,
    activeDriver: privyConfigured ? "PRIVY_DELEGATED_SIGNER" : "FUJI_SERVER_SIGNER",
    ...(walletAddress ? { walletAddress } : {}),
    chainId: AVALANCHE_FUJI_NETWORK.chainId,
    maxPerTxAvax: env.AGENT_MAX_AVAX?.trim() || "0.01",
    allowedContracts: [addrs.enterpriseGateway, addrs.bankGateway, addrs.opalxCore],
    privyConfigured,
    missingPrivyKeys,
  };
}
