import { z } from "zod";
import { requireApiRole } from "@/core/auth/auth.session-guard";
import { getAgentWalletStatus, setAgentSignerEnabled } from "@/lib/avalanche/avalanche.agent-wallet";
import { readWalletAvaxBalance } from "@/lib/avalanche/avalanche.reader";

const toggleSchema = z.object({
  enabled: z.boolean(),
});

export async function GET(): Promise<Response> {
  const [status, walletAvaxBalance] = await Promise.all([
    Promise.resolve(getAgentWalletStatus()),
    readWalletAvaxBalance(),
  ]);
  return Response.json(
    { ...status, ...(walletAvaxBalance ? { walletAvaxBalance } : {}) },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<Response> {
  const guard = requireApiRole(request, ["CUSTOMER", "ENTERPRISE", "BANK"]);
  if (!guard.ok) return guard.response;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON_BODY" }, { status: 400 });
  }

  const parsed = toggleSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: "INVALID_AGENT_SESSION_PAYLOAD" }, { status: 400 });
  }

  setAgentSignerEnabled(parsed.data.enabled);
  const [status, walletAvaxBalance] = await Promise.all([
    Promise.resolve(getAgentWalletStatus()),
    readWalletAvaxBalance(),
  ]);
  return Response.json(
    { ...status, ...(walletAvaxBalance ? { walletAvaxBalance } : {}) },
    { status: 200 },
  );
}
