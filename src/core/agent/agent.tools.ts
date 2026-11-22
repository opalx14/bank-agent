import { AVALANCHE_FUJI_NETWORK, getFujiNetworkTelemetry, getGatewayAddresses } from "@/lib/avalanche/avalanche.network";
import { readPortalContractsTelemetry, verifyGuaranteeOnFuji } from "@/lib/avalanche/avalanche.reader";
import { getAgentWalletStatus } from "@/lib/avalanche/avalanche.agent-wallet";
import { extractTt78InvoiceSummary, proposeInvoiceFromUnstructuredText } from "@/core/enterprise/enterprise.einvoice-parser";
import { detectCircularWashTrade, evaluateThreeWayPolicy, type TransferEdge } from "@/core/opalx/opalx.policy-bridge";
import { findGuarantee, readLedger } from "@/core/ledger/ledger.store";
import { inspectPromptInjection, validateToolCall } from "./agent.security-firewall";

const FUJI_USDC_ADDRESS = "0x5425890298aed601595a70AB815c96711a31Bc65" as const;
const X402_MAX_USDC = 0.01;
const X402_PRICE_UNITS = "10000";

export interface AgentToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  };
}

export interface ToolExecutionTrace {
  tool: string;
  args: Record<string, unknown>;
  securityDecision: "ALLOWED" | "BLOCKED";
  latencyMs: number;
  output: Record<string, unknown>;
}

const defTool = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required?: string[],
): AgentToolDefinition => ({
  type: "function",
  function: {
    name,
    description,
    parameters: { type: "object", properties, ...(required ? { required } : {}) },
  },
});

export const AGENT_TOOL_DEFINITIONS: AgentToolDefinition[] = [
  defTool("inspect_fuji_stack", "Read Avalanche Fuji (43113) RPC telemetry, gateway addresses, ERC-8004 registries, and vault pause status.", {}),
  defTool("verify_guarantee_onchain", "Verify an OpalX guarantee certificate on Fuji OpalXGoCore and ledger.", {
    guaranteeId: { type: "string", description: "Guarantee ID such as OPX-2026-0001." },
  }),
  defTool("parse_tt78_invoice_safe", "Parse Circular 78 XML or propose unstructured draft (signatureValid=false on unstructured text).", {
    rawInput: { type: "string", description: "Circular 78 XML or unstructured invoice note." },
  }, ["rawInput"]),
  defTool("run_wasm_policy_kernel", "Execute deterministic Rust WASM 3-way policy kernel and circular wash-trade detector.", {
    orderAmountVnd: { type: "number" },
    bankPaidAmountVnd: { type: "number" },
    invoiceTotalVnd: { type: "number" },
    webhookSignatureValid: { type: "boolean" },
    bankRefPresent: { type: "boolean" },
    bankRefAlreadyUsed: { type: "boolean" },
    requireInvoiceXml: { type: "boolean" },
    invoiceXmlSignatureValid: { type: "boolean" },
    vaultPaused: { type: "boolean" },
    washTradeEdges: {
      type: "array",
      items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] },
    },
  }),
  defTool("request_x402_audit_quote", "Build canonical Circle Fuji USDC x402 EIP-3009 audit quote capped at 0.01 USDC.", {
    guaranteeId: { type: "string" },
    requestedMaxUsdc: { type: "string" },
  }),
  defTool("audit_agent_wallet_policy", "Inspect 0-popup delegated signer policy, AVAX cap, and contract allowlist without exposing secrets.", {}),
];

function asEdges(raw: unknown): TransferEdge[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is TransferEdge =>
      Boolean(item && typeof item === "object" && typeof (item as TransferEdge).from === "string" && typeof (item as TransferEdge).to === "string"),
  );
}

async function runAllowedTool(tool: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const offline = process.env.OPALX_OFFLINE_TEST === "1";
  const ledger = readLedger();
  const contracts = getGatewayAddresses();

  if (tool === "inspect_fuji_stack") {
    const [network, coreState] = offline
      ? [{ chainId: 43113 as const, blockNumber: null, gasPriceGwei: null, rpcHealthy: false, rpcUrl: "OFFLINE_TEST", checkedAtIso: new Date().toISOString() }, null]
      : await Promise.all([getFujiNetworkTelemetry(), readPortalContractsTelemetry()]);
    return { chainId: AVALANCHE_FUJI_NETWORK.chainId, caip2: AVALANCHE_FUJI_NETWORK.caip2, offlineMode: offline, network, contracts, erc8004: AVALANCHE_FUJI_NETWORK.erc8004, coreState, vaultPaused: ledger.vaultPaused, guaranteesCount: ledger.guarantees.length };
  }

  if (tool === "verify_guarantee_onchain") {
    const guaranteeId = typeof args.guaranteeId === "string" && args.guaranteeId.trim() ? args.guaranteeId.trim() : ledger.guarantees[0]?.guaranteeId ?? "OPX-2026-0001";
    const local = findGuarantee(guaranteeId);
    if (offline) {
      return { guaranteeId, chainId: AVALANCHE_FUJI_NETWORK.chainId, source: "LEDGER_OFFLINE_FALLBACK", foundInLedger: Boolean(local), valid: Boolean(local && !local.revoked), revoked: local?.revoked ?? false, amountVnd: local?.amountVnd ?? 1_500_000, collateralAvax: local?.collateralAvax, txHash: local?.proofBundle.guaranteeTxHash, zeroPiiOnChain: true };
    }
    const onChain = await verifyGuaranteeOnFuji(guaranteeId);
    return { ...onChain, foundInLedger: Boolean(local), amountVnd: local?.amountVnd, ledgerTxHash: local?.proofBundle.guaranteeTxHash, zeroPiiOnChain: true };
  }

  if (tool === "parse_tt78_invoice_safe") {
    const rawInput = typeof args.rawInput === "string" ? args.rawInput : "";
    const injectionScan = inspectPromptInjection(rawInput);
    if (rawInput.trim().startsWith("<")) {
      try {
        const parsed = extractTt78InvoiceSummary(rawInput);
        if (injectionScan.blocked) parsed.signatureValid = false;
        return { parsed, injectionScan, authority: injectionScan.blocked ? "BLOCKED_XML_INJECTION" : "TT78_STRUCTURED_EXTRACT" };
      } catch (err) {
        return { parsed: null, parseError: err instanceof Error ? err.message : "INVALID_TT78_XML", injectionScan, authority: "FAIL_CLOSED_REJECTED" };
      }
    }
    return { parsed: proposeInvoiceFromUnstructuredText(rawInput), injectionScan, authority: "PROPOSAL_ONLY_SIGNATURE_INVALID" };
  }

  if (tool === "run_wasm_policy_kernel") {
    const edges = asEdges(args.washTradeEdges);
    const washTradeDetected = edges.length > 0 ? detectCircularWashTrade(edges) : false;
    const decision = evaluateThreeWayPolicy({
      orderAmountVnd: typeof args.orderAmountVnd === "number" ? args.orderAmountVnd : 1_500_000,
      bankPaidAmountVnd: typeof args.bankPaidAmountVnd === "number" ? args.bankPaidAmountVnd : 0,
      invoiceTotalVnd: typeof args.invoiceTotalVnd === "number" ? args.invoiceTotalVnd : undefined,
      webhookSignatureValid: Boolean(args.webhookSignatureValid),
      bankRefPresent: Boolean(args.bankRefPresent),
      bankRefAlreadyUsed: Boolean(args.bankRefAlreadyUsed),
      requireInvoiceXml: Boolean(args.requireInvoiceXml),
      invoiceXmlSignatureValid: Boolean(args.invoiceXmlSignatureValid),
      vaultPaused: typeof args.vaultPaused === "boolean" ? args.vaultPaused : ledger.vaultPaused,
      washTradeDetected,
    });
    return { ...decision, washTradeDetected, edgeCount: edges.length, authority: "RUST_WASM_FINAL_VETO" };
  }

  if (tool === "request_x402_audit_quote") {
    const guaranteeId =
      typeof args.guaranteeId === "string" && args.guaranteeId.trim()
        ? args.guaranteeId.trim()
        : ledger.guarantees[0]?.guaranteeId ?? "OPX-2026-0001";
    const parsedBudget = typeof args.requestedMaxUsdc === "string" ? Number(args.requestedMaxUsdc) : X402_MAX_USDC;
    const requestedValid = Number.isFinite(parsedBudget) && parsedBudget > 0;
    return {
      x402Version: 2,
      scheme: "exact",
      network: AVALANCHE_FUJI_NETWORK.caip2,
      asset: FUJI_USDC_ADDRESS,
      extra: { name: "USD Coin", version: "2" },
      priceUsdc: "0.01",
      amount: X402_PRICE_UNITS,
      resource: "/api/x402/audit-proof",
      settleEndpoint: "/api/x402/settle",
      guaranteeId,
      payTo: contracts.opalxCore,
      spendControls: {
        maxSpendUsdc: "0.01",
        maxAtomicUnits: X402_PRICE_UNITS,
        requestedMaxUsdc: args.requestedMaxUsdc ?? "0.01",
        withinLimit: requestedValid ? parsedBudget >= X402_MAX_USDC : true,
        cappedToPolicyLimit: requestedValid && parsedBudget > X402_MAX_USDC,
      },
    };
  }

  return { ...getAgentWalletStatus(), vaultPaused: ledger.vaultPaused, signerIsolation: "SERVER_SIDE_NO_KEY_EXPORT" };
}

/** Validates privilege allowlist & argument firewall before executing any OpalX agent tool. */
export async function executeAgentTool(
  tool: string,
  args: Record<string, unknown> = {},
): Promise<ToolExecutionTrace> {
  const started = Date.now();
  const verdict = validateToolCall(tool, args);
  if (!verdict.allowed) {
    return {
      tool,
      args,
      securityDecision: "BLOCKED",
      latencyMs: Date.now() - started,
      output: { blocked: true, code: verdict.code, reason: verdict.reason },
    };
  }
  const output = await runAllowedTool(tool, args);
  return { tool, args, securityDecision: "ALLOWED", latencyMs: Date.now() - started, output };
}
