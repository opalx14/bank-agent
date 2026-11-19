import { createHmac, timingSafeEqual } from "node:crypto";
import type { PortalRole, UserWalletSession } from "@/types";

export const SESSION_COOKIE_NAME = "opalx_session";
export const SESSION_TTL_SECONDS = 86_400;

interface SignedSessionPayload {
  session: UserWalletSession;
  iat: number;
  exp: number;
}

/** Resolves the HMAC secret used exclusively for signed HTTP session cookies. */
export function resolveSessionSecret(): string {
  return (
    process.env.OPALX_SESSION_SECRET?.trim() ||
    process.env.OPALX_WALLET_AUTH_PEPPER?.trim() ||
    process.env.OPALX_COMMITMENT_PEPPER?.trim() ||
    "opalx-session-secret-2026"
  );
}

function signPayloadB64(payloadB64: string): string {
  return createHmac("sha256", resolveSessionSecret()).update(payloadB64).digest("base64url");
}

function safeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function signSessionCookieToken(session: UserWalletSession): string {
  const iat = Date.now();
  const payload: SignedSessionPayload = { session, iat, exp: iat + SESSION_TTL_SECONDS * 1000 };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${payloadB64}.${signPayloadB64(payloadB64)}`;
}

export function verifySessionCookieToken(token: string): UserWalletSession | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64 || !safeEqualStrings(sigB64, signPayloadB64(payloadB64))) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as Partial<SignedSessionPayload> | null;
    if (!parsed || typeof parsed.exp !== "number" || parsed.exp <= Date.now()) return null;
    if (!parsed.session?.email || !parsed.session?.walletAddress) return null;
    return parsed.session;
  } catch {
    return null;
  }
}

export function isHttpsRequest(request?: Request): boolean {
  const proto = request?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return proto === "https" || Boolean(request?.url?.toLowerCase().startsWith("https://"));
}

export function buildSessionSetCookieHeader(session: UserWalletSession, request?: Request): string {
  const secureAttr = isHttpsRequest(request) ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${signSessionCookieToken(session)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secureAttr}`;
}

export function buildSessionClearCookieHeader(request?: Request): string {
  const secureAttr = isHttpsRequest(request) ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureAttr}`;
}

export function resolveRequestSession(request?: Request): UserWalletSession | null {
  if (!request) return null;

  const authHeader = request.headers.get("authorization");
  const bearerMatch = authHeader ? /^Bearer\s+(.+)$/i.exec(authHeader.trim()) : null;
  if (bearerMatch?.[1]) {
    const bearerSession = verifySessionCookieToken(bearerMatch[1].trim());
    if (bearerSession) return bearerSession;
  }

  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx <= 0 || part.slice(0, eqIdx).trim() !== SESSION_COOKIE_NAME) continue;
    const rawVal = part.slice(eqIdx + 1).trim();
    if (!rawVal) return null;
    const direct = verifySessionCookieToken(rawVal);
    if (direct) return direct;
    try {
      return verifySessionCookieToken(decodeURIComponent(rawVal));
    } catch {
      return null;
    }
  }
  return null;
}

export function isAdminApiKeyAuthorized(request: Request): boolean {
  const expected = process.env.OPALX_ADMIN_API_KEY?.trim();
  const provided = request.headers.get("x-opalx-admin-key")?.trim();
  return Boolean(expected && provided && safeEqualStrings(provided, expected));
}

export function requireApiRole(
  request: Request,
  allowedRoles: ReadonlyArray<PortalRole>,
): { ok: true; session: UserWalletSession | null; viaAdminKey: boolean } | { ok: false; response: Response } {
  if (isAdminApiKeyAuthorized(request)) {
    return { ok: true, session: null, viaAdminKey: true };
  }
  const session = resolveRequestSession(request);
  if (!session) {
    return { ok: false, response: Response.json({ error: "AUTH_REQUIRED" }, { status: 401 }) };
  }
  const actualRole: PortalRole = session.role ?? "CUSTOMER";
  if (!allowedRoles.includes(actualRole)) {
    return {
      ok: false,
      response: Response.json({ error: "FORBIDDEN_ROLE", requiredRoles: allowedRoles, actualRole }, { status: 403 }),
    };
  }
  return { ok: true, session, viaAdminKey: false };
}

export function isSandboxEndpointAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return env.OPALX_SANDBOX_MODE?.trim().toLowerCase() !== "false";
}

export function canMutateEnterprise(
  session: UserWalletSession | null,
  viaAdminKey: boolean,
  target: { id: string; ownerEmail?: string; ownerWalletAddress?: string },
): boolean {
  if (viaAdminKey || session?.role === "BANK") return true;
  if (session?.role !== "ENTERPRISE") return false;
  const targetId = target.id.toLowerCase();
  if (session.rolePositionId?.trim().toLowerCase() === targetId) return true;
  if (session.defaultScopeId?.trim().toLowerCase() === targetId) return true;
  if (target.ownerEmail && target.ownerEmail.trim().toLowerCase() === session.email.trim().toLowerCase()) {
    return true;
  }
  return Boolean(
    target.ownerWalletAddress &&
      target.ownerWalletAddress.toLowerCase() === session.walletAddress.toLowerCase(),
  );
}
