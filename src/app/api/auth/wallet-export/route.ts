import { z } from "zod";
import { resolveRequestSession } from "@/core/auth/session-guard";
import { exportEmbeddedUserWallet } from "@/core/auth/wallet-auth";

const exportRequestSchema = z.object({
  acknowledgedRisk: z.literal(true),
  keystorePassphrase: z.string().min(8, "PASSPHRASE_MIN_8").max(128).optional(),
});

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, private, max-age=0",
  Pragma: "no-cache",
  "X-Robots-Tag": "noindex",
};

export async function POST(request: Request): Promise<Response> {
  const session = resolveRequestSession(request);
  if (!session) {
    return Response.json(
      { error: "AUTH_REQUIRED", message: "Sign in to export your decentralized embedded wallet." },
      { status: 401, headers: NO_CACHE_HEADERS },
    );
  }

  if (session.provider === "EXTERNAL_WALLET") {
    return Response.json(
      {
        error: "EXTERNAL_WALLET_SELF_CUSTODIAL",
        message: "External wallets are already self-custodial in your browser extension or hardware wallet.",
      },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON_BODY" }, { status: 400, headers: NO_CACHE_HEADERS });
  }

  const parsed = exportRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      {
        error: "RISK_ACKNOWLEDGMENT_REQUIRED",
        message: "Please confirm the self-custody warning (and use >=8 chars if encrypting a keystore).",
        issues: parsed.error.issues,
      },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  try {
    const exported = exportEmbeddedUserWallet(session, {
      keystorePassphrase: parsed.data.keystorePassphrase,
    });
    return Response.json(exported, { status: 200, headers: NO_CACHE_HEADERS });
  } catch (err) {
    const code = err instanceof Error ? err.message : "WALLET_EXPORT_FAILED";
    return Response.json({ error: code }, { status: 400, headers: NO_CACHE_HEADERS });
  }
}
