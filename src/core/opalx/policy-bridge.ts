import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { PolicyEvaluationResult, PolicyVerdict } from "@/types";

export const DEFAULT_AUTO_APPROVE_LIMIT_VND = 10_000_000;

export interface TransferEdge {
  from: string;
  to: string;
}

export interface PolicyEvaluationInput {
  orderAmountVnd: number;
  bankPaidAmountVnd: number;
  invoiceTotalVnd?: number;
  webhookSignatureValid: boolean;
  bankRefPresent: boolean;
  bankRefAlreadyUsed: boolean;
  requireInvoiceXml: boolean;
  invoiceXmlSignatureValid: boolean;
  vaultPaused: boolean;
  washTradeDetected: boolean;
  autoApproveLimitVnd?: number;
}

const FLAG_WEBHOOK_SIG_VALID = 1 << 0;
const FLAG_BANK_REF_PRESENT = 1 << 1;
const FLAG_BANK_REF_USED = 1 << 2;
const FLAG_REQUIRE_INVOICE_XML = 1 << 3;
const FLAG_INVOICE_XML_SIG_VALID = 1 << 4;
const FLAG_VAULT_PAUSED = 1 << 5;
const FLAG_WASH_TRADE_DETECTED = 1 << 6;

const CODE_TO_DECISION: Record<number, { verdict: PolicyVerdict; reasonCode: string }> = {
  0: { verdict: "ALLOW", reasonCode: "NONE" },
  1: { verdict: "REQUIRE_APPROVAL", reasonCode: "EXCEEDS_AUTO_LIMIT_NEEDS_CFO_PASSKEY" },
  2: { verdict: "DENY", reasonCode: "VAULT_PAUSED" },
  3: { verdict: "DENY", reasonCode: "INVALID_WEBHOOK_SIGNATURE" },
  4: { verdict: "DENY", reasonCode: "MISSING_OR_DUPLICATE_BANK_REF" },
  5: { verdict: "DENY", reasonCode: "AMOUNT_MISMATCH" },
  6: { verdict: "DENY", reasonCode: "INVALID_INVOICE_XML_SIGNATURE" },
  7: { verdict: "DENY", reasonCode: "WASH_TRADE_CYCLE_DETECTED" },
};

type WasmEvalFn = (
  orderVnd: bigint,
  bankVnd: bigint,
  invoiceVnd: bigint,
  flags: number,
  autoLimitVnd: bigint,
) => number;

let cachedWasmEval: WasmEvalFn | null | undefined;

function loadWasmEval(): WasmEvalFn | null {
  if (cachedWasmEval !== undefined) return cachedWasmEval;
  const wasmPath = path.join(process.cwd(), "crates", "opalx-guard", "opalx_guard.wasm");
  if (!existsSync(wasmPath)) {
    cachedWasmEval = null;
    return null;
  }
  try {
    const mod = new WebAssembly.Module(readFileSync(wasmPath));
    const inst = new WebAssembly.Instance(mod, {});
    const fn = inst.exports.opalx_guard_eval;
    cachedWasmEval = typeof fn === "function" ? (fn as WasmEvalFn) : null;
  } catch {
    cachedWasmEval = null;
  }
  return cachedWasmEval;
}

export function isValidVnTaxId(mst: string): boolean {
  const cleaned = mst.trim();
  return /^\d{10}$/.test(cleaned) || /^\d{10}-\d{3}$/.test(cleaned);
}

/** Detects circular B2B wash-trade cycles (`A -> B -> C -> A`). */
export function detectCircularWashTrade(edges: TransferEdge[]): boolean {
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    const from = edge.from.trim();
    const to = edge.to.trim();
    if (!from || !to) continue;
    if (from === to) return true;
    const list = adj.get(from) ?? [];
    list.push(to);
    adj.set(from, list);
  }

  const state = new Map<string, 1 | 2>();
  const dfs = (node: string): boolean => {
    state.set(node, 1);
    for (const next of adj.get(node) ?? []) {
      const nextState = state.get(next);
      if (nextState === 1) return true;
      if (!nextState && dfs(next)) return true;
    }
    state.set(node, 2);
    return false;
  };

  for (const node of adj.keys()) {
    if (!state.get(node) && dfs(node)) return true;
  }
  return false;
}

function evaluateFallbackCode(input: PolicyEvaluationInput, limit: number): number {
  if (input.vaultPaused) return 2;
  if (!input.webhookSignatureValid) return 3;
  if (!input.bankRefPresent || input.bankRefAlreadyUsed) return 4;
  if (input.washTradeDetected) return 7;
  if (
    input.orderAmountVnd <= 0 ||
    input.bankPaidAmountVnd !== input.orderAmountVnd ||
    (input.invoiceTotalVnd !== undefined && input.invoiceTotalVnd !== input.orderAmountVnd)
  ) {
    return 5;
  }
  if (input.requireInvoiceXml && (!input.invoiceXmlSignatureValid || input.invoiceTotalVnd === undefined)) {
    return 6;
  }
  if (input.orderAmountVnd > limit) return 1;
  return 0;
}

/** Executes the Rust WASM policy kernel to produce a deterministic, fail-closed verdict. */
export function evaluateThreeWayPolicy(input: PolicyEvaluationInput): PolicyEvaluationResult {
  const limit = input.autoApproveLimitVnd ?? DEFAULT_AUTO_APPROVE_LIMIT_VND;
  const wasmFn = loadWasmEval();
  let wasmExecuted = false;
  let code: number;

  if (wasmFn) {
    let flags = 0;
    if (input.webhookSignatureValid) flags |= FLAG_WEBHOOK_SIG_VALID;
    if (input.bankRefPresent) flags |= FLAG_BANK_REF_PRESENT;
    if (input.bankRefAlreadyUsed) flags |= FLAG_BANK_REF_USED;
    if (input.requireInvoiceXml) flags |= FLAG_REQUIRE_INVOICE_XML;
    if (input.invoiceXmlSignatureValid) flags |= FLAG_INVOICE_XML_SIG_VALID;
    if (input.vaultPaused) flags |= FLAG_VAULT_PAUSED;
    if (input.washTradeDetected) flags |= FLAG_WASH_TRADE_DETECTED;

    code = wasmFn(
      BigInt(Math.max(0, Math.round(input.orderAmountVnd))),
      BigInt(Math.max(0, Math.round(input.bankPaidAmountVnd))),
      BigInt(Math.max(0, Math.round(input.invoiceTotalVnd ?? 0))),
      flags >>> 0,
      BigInt(Math.max(0, Math.round(limit))),
    );
    wasmExecuted = true;
  } else {
    code = evaluateFallbackCode(input, limit);
  }

  const mapped = CODE_TO_DECISION[code] ?? { verdict: "DENY", reasonCode: "UNKNOWN_KERNEL_CODE" };
  return {
    verdict: mapped.verdict,
    reasonCode: mapped.reasonCode,
    wasmExecuted,
    checks: {
      webhookSignatureValid: input.webhookSignatureValid,
      bankRefUnique: input.bankRefPresent && !input.bankRefAlreadyUsed,
      amountExactMatch:
        input.orderAmountVnd > 0 &&
        input.bankPaidAmountVnd === input.orderAmountVnd &&
        (input.invoiceTotalVnd === undefined || input.invoiceTotalVnd === input.orderAmountVnd),
      invoiceXmlValid: !input.requireInvoiceXml || input.invoiceXmlSignatureValid,
      washTradeClear: !input.washTradeDetected,
      withinAutoApproveLimit: input.orderAmountVnd <= limit,
      vaultActive: !input.vaultPaused,
    },
    evaluatedAtIso: new Date().toISOString(),
  };
}
