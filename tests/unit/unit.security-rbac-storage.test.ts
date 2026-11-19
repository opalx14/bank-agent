import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GET as getAccountMode } from "@/app/api/account-mode/route";
import { GET as getWalletLogin, POST as postWalletLogin } from "@/app/api/auth/wallet-login/route";
import { POST as postBankConfig } from "@/app/api/bank/config/route";
import { POST as postBankRails } from "@/app/api/bank/rails/route";
import { POST as postEnterprises } from "@/app/api/enterprises/route";
import { POST as toggleKillSwitch } from "@/app/api/policy/kill-switch/route";
import { POST as simulateBank } from "@/app/api/sandbox/simulate-bank/route";
import { POST as postAgentWalletSession } from "@/app/api/wallet/agent-session/route";
import { buildSessionSetCookieHeader, SESSION_TTL_SECONDS, signSessionCookieToken, verifySessionCookieToken } from "@/core/auth/auth.session-guard";
import { deriveEmbeddedUserWallet } from "@/core/auth/auth.wallet";
import { getLedgerStorageInfo, readRawLedgerJson, resolveLedgerFilePath, writeRawLedgerJson } from "@/core/ledger/ledger.storage-adapter";
import type { PortalRole } from "@/types";

const ENV_KEYS = ["OPALX_LEDGER_PATH", "OPALX_OFFLINE_TEST", "OPALX_ADMIN_API_KEY", "OPALX_SANDBOX_MODE", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "VERCEL"] as const;
let tempDir = "";
const prevEnv: Record<string, string | undefined> = {};

const jsonPost = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

const cookieOf = (res: Response): Record<string, string> => ({ Cookie: (res.headers.get("set-cookie") ?? "").split(";")[0] });

async function withEnv(overrides: Record<string, string | undefined>, fn: () => Promise<void> | void) {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(overrides)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

async function loginAs(role: PortalRole, email: string, defaultScopeId?: string) {
  const res = await postWalletLogin(jsonPost("http://localhost/api/auth/wallet-login", {
    mode: "LOGIN", provider: "EMAIL", email, role, ...(defaultScopeId ? { defaultScopeId } : {}),
  }));
  expect(res.status).toBe(200);
  return cookieOf(res);
}

beforeAll(() => {
  for (const k of ENV_KEYS) prevEnv[k] = process.env[k];
  tempDir = mkdtempSync(path.join(tmpdir(), "opalx-sec-"));
  process.env.OPALX_LEDGER_PATH = path.join(tempDir, "ledger.json");
  process.env.OPALX_OFFLINE_TEST = "1";
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (prevEnv[k] === undefined) delete process.env[k];
    else process.env[k] = prevEnv[k];
  }
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

describe("Security, Signed Cookies, RBAC, Sandbox Guard & Storage Adapter", () => {
  test("verifies signed HttpOnly cookie lifecycle, tamper rejection, expiry & Secure flags", () => {
    const session = deriveEmbeddedUserWallet({ provider: "EMAIL", email: "cookie.tester@opalx.vn", role: "ENTERPRISE" });
    const token = signSessionCookieToken(session);
    const verified = verifySessionCookieToken(token);
    expect(verified?.email).toBe("cookie.tester@opalx.vn");
    expect(verified?.walletAddress).toBe(session.walletAddress);
    expect(verified?.role).toBe("ENTERPRISE");

    const [payloadB64, sigB64] = token.split(".");
    expect(verifySessionCookieToken(`${payloadB64}.${sigB64.slice(0, -1)}${sigB64.endsWith("a") ? "b" : "a"}`)).toBeNull();
    expect(verifySessionCookieToken(`${payloadB64[0] === "a" ? "b" : "a"}${payloadB64.slice(1)}.${sigB64}`)).toBeNull();
    expect(verifySessionCookieToken("malformed-token")).toBeNull();

    const realNow = Date.now;
    let expiredToken = "";
    try {
      Date.now = () => realNow() - (SESSION_TTL_SECONDS + 30) * 1000;
      expiredToken = signSessionCookieToken(session);
    } finally {
      Date.now = realNow;
    }
    expect(verifySessionCookieToken(expiredToken)).toBeNull();

    const localCookie = buildSessionSetCookieHeader(session, new Request("http://localhost:5238/api/auth/wallet-login"));
    expect(localCookie).toContain("HttpOnly");
    expect(localCookie).toContain("SameSite=Lax");
    expect(localCookie).not.toContain("Secure");

    for (const req of [
      new Request("https://opalx.app/api/auth/wallet-login"),
      new Request("http://localhost/api/auth/wallet-login", { headers: { "x-forwarded-proto": "https" } }),
    ]) {
      const hdr = buildSessionSetCookieHeader(session, req);
      expect(hdr).toContain("HttpOnly");
      expect(hdr).toContain("SameSite=Lax");
      expect(hdr).toContain("; Secure");
    }
  });

  test("enforces session isolation with no ghost impersonation", async () => {
    const other = await postWalletLogin(jsonPost("http://localhost/api/auth/wallet-login", {
      mode: "LOGIN", provider: "GOOGLE", email: "user1@opalx.vn", role: "CUSTOMER",
    }));
    expect(other.status).toBe(200);

    const anonGet = await getWalletLogin(new Request("http://localhost/api/auth/wallet-login"));
    expect(anonGet.status).toBe(200);
    expect((await anonGet.json()).session).toBeNull();
    expect((await (await getWalletLogin()).json()).session).toBeNull();

    const anonConfirm = await postWalletLogin(jsonPost("http://localhost/api/auth/wallet-login", {
      mode: "CONFIRM_WALLET", action: "GENERAL", summary: "test",
    }));
    expect(anonConfirm.status).toBe(401);
    expect((await anonConfirm.json()).error).toBe("AUTH_REQUIRED");
  });

  test("enforces RBAC matrix, enterprise ownership isolation & admin API key", async () => {
    const endpoints: Array<[(req: Request) => Promise<Response>, string, unknown]> = [
      [toggleKillSwitch, "http://localhost/api/policy/kill-switch", { action: "pause" }],
      [postBankRails, "http://localhost/api/bank/rails", { action: "TOGGLE_RAIL", railId: "bank-mb", active: false }],
      [postBankConfig, "http://localhost/api/bank/config", { accountName: "TEST CORP" }],
      [postEnterprises, "http://localhost/api/enterprises", { action: "UPDATE_PROFILE", enterpriseId: "california-fitness", enterpriseName: "X" }],
      [postAgentWalletSession, "http://localhost/api/wallet/agent-session", { enabled: false }],
    ];
    for (const [handler, url, body] of endpoints) {
      const res = await handler(jsonPost(url, body));
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe("AUTH_REQUIRED");
    }

    const custHeaders = await loginAs("CUSTOMER", "buyer@opalx.vn");
    for (const [handler, url, body] of endpoints.slice(0, 4)) {
      const res = await handler(jsonPost(url, body, custHeaders));
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("FORBIDDEN_ROLE");
    }

    const entAHeaders = await loginAs("ENTERPRISE", "founder.a@corp.vn", "enterprise-a");
    for (const [handler, url, body] of endpoints.slice(0, 2)) {
      const res = await handler(jsonPost(url, body, entAHeaders));
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("FORBIDDEN_ROLE");
    }

    for (const payload of [
      { action: "UPDATE_PROFILE", enterpriseId: "california-fitness", enterpriseName: "Hijacked" },
      { action: "ADD_PACKAGE", enterpriseId: "california-fitness", label: "Rogue Pass", durationLabel: "1m", amountVnd: 100_000 },
    ]) {
      const res = await postEnterprises(jsonPost("http://localhost/api/enterprises", payload, entAHeaders));
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("FORBIDDEN_ENTERPRISE_OWNER");
    }

    await withEnv({ OPALX_ADMIN_API_KEY: "opalx_test_admin_secret_2026" }, async () => {
      const bad = await toggleKillSwitch(jsonPost("http://localhost/api/policy/kill-switch", { action: "pause" }, { "x-opalx-admin-key": "wrong_key" }));
      expect(bad.status).toBe(401);
      const pause = await toggleKillSwitch(jsonPost("http://localhost/api/policy/kill-switch", { action: "pause" }, { "x-opalx-admin-key": "opalx_test_admin_secret_2026" }));
      expect(pause.status).toBe(200);
      expect((await pause.json()).paused).toBe(true);
      const unpause = await toggleKillSwitch(jsonPost("http://localhost/api/policy/kill-switch", { action: "unpause" }, { "x-opalx-admin-key": "opalx_test_admin_secret_2026" }));
      expect(unpause.status).toBe(200);
    });
  });

  test("fails closed on sandbox endpoint when OPALX_SANDBOX_MODE=false", async () => {
    await withEnv({ OPALX_SANDBOX_MODE: "false" }, async () => {
      const res = await simulateBank(jsonPost("http://localhost/api/sandbox/simulate-bank", { orderCode: 20269999, scenario: "ALLOW_VALID" }));
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("SANDBOX_DISABLED_IN_LIVE_MODE");
    });
  });

  test("verifies pluggable storage adapter atomic persistence, Vercel tmp fallback & Supabase reporting", async () => {
    await withEnv({ OPALX_LEDGER_PATH: path.join(tempDir, "adapter-atomic.json") }, () => {
      expect(readRawLedgerJson()).toBeNull();
      const raw = JSON.stringify({ check: "atomic-ok", ts: 2026 });
      writeRawLedgerJson(raw);
      expect(readRawLedgerJson()).toBe(raw);
    });

    const vercelPath = resolveLedgerFilePath({ VERCEL: "1" });
    expect(vercelPath.startsWith(tmpdir())).toBe(true);
    expect(getLedgerStorageInfo({ VERCEL: "1" })).toEqual({ backend: "VERCEL_TMP_FILE", filePath: vercelPath, remoteConfigured: false });

    const supaEnv = { SUPABASE_URL: "https://demo.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "srv_key" };
    expect(getLedgerStorageInfo(supaEnv)).toEqual({
      backend: "SUPABASE_POSTGRES_SYNC", filePath: resolveLedgerFilePath(supaEnv), remoteConfigured: true, tableName: "opalx_ledger_snapshots",
    });

    await withEnv(supaEnv, async () => {
      const modeRes = await getAccountMode();
      expect(modeRes.status).toBe(200);
      const rawBody = await modeRes.text();
      expect(JSON.parse(rawBody).storageBackend).toEqual({ backend: "SUPABASE_POSTGRES_SYNC", remoteConfigured: true });
      expect(rawBody).not.toContain("srv_key");
      expect(rawBody).not.toContain("demo.supabase.co");
    });
  });
});
