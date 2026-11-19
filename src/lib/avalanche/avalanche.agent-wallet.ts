import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { AVALANCHE_FUJI_NETWORK, getGatewayAddresses } from "./avalanche.network";

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

interface WorkerAgentFlagState {
  active: boolean;
  enabled: boolean;
  dirty: boolean;
}

const WORKER_KV_AGENT_FLAG_KEY = "opalx:agent:enabled";

function getWorkerAgentFlagState(): WorkerAgentFlagState {
  const g = globalThis as typeof globalThis & { __opalxWorkerAgentFlagState?: WorkerAgentFlagState };
  if (!g.__opalxWorkerAgentFlagState) {
    g.__opalxWorkerAgentFlagState = { active: false, enabled: true, dirty: false };
  }
  return g.__opalxWorkerAgentFlagState;
}

export async function hydrateWorkerAgentFlagFromKv(
  kv?: { get(key: string): Promise<string | null> } | null,
): Promise<void> {
  const state = getWorkerAgentFlagState();
  state.active = true;
  state.dirty = false;
  if (!kv) return;
  try {
    const raw = await kv.get(WORKER_KV_AGENT_FLAG_KEY);
    if (raw === "true") state.enabled = true;
    else if (raw === "false") state.enabled = false;
  } catch {
    // Keep existing in-memory flag.
  }
}

export async function flushWorkerAgentFlagToKv(
  kv?: { put(key: string, value: string): Promise<void> } | null,
): Promise<void> {
  const state = getWorkerAgentFlagState();
  if (!state.active || !state.dirty) return;
  state.dirty = false;
  if (!kv) return;
  try {
    await kv.put(WORKER_KV_AGENT_FLAG_KEY, state.enabled ? "true" : "false");
  } catch {
    // Ignore transient KV error.
  }
}

export function isAgentSignerEnabled(): boolean {
  const state = getWorkerAgentFlagState();
  if (state.active) return state.enabled;
  try {
    const filePath = resolveSessionPath();
    if (!existsSync(filePath)) return true;
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as { agentEnabled?: unknown };
    return typeof parsed.agentEnabled === "boolean" ? parsed.agentEnabled : true;
  } catch {
    return state.enabled;
  }
}

export function setAgentSignerEnabled(enabled: boolean): boolean {
  const state = getWorkerAgentFlagState();
  if (state.active) {
    state.enabled = enabled;
    state.dirty = true;
    return enabled;
  }
  try {
    const filePath = resolveSessionPath();
    mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    writeFileSync(
      tmp,
      JSON.stringify({ agentEnabled: enabled, updatedAtIso: new Date().toISOString() }, null, 2),
      "utf8",
    );
    renameSync(tmp, filePath);
  } catch {
    state.active = true;
    state.enabled = enabled;
    state.dirty = true;
  }
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
