import { z } from "zod";
import {
  deriveEmbeddedUserWallet,
  signUserWalletAction,
} from "@/core/auth/wallet-auth";
import {
  getActiveUserSession,
  saveActiveUserSession,
} from "@/core/ledger/store";

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
  }),
  z.object({
    mode: z.literal("LOGOUT"),
  }),
]);

export async function GET(): Promise<Response> {
  return Response.json(
    { session: getActiveUserSession() },
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
    return Response.json({ session: null }, { status: 200 });
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
    return Response.json({ session, confirmation }, { status: 200 });
  }

  let current = getActiveUserSession();
  if (!current) {
    current = deriveEmbeddedUserWallet({
      provider: "GOOGLE",
      email: "demo.member@california.vn",
      displayName: "California Demo Member",
      defaultScopeId: "california-fitness",
    });
  }
  const confirmation = await signUserWalletAction({
    email: current.email,
    provider: current.provider,
    action: data.action,
    summary: data.summary,
  });
  const updated = {
    ...current,
    lastConfirmedAtIso: confirmation.signedAtIso,
  };
  saveActiveUserSession(updated);
  return Response.json({ session: updated, confirmation }, { status: 200 });
}
