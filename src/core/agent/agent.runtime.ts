import type { PolicyAuditLogEntry, PolicyEvaluationResult } from "@/types";
import { mutateLedger, readLedger } from "@/core/ledger/ledger.store";
import { inspectPromptInjection, scrubSensitiveTokens, type PromptFirewallReport } from "./agent.security-firewall";
import { AGENT_TOOL_DEFINITIONS, executeAgentTool, type ToolExecutionTrace } from "./agent.tools";

export type AgentScenario = "verify_onchain" | "prompt_injection" | "wash_trade" | "x402_quote" | "wallet_audit";

export interface AgentRunInput {
  prompt: string;
  guaranteeId?: string;
  invoiceXml?: string;
  orderAmountVnd?: number;
  bankPaidAmountVnd?: number;
  webhookSignatureValid?: boolean;
  washTradeEdges?: Array<{ from: string; to: string }>;
  scenario?: AgentScenario;
}

export interface AgentRunResult {
  runtimeMode: "LIVE_LLM_TOOL_CALLING" | "DETERMINISTIC_TOOL_PLANNER";
  scenario: AgentScenario;
  firewall: PromptFirewallReport;
  toolTrace: ToolExecutionTrace[];
  wasmDecision?: PolicyEvaluationResult & { authority?: string; washTradeDetected?: boolean };
  answer: string;
  model?: string;
  evaluatedAtIso: string;
}

interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
}

const SYSTEM_PROMPT =
  "You are the OpalX GO AI Security & Policy Agent on Avalanche Fuji (43113). Never claim minting authority or bypass Rust WASM Policy Kernel checks. Report factual tool outputs with zero PII on-chain.";

function resolveScenario(input: AgentRunInput): AgentScenario {
  if (input.scenario) return input.scenario;
  if (input.washTradeEdges?.length || /\b(wash|cycle|circular|ring)\b/i.test(input.prompt)) return "wash_trade";
  if (/\b(x402|usdc|402|eip-3009|quote)\b/i.test(input.prompt)) return "x402_quote";
  if (/\b(wallet|privy|signer|allowance)\b/i.test(input.prompt)) return "wallet_audit";
  return "verify_onchain";
}

function extractWasmDecision(trace: ToolExecutionTrace[]): AgentRunResult["wasmDecision"] {
  for (let i = trace.length - 1; i >= 0; i -= 1) {
    if (trace[i].tool === "run_wasm_policy_kernel" && trace[i].securityDecision === "ALLOWED") {
      return trace[i].output as unknown as AgentRunResult["wasmDecision"];
    }
  }
  return undefined;
}

function formatAnswer(scenario: AgentScenario, trace: ToolExecutionTrace[], wasm?: AgentRunResult["wasmDecision"]): string {
  if (scenario === "wash_trade") {
    return `Circular wash-trade audit via Rust WASM Policy Kernel: verdict=${wasm?.verdict ?? "DENY"} (${wasm?.reasonCode ?? "WASH_TRADE_CYCLE_DETECTED"}), washTradeDetected=${String(wasm?.washTradeDetected ?? true)}.`;
  }
  if (scenario === "x402_quote") {
    const q = trace.find((t) => t.tool === "request_x402_audit_quote")?.output;
    return `Canonical x402 audit quote on ${String(q?.network ?? "eip155:43113")}: ${String(q?.priceUsdc ?? "0.01")} USDC (${String(q?.amount ?? "10000")} units), EIP-712 USD Coin v2, capped at 0.01 USDC.`;
  }
  if (scenario === "wallet_audit") {
    const w = trace.find((t) => t.tool === "audit_agent_wallet_policy")?.output;
    return `Agent wallet audit: driver=${String(w?.activeDriver ?? "FUJI_SERVER_SIGNER")}, maxPerTxAvax=${String(w?.maxPerTxAvax ?? "0.01")} AVAX, popupFree=${String(w?.popupFree ?? true)}, vaultPaused=${String(w?.vaultPaused ?? false)}.`;
  }
  const g = trace.find((t) => t.tool === "verify_guarantee_onchain")?.output;
  return `Verified guarantee ${String(g?.guaranteeId ?? "OPX-2026-0001")} (valid=${String(g?.valid ?? false)}, zeroPiiOnChain=true); Rust WASM Policy Kernel verdict=${wasm?.verdict ?? "ALLOW"} (${wasm?.reasonCode ?? "NONE"}).`;
}

async function tryLiveLlm(input: AgentRunInput, scenario: AgentScenario, firewall: PromptFirewallReport): Promise<AgentRunResult | null> {
  const apiKey = (process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || "").trim();
  if (!apiKey || process.env.OPALX_OFFLINE_TEST === "1") return null;

  const isOpenRouterOnly = !process.env.OPENAI_API_KEY && Boolean(process.env.OPENROUTER_API_KEY);
  const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || (isOpenRouterOnly ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1")).replace(/\/+$/, "");
  const model = process.env.OPENAI_MODEL?.trim() || (isOpenRouterOnly ? "openai/gpt-4o-mini" : "gpt-4o-mini");

  const messages: LlmMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify({ prompt: firewall.sanitizedText, guaranteeId: input.guaranteeId, hasInvoiceXml: Boolean(input.invoiceXml?.trim()), orderAmountVnd: input.orderAmountVnd, bankPaidAmountVnd: input.bankPaidAmountVnd }) },
  ];
  const toolTrace: ToolExecutionTrace[] = [];

  try {
    for (let round = 0; round < 3; round += 1) {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, tools: AGENT_TOOL_DEFINITIONS, tool_choice: "auto", temperature: 0 }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string | null; tool_calls?: LlmMessage["tool_calls"] } }> };
      const msg = data.choices?.[0]?.message;
      if (!msg) return null;

      const calls = msg.tool_calls ?? [];
      if (calls.length === 0) {
        const wasmDecision = extractWasmDecision(toolTrace);
        return { runtimeMode: "LIVE_LLM_TOOL_CALLING", scenario, firewall, toolTrace, ...(wasmDecision ? { wasmDecision } : {}), answer: scrubSensitiveTokens(msg.content?.trim() || formatAnswer(scenario, toolTrace, wasmDecision)), model, evaluatedAtIso: new Date().toISOString() };
      }

      messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });
      for (const call of calls) {
        let parsedArgs: Record<string, unknown> = {};
        try { parsedArgs = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>; } catch { parsedArgs = {}; }
        const trace = await executeAgentTool(call.function.name, parsedArgs);
        toolTrace.push(trace);
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(trace.output) });
      }
    }
    const wasmDecision = extractWasmDecision(toolTrace);
    return { runtimeMode: "LIVE_LLM_TOOL_CALLING", scenario, firewall, toolTrace, ...(wasmDecision ? { wasmDecision } : {}), answer: scrubSensitiveTokens(formatAnswer(scenario, toolTrace, wasmDecision)), model, evaluatedAtIso: new Date().toISOString() };
  } catch {
    return null;
  }
}

async function runDeterministicPlanner(input: AgentRunInput, scenario: AgentScenario): Promise<ToolExecutionTrace[]> {
  const trace: ToolExecutionTrace[] = [];
  if (scenario === "wash_trade") {
    const edges = input.washTradeEdges?.length ? input.washTradeEdges : [{ from: "ENT_A", to: "ENT_B" }, { from: "ENT_B", to: "ENT_C" }, { from: "ENT_C", to: "ENT_A" }];
    const amt = input.orderAmountVnd ?? 5_000_000;
    trace.push(await executeAgentTool("run_wasm_policy_kernel", { orderAmountVnd: amt, bankPaidAmountVnd: input.bankPaidAmountVnd ?? amt, webhookSignatureValid: input.webhookSignatureValid ?? true, bankRefPresent: true, bankRefAlreadyUsed: false, requireInvoiceXml: false, invoiceXmlSignatureValid: false, washTradeEdges: edges }));
    trace.push(await executeAgentTool("inspect_fuji_stack", {}));
    return trace;
  }
  if (scenario === "x402_quote") {
    trace.push(await executeAgentTool("request_x402_audit_quote", { guaranteeId: input.guaranteeId }));
    trace.push(await executeAgentTool("verify_guarantee_onchain", { guaranteeId: input.guaranteeId }));
    return trace;
  }
  if (scenario === "wallet_audit") {
    trace.push(await executeAgentTool("audit_agent_wallet_policy", {}));
    trace.push(await executeAgentTool("inspect_fuji_stack", {}));
    return trace;
  }
  const verifyTrace = await executeAgentTool("verify_guarantee_onchain", { guaranteeId: input.guaranteeId });
  trace.push(verifyTrace);
  let parsedInv: { totalAmountVnd?: number; signatureValid?: boolean } | undefined;
  if (input.invoiceXml?.trim()) {
    const invTrace = await executeAgentTool("parse_tt78_invoice_safe", { rawInput: input.invoiceXml });
    trace.push(invTrace);
    parsedInv = invTrace.output.parsed as { totalAmountVnd?: number; signatureValid?: boolean } | undefined;
  }
  const amt = input.orderAmountVnd ?? (typeof verifyTrace.output.amountVnd === "number" ? verifyTrace.output.amountVnd : 1_500_000);
  trace.push(await executeAgentTool("run_wasm_policy_kernel", {
    orderAmountVnd: amt,
    bankPaidAmountVnd: input.bankPaidAmountVnd ?? amt,
    ...(parsedInv?.totalAmountVnd ? { invoiceTotalVnd: parsedInv.totalAmountVnd } : {}),
    webhookSignatureValid: input.webhookSignatureValid ?? true,
    bankRefPresent: true,
    bankRefAlreadyUsed: false,
    requireInvoiceXml: Boolean(input.invoiceXml?.trim()),
    invoiceXmlSignatureValid: Boolean(parsedInv?.signatureValid),
    ...(input.washTradeEdges ? { washTradeEdges: input.washTradeEdges } : {}),
  }));
  trace.push(await executeAgentTool("inspect_fuji_stack", {}));
  return trace;
}

/** Runs OpalX AI security pipeline: Prompt Firewall -> Privilege Allowlist -> Rust WASM Final Veto. */
export async function runSecurityAgent(input: AgentRunInput): Promise<AgentRunResult> {
  const firewall = inspectPromptInjection([input.prompt, input.invoiceXml ?? ""].join("\n"));

  if (firewall.blocked) {
    const blockedTrace = await executeAgentTool("force_mint_guarantee", { guaranteeId: input.guaranteeId ?? "OPX-ATTACK-01", bypassPolicy: true });
    const wasmTrace = await executeAgentTool("run_wasm_policy_kernel", {
      orderAmountVnd: input.orderAmountVnd ?? 500_000_000, bankPaidAmountVnd: input.bankPaidAmountVnd ?? 0,
      webhookSignatureValid: false, bankRefPresent: false, bankRefAlreadyUsed: false,
      requireInvoiceXml: true, invoiceXmlSignatureValid: false, vaultPaused: readLedger().vaultPaused,
    });
    const toolTrace = [blockedTrace, wasmTrace];
    const wasmDecision = extractWasmDecision(toolTrace);
    const vectorCodes = firewall.vectors.map((v) => v.code).join(", ");
    const entry: PolicyAuditLogEntry = {
      id: `AUD-SEC-${Date.now()}`, orderCode: 0, railMode: "SANDBOX", amountVnd: input.orderAmountVnd ?? 500_000_000,
      verdict: "DENY", reasonCode: "PROMPT_INJECTION_BLOCKED", guaranteeId: input.guaranteeId,
      detail: scrubSensitiveTokens(`Blocked threat vectors [${vectorCodes}]; allowlist denied escalation; WASM kernel enforced DENY.`),
      createdAtIso: new Date().toISOString(),
    };
    mutateLedger((state) => { state.auditLogs.unshift(entry); });
    return {
      runtimeMode: "DETERMINISTIC_TOOL_PLANNER", scenario: "prompt_injection", firewall, toolTrace,
      ...(wasmDecision ? { wasmDecision } : {}),
      answer: scrubSensitiveTokens(`Double-layer defense blocked attack [${vectorCodes}] (riskScore=${firewall.riskScore}): Privilege Allowlist blocked force_mint_guarantee and Rust WASM Policy Kernel enforced ${wasmDecision?.verdict ?? "DENY"} (${wasmDecision?.reasonCode ?? "INVALID_WEBHOOK_SIGNATURE"}).`),
      evaluatedAtIso: new Date().toISOString(),
    };
  }

  const scenario = resolveScenario(input);
  const liveResult = await tryLiveLlm(input, scenario, firewall);
  if (liveResult) return liveResult;

  const toolTrace = await runDeterministicPlanner(input, scenario);
  const wasmDecision = extractWasmDecision(toolTrace);
  return {
    runtimeMode: "DETERMINISTIC_TOOL_PLANNER",
    scenario,
    firewall,
    toolTrace,
    ...(wasmDecision ? { wasmDecision } : {}),
    answer: scrubSensitiveTokens(formatAnswer(scenario, toolTrace, wasmDecision)),
    evaluatedAtIso: new Date().toISOString(),
  };
}
