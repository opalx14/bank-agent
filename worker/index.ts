import vinextHandler from "vinext/server/fetch-handler";
import opalxGuardWasm from "../crates/opalx-guard/opalx_guard.wasm";
import {
  flushWorkerLedgerToKv,
  hydrateWorkerLedgerFromKv,
  type CloudflareKvLike,
} from "../src/core/ledger/storage-adapter";
import { registerPrecompiledGuardWasm } from "../src/core/opalx/policy-bridge";
import {
  flushWorkerAgentFlagToKv,
  hydrateWorkerAgentFlagFromKv,
} from "../src/lib/avalanche/agent-wallet";

interface BankAgentWorkerEnv {
  ASSETS?: { fetch(request: Request): Promise<Response> };
  OPALX_LEDGER_KV?: CloudflareKvLike;
  [key: string]: unknown;
}

registerPrecompiledGuardWasm(opalxGuardWasm);

function syncWorkerEnvToProcess(env: BankAgentWorkerEnv): void {
  if (typeof process === "undefined" || !process.env) return;
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string" && value.length > 0 && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function shouldSkipKvHydration(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/brand/") ||
    pathname.startsWith("/icons/") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".js") ||
    pathname.endsWith(".woff2")
  );
}

const workerEntry = {
  async fetch(
    request: Request,
    env: BankAgentWorkerEnv,
    ctx: { waitUntil(promise: Promise<unknown>): void },
  ): Promise<Response> {
    syncWorkerEnvToProcess(env);
    registerPrecompiledGuardWasm(opalxGuardWasm);

    const pathname = new URL(request.url).pathname;
    const useKv = !shouldSkipKvHydration(pathname);
    if (useKv) {
      await Promise.all([
        hydrateWorkerLedgerFromKv(env.OPALX_LEDGER_KV),
        hydrateWorkerAgentFlagFromKv(env.OPALX_LEDGER_KV),
      ]);
    }

    const response = await vinextHandler.fetch(request, env, ctx);

    if (useKv) {
      await Promise.all([
        flushWorkerLedgerToKv(env.OPALX_LEDGER_KV),
        flushWorkerAgentFlagToKv(env.OPALX_LEDGER_KV),
      ]);
    }

    return response;
  },
};

export default workerEntry;
