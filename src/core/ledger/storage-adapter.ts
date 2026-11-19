import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export interface LedgerStorageBackendInfo {
  backend: "LOCAL_FILE" | "VERCEL_TMP_FILE" | "SUPABASE_POSTGRES_SYNC";
  filePath: string;
  remoteConfigured: boolean;
  tableName?: string;
}

const DEFAULT_SUPABASE_TABLE = "opalx_ledger_snapshots";
const PRIMARY_SNAPSHOT_ID = "primary";

/** Resolves the local or serverless temporary ledger JSON path. */
export function resolveLedgerFilePath(
  env: Record<string, string | undefined> = process.env,
): string {
  const customPath = env.OPALX_LEDGER_PATH?.trim();
  if (customPath) return customPath;
  if (env.VERCEL === "1" || Boolean(env.AWS_LAMBDA_FUNCTION_NAME)) {
    return path.join(/* turbopackIgnore: true */ tmpdir(), "opalx", "ledger.json");
  }
  return path.join(/* turbopackIgnore: true */ process.cwd(), ".opalx", "ledger.json");
}

/** Returns true when Supabase PostgREST credentials are configured for ledger sync. */
export function isRemotePostgresConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(env.SUPABASE_URL?.trim() && env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

/** Summarizes active ledger persistence mode without leaking secrets. */
export function getLedgerStorageInfo(
  env: Record<string, string | undefined> = process.env,
): LedgerStorageBackendInfo {
  const filePath = resolveLedgerFilePath(env);
  const remoteConfigured = isRemotePostgresConfigured(env);
  const isServerlessWithoutOverride =
    (env.VERCEL === "1" || Boolean(env.AWS_LAMBDA_FUNCTION_NAME)) &&
    !env.OPALX_LEDGER_PATH?.trim();
  const backend: LedgerStorageBackendInfo["backend"] = remoteConfigured
    ? "SUPABASE_POSTGRES_SYNC"
    : isServerlessWithoutOverride
      ? "VERCEL_TMP_FILE"
      : "LOCAL_FILE";

  return {
    backend,
    filePath,
    remoteConfigured,
    ...(remoteConfigured
      ? { tableName: env.OPALX_SUPABASE_LEDGER_TABLE?.trim() || DEFAULT_SUPABASE_TABLE }
      : {}),
  };
}

function getSupabaseRestTarget(
  env: Record<string, string | undefined> = process.env,
): { endpoint: string; headers: Record<string, string> } | null {
  if (!isRemotePostgresConfigured(env) || env.OPALX_OFFLINE_TEST === "1") {
    return null;
  }
  const baseUrl = env.SUPABASE_URL!.trim().replace(/\/+$/, "");
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY!.trim();
  const tableName = encodeURIComponent(
    env.OPALX_SUPABASE_LEDGER_TABLE?.trim() || DEFAULT_SUPABASE_TABLE,
  );
  return {
    endpoint: `${baseUrl}/rest/v1/${tableName}`,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  };
}

/** Reads the raw serialized ledger JSON from disk, or null if absent. */
export function readRawLedgerJson(): string | null {
  const target = resolveLedgerFilePath();
  if (!existsSync(/* turbopackIgnore: true */ target)) return null;
  return readFileSync(/* turbopackIgnore: true */ target, "utf8");
}

/** Atomically writes serialized ledger JSON to disk and triggers async Postgres snapshot sync. */
export function writeRawLedgerJson(serialized: string): void {
  const target = resolveLedgerFilePath();
  mkdirSync(/* turbopackIgnore: true */ path.dirname(/* turbopackIgnore: true */ target), {
    recursive: true,
  });
  const tmpPath = `${target}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(/* turbopackIgnore: true */ tmpPath, serialized, "utf8");
  renameSync(/* turbopackIgnore: true */ tmpPath, /* turbopackIgnore: true */ target);
  pushLedgerSnapshotToSupabase(serialized);
}

/** Upserts the primary ledger JSON snapshot to Supabase PostgREST without blocking callers. */
export function pushLedgerSnapshotToSupabase(serialized: string): void {
  const remote = getSupabaseRestTarget();
  if (!remote || typeof fetch !== "function") return;
  let payload: unknown;
  try {
    payload = JSON.parse(serialized);
  } catch {
    return;
  }
  try {
    void fetch(`${remote.endpoint}?on_conflict=id`, {
      method: "POST",
      headers: {
        ...remote.headers,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        id: PRIMARY_SNAPSHOT_ID,
        payload,
        updated_at: new Date().toISOString(),
      }),
    }).catch(() => undefined);
  } catch {
    // Ignore synchronous fetch dispatch failures during fire-and-forget sync.
  }
}

/** Hydrates the serialized primary ledger JSON snapshot from Supabase PostgREST if available. */
export async function hydrateLedgerFromSupabase(): Promise<string | null> {
  const remote = getSupabaseRestTarget();
  if (!remote || typeof fetch !== "function") return null;
  try {
    const response = await fetch(
      `${remote.endpoint}?id=eq.${PRIMARY_SNAPSHOT_ID}&select=payload`,
      {
        method: "GET",
        headers: {
          ...remote.headers,
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );
    if (!response.ok) return null;
    const rows = (await response.json()) as Array<{ payload?: unknown }>;
    if (!Array.isArray(rows) || !rows[0]?.payload) return null;
    return JSON.stringify(rows[0].payload, null, 2);
  } catch {
    return null;
  }
}
