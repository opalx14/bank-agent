import { z } from "zod";
import { requireApiRole } from "@/core/auth/session-guard";
import { getLiveAvaxTreasurySnapshot } from "@/core/opalx/treasury-engine";
import { setVaultPauseState } from "@/core/ledger/store";
import { broadcastCorePauseState } from "@/lib/avalanche/broadcaster";
import { getGatewayAddresses } from "@/lib/avalanche/network";

const killSwitchSchema = z
  .object({
    paused: z.boolean().optional(),
    action: z.enum(["pause", "unpause"]).optional(),
  })
  .refine((v) => typeof v.paused === "boolean" || v.action !== undefined, {
    message: "Either paused or action is required",
  });

export async function GET(): Promise<Response> {
  const snapshot = await getLiveAvaxTreasurySnapshot(false);
  return Response.json(
    {
      paused: snapshot.vaultPaused,
      vaultPaused: snapshot.vaultPaused,
      opalxCoreAddress: getGatewayAddresses().opalxCore,
      availableReserveAvax: snapshot.availableReserveAvax,
      remainingDailyAllowanceAvax: snapshot.remainingDailyAllowanceAvax,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<Response> {
  const guard = requireApiRole(request, ["BANK"]);
  if (!guard.ok) return guard.response;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON_BODY" }, { status: 400 });
  }

  const parsed = killSwitchSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_KILL_SWITCH_PAYLOAD", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const nextPaused =
    typeof parsed.data.paused === "boolean"
      ? parsed.data.paused
      : parsed.data.action === "pause";

  const onChainResult = await broadcastCorePauseState(nextPaused);
  const paused = setVaultPauseState(nextPaused);
  const snapshot = await getLiveAvaxTreasurySnapshot(false);

  return Response.json(
    {
      paused,
      vaultPaused: paused,
      txHash: onChainResult.txHash,
      mode: onChainResult.mode,
      opalxCoreAddress: getGatewayAddresses().opalxCore,
      availableReserveAvax: snapshot.availableReserveAvax,
      remainingDailyAllowanceAvax: snapshot.remainingDailyAllowanceAvax,
    },
    { status: 200 },
  );
}
