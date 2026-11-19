import { buildAgentRegistrationCard } from "@/lib/avalanche/agent-card";

export async function GET(request: Request): Promise<Response> {
  const origin = new URL(request.url).origin;
  return Response.json(buildAgentRegistrationCard(origin), {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
