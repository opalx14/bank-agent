import { getLiveAvaxTreasurySnapshot } from "@/core/opalx/opalx.treasury";
import { getFujiNetworkTelemetry } from "@/lib/avalanche/avalanche.network";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const live = url.searchParams.get("live") !== "0";
  const [snapshot, telemetry] = await Promise.all([
    getLiveAvaxTreasurySnapshot(live),
    live ? getFujiNetworkTelemetry() : Promise.resolve(null),
  ]);

  return Response.json(
    { snapshot, ...(telemetry ? { telemetry } : {}) },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
