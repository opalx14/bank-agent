import { z } from "zod";
import { runSecurityAgent } from "@/core/agent/agent.runtime";
import { FORBIDDEN_PRIVILEGE_TOOLS } from "@/core/agent/agent.security-firewall";
import { AGENT_TOOL_DEFINITIONS } from "@/core/agent/agent.tools";

const assistRequestSchema = z.object({
  prompt: z.string().trim().min(2).max(4000),
  guaranteeId: z.string().trim().min(1).max(64).optional(),
  invoiceXml: z.string().max(50_000).optional(),
  orderAmountVnd: z.number().finite().nonnegative().optional(),
  bankPaidAmountVnd: z.number().finite().nonnegative().optional(),
  webhookSignatureValid: z.boolean().optional(),
  washTradeEdges: z
    .array(
      z.object({
        from: z.string().trim().min(1),
        to: z.string().trim().min(1),
      }),
    )
    .max(50)
    .optional(),
  scenario: z
    .enum(["verify_onchain", "prompt_injection", "wash_trade", "x402_quote", "wallet_audit"])
    .optional(),
});

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export async function GET(): Promise<Response> {
  const hasLlmKey =
    Boolean((process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || "").trim()) &&
    process.env.OPALX_OFFLINE_TEST !== "1";

  return Response.json(
    {
      agent: "OpalX Security & Policy Agent",
      runtimeMode: hasLlmKey ? "LIVE_LLM_TOOL_CALLING" : "DETERMINISTIC_TOOL_PLANNER",
      tools: AGENT_TOOL_DEFINITIONS,
      firewall: {
        promptInjectionDefense: true,
        privilegeAllowlist: true,
        wasmFinalVeto: true,
        forbiddenTools: FORBIDDEN_PRIVILEGE_TOOLS,
      },
    },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json(
      { error: "INVALID_JSON_BODY" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const parsed = assistRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_AGENT_PAYLOAD", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const result = await runSecurityAgent(parsed.data);
  return Response.json(result, { status: 200, headers: NO_STORE_HEADERS });
}
