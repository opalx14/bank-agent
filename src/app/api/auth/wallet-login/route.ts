import { z } from "zod";
import { keccak256, toHex } from "viem";
import {
  buildSessionClearCookieHeader,
  buildSessionSetCookieHeader,
  resolveRequestSession,
} from "@/core/auth/auth.session-guard";
import {
  buildExternalWalletSession,
  createExternalWalletChallenge,
  deriveEmbeddedUserWallet,
  signUserWalletAction,
  verifyExternalWalletChallenge,
} from "@/core/auth/auth.wallet";
import { saveActiveUserSession } from "@/core/ledger/ledger.store";
import type { WalletActionConfirmation } from "@/types";

const authActionSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("LOGIN"),
    provider: z.enum(["GOOGLE", "EMAIL"]),
    email: z.string().trim().email("EMAIL_INVALID"),
    displayName: z.string().trim().max(80).optional(),
    defaultScopeId: z.string().trim().max(64).optional(),
    role: z.enum(["CUSTOMER", "ENTERPRISE", "BANK"]).optional(),
    rolePositionId: z.string().trim().max(64).optional(),
  }),
  z.object({
    mode: z.literal("EXTERNAL_CHALLENGE"),
    walletAddress: z.string().trim().regex(/^0x[a-fA-F0-9]{40}$/, "INVALID_WALLET_ADDRESS"),
    role: z.enum(["CUSTOMER", "ENTERPRISE", "BANK"]).optional(),
  }),
  z.object({
    mode: z.literal("EXTERNAL_VERIFY"),
    walletAddress: z.string().trim().regex(/^0x[a-fA-F0-9]{40}$/, "INVALID_WALLET_ADDRESS"),
    signature: z.string().trim().regex(/^0x[a-fA-F0-9]+$/, "INVALID_SIGNATURE"),
    message: z.string().min(10).max(2000),
    challengeToken: z.string().min(16).max(2000),
    connectorName: z.string().trim().max(64).optional(),
    displayName: z.string().trim().max(80).optional(),
    defaultScopeId: z.string().trim().max(64).optional(),
    role: z.enum(["CUSTOMER", "ENTERPRISE", "BANK"]).optional(),
    rolePositionId: z.string().trim().max(64).optional(),
  }),
  z.object({
    mode: z.literal("SWITCH_ROLE"),
    role: z.enum(["CUSTOMER", "ENTERPRISE", "BANK"]),
    rolePositionId: z.string().trim().max(64).optional(),
  }),
  z.object({
    mode: z.literal("CONFIRM_WALLET"),
    action: z
      .enum([
        "CREATE_PAYMENT",
        "CONFIRM_RECONCILE",
        "PRINT_INVOICE",
        "CLAIM_GUARANTEE_RIGHT",
        "GENERAL",
      ])
      .default("GENERAL"),
    summary: z.string().trim().min(1).max(200),
    signature: z.string().trim().regex(/^0x[a-fA-F0-9]+$/).optional(),
  }),
  z.object({
    mode: z.literal("LOGOUT"),
  }),
]);

export async function GET(request?: Request): Promise<Response> {
  const session = resolveRequestSession(request);
  return Response.json(
    { session },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON_BODY" }, { status: 400 });
  }

  const parsed = authActionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_AUTH_PAYLOAD", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const data = parsed.data;
  if (data.mode === "LOGOUT") {
    saveActiveUserSession(null);
    return Response.json(
      { session: null },
      {
        status: 200,
        headers: {
          "Set-Cookie": buildSessionClearCookieHeader(request),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  if (data.mode === "EXTERNAL_CHALLENGE") {
    try {
      const host =
        request.headers.get("x-forwarded-host") ||
        request.headers.get("host") ||
        new URL(request.url).host ||
        "bankagent.opalx14.com";
      const challenge = createExternalWalletChallenge({
        walletAddress: data.walletAddress,
        role: data.role ?? "CUSTOMER",
        domain: host,
      });
      return Response.json(challenge, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    } catch {
      return Response.json({ error: "INVALID_WALLET_ADDRESS" }, { status: 400 });
    }
  }

  if (data.mode === "EXTERNAL_VERIFY") {
    const verified = await verifyExternalWalletChallenge({
      walletAddress: data.walletAddress,
      role: data.role,
      message: data.message,
      challengeToken: data.challengeToken,
      signature: data.signature as `0x${string}`,
    });
    if (!verified.ok) {
      return Response.json({ error: verified.error }, { status: 401 });
    }

    const baseSession = buildExternalWalletSession({
      walletAddress: verified.walletAddress,
      displayName: data.displayName,
      connectorName: data.connectorName,
      defaultScopeId: data.defaultScopeId,
      role: verified.role,
      rolePositionId: data.rolePositionId,
    });
    const signedAtIso = new Date().toISOString();
    const confirmation: WalletActionConfirmation = {
      walletAddress: baseSession.walletAddress,
      merchantContractAddress: baseSession.merchantContractAddress,
      action: "GENERAL",
      digestHex: verified.digestHex,
      signature: data.signature as `0x${string}`,
      signedAtIso,
    };
    const session = {
      ...baseSession,
      lastConfirmedAtIso: signedAtIso,
    };
    saveActiveUserSession(session);
    return Response.json(
      { session, confirmation },
      {
        status: 200,
        headers: {
          "Set-Cookie": buildSessionSetCookieHeader(session, request),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  if (data.mode === "SWITCH_ROLE") {
    const current = resolveRequestSession(request);
    if (!current) {
      return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    }
    const rolePositionId = data.rolePositionId?.trim() || undefined;
    const updated = {
      ...current,
      role: data.role,
      ...(rolePositionId ? { rolePositionId } : { rolePositionId: undefined }),
      defaultScopeId:
        rolePositionId ??
        (data.role === "ENTERPRISE"
          ? current.provider === "EXTERNAL_WALLET"
            ? current.walletAddress.toLowerCase()
            : current.email
          : "california-fitness"),
    };
    saveActiveUserSession(updated);
    return Response.json(
      { session: updated },
      {
        status: 200,
        headers: {
          "Set-Cookie": buildSessionSetCookieHeader(updated, request),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  if (data.mode === "LOGIN") {
    const derived = deriveEmbeddedUserWallet({
      provider: data.provider,
      email: data.email,
      displayName: data.displayName,
      defaultScopeId: data.defaultScopeId,
      ...(data.role ? { role: data.role } : {}),
      ...(data.rolePositionId ? { rolePositionId: data.rolePositionId } : {}),
    });
    const confirmation = await signUserWalletAction({
      email: derived.email,
      provider: derived.provider,
      action: "GENERAL",
      summary: `Activate wallet & contract for ${derived.email}`,
    });
    const session = {
      ...derived,
      lastConfirmedAtIso: confirmation.signedAtIso,
    };
    saveActiveUserSession(session);
    return Response.json(
      { session, confirmation },
      {
        status: 200,
        headers: {
          "Set-Cookie": buildSessionSetCookieHeader(session, request),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const current = resolveRequestSession(request);
  if (!current) {
    return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  let confirmation: WalletActionConfirmation;
  if (current.provider === "EXTERNAL_WALLET") {
    const signedAtIso = new Date().toISOString();
    const digestHex = keccak256(
      toHex(
        `${data.action}:${current.walletAddress}:${current.merchantContractAddress}:${data.summary}:${signedAtIso}`,
      ),
    );
    confirmation = {
      walletAddress: current.walletAddress,
      merchantContractAddress: current.merchantContractAddress,
      action: data.action,
      digestHex,
      signature: (data.signature as `0x${string}` | undefined) ?? digestHex,
      signedAtIso,
    };
  } else {
    confirmation = await signUserWalletAction({
      email: current.email,
      provider: current.provider,
      action: data.action,
      summary: data.summary,
    });
  }

  const updated = {
    ...current,
    lastConfirmedAtIso: confirmation.signedAtIso,
  };
  saveActiveUserSession(updated);
  return Response.json(
    { session: updated, confirmation },
    {
      status: 200,
      headers: {
        "Set-Cookie": buildSessionSetCookieHeader(updated, request),
        "Cache-Control": "no-store",
      },
    },
  );
}
