"use client";

import { useState } from "react";
import { Bot, CheckCircle2, KeyRound, Loader2, LockOpen, ShieldAlert, ShieldCheck } from "lucide-react";
import type { AgentRunResult } from "@/core/agent/agent.runtime";
import type { AgentRegistrationCard } from "@/lib/avalanche/avalanche.agent-card";
import type { OnChainGuaranteeVerification } from "@/lib/avalanche/avalanche.reader";
import type { GuaranteeCertificate, PolicyEvaluationResult } from "@/types";
import { formatVnd, getVerdictBadgeClasses, truncateHex } from "@/components/shared/shared.formatters";

type StepStatus = "idle" | "active" | "done" | "error";

interface X402SettleResponse {
  ok?: boolean; error?: string; paymentSignatureHeader?: string;
  handshake?: { step3Verification?: { payer: string; settlementMode: string; transaction: string } };
}
interface X402AuditProofResponse {
  unlocked: boolean; guaranteeId: string;
  x402: { protocol: string; network: string; amountUnits: string; payer: string; settlementMode: string; transaction: string };
  guarantee: GuaranteeCertificate | null; onChainFuji: OnChainGuaranteeVerification;
  policyKernel: PolicyEvaluationResult; erc8004: AgentRegistrationCard;
}

const KERNEL_CHECKS: Array<[keyof PolicyEvaluationResult["checks"], string]> = [
  ["webhookSignatureValid", "Webhook HMAC"], ["bankRefUnique", "Bank Ref Unique"], ["amountExactMatch", "3-Way Amount"],
  ["invoiceXmlValid", "TT78 XML Sig"], ["washTradeClear", "No Wash Cycle"], ["withinAutoApproveLimit", "Within Limit"], ["vaultActive", "Vault Active"],
];
const STEP_LABELS = ["1. HTTP 402", "2. EIP-3009 Sign", "3. 200 OK Unlocked"] as const;
const STEP_CLS: Record<StepStatus, string> = {
  done: "ox-badge-verified", active: "ox-badge-info", error: "ox-badge-avax",
  idle: "border border-[var(--ox-line)] bg-[var(--ox-soft)] text-[var(--ox-muted)]",
};

/** Interactive x402 ($0.01 USDC) 3-gateway proof unlock and AI security audit drawer. */
export function VerifyX402AuditDrawer({ guaranteeId }: { guaranteeId: string }) {
  const [x402Loading, setX402Loading] = useState(false);
  const [x402Error, setX402Error] = useState<string | null>(null);
  const [steps, setSteps] = useState<[StepStatus, StepStatus, StepStatus]>(["idle", "idle", "idle"]);
  const [x402Proof, setX402Proof] = useState<X402AuditProofResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AgentRunResult | null>(null);

  const handleUnlockX402 = async () => {
    setX402Loading(true);
    setX402Error(null);
    setX402Proof(null);
    setSteps(["active", "idle", "idle"]);
    const url = `/api/x402/audit-proof?guaranteeId=${encodeURIComponent(guaranteeId)}`;
    try {
      const r1 = await fetch(url, { cache: "no-store" });
      if (r1.status !== 402 || !r1.headers.get("payment-required")) {
        setSteps(["error", "idle", "idle"]);
        throw new Error(`Step 1 failed: expected HTTP 402 + PAYMENT-REQUIRED (got ${r1.status}).`);
      }
      setSteps(["done", "active", "idle"]);
      const r2 = await fetch("/api/x402/settle", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ mode: "demo-buyer-agent", guaranteeId }),
      });
      const j2 = (await r2.json().catch(() => ({}))) as X402SettleResponse;
      if (!r2.ok || !j2.ok || !j2.paymentSignatureHeader || !j2.handshake) {
        setSteps(["done", "error", "idle"]);
        throw new Error(j2.error || `Step 2 failed: EIP-3009 sign returned HTTP ${r2.status}.`);
      }
      setSteps(["done", "done", "active"]);
      const r3 = await fetch(url, { cache: "no-store", headers: { "PAYMENT-SIGNATURE": j2.paymentSignatureHeader } });
      const j3 = (await r3.json().catch(() => ({}))) as Partial<X402AuditProofResponse> & { error?: string; invalidReason?: string };
      if (!r3.ok || !r3.headers.get("payment-response") || !j3.unlocked || !j3.x402 || !j3.policyKernel || !j3.onChainFuji || !j3.erc8004) {
        setSteps(["done", "done", "error"]);
        throw new Error(j3.invalidReason || j3.error || `Step 3 failed: expected HTTP 200 + PAYMENT-RESPONSE (got ${r3.status}).`);
      }
      setSteps(["done", "done", "done"]);
      setX402Proof(j3 as X402AuditProofResponse);
    } catch (err) {
      setX402Error(err instanceof Error ? err.message : "x402 audit unlock failed.");
    } finally {
      setX402Loading(false);
    }
  };

  const handleRunAiAudit = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/agent/assist", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ prompt: "Audit guarantee " + guaranteeId + " for prompt injection, amount integrity, and Fuji 3-way match compliance.", guaranteeId, scenario: "verify_onchain" }),
      });
      const json = (await res.json().catch(() => ({}))) as Partial<AgentRunResult> & { error?: string };
      if (!res.ok || !json.firewall || !json.answer) throw new Error(json.error || `AI audit failed (HTTP ${res.status}).`);
      setAiResult(json as AgentRunResult);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI security audit failed.");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <section className="ox-card space-y-4 rounded-3xl p-4 sm:p-5" aria-label="x402 Pay-Per-Audit and AI Security Verification">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <span className="ox-badge-info inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold">
            <KeyRound className="h-3 w-3" />
            <span>x402 v2 · EIP-3009 · 0 PII On-Chain</span>
          </span>
          <h2 className="text-sm font-bold text-[var(--ox-ink)]">x402 Pay-Per-Audit &amp; AI Security Verification</h2>
          <p className="text-xs text-[var(--ox-muted)]">Live HTTP 402 USDC micro-audit on Avalanche Fuji (<span className="font-mono tabular-nums">$0.01 USDC</span>) and Rust WASM AI firewall inspection.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={x402Loading} onClick={() => void handleUnlockX402()} className="ox-btn-primary inline-flex min-h-[40px] items-center gap-2 rounded-xl px-3.5 py-2 text-xs disabled:opacity-60">
            {x402Loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LockOpen className="h-3.5 w-3.5" />}
            <span>Unlock Deep Audit via x402 ($0.01 USDC)</span>
          </button>
          <button type="button" disabled={aiLoading} onClick={() => void handleRunAiAudit()} className="ox-btn-ghost inline-flex min-h-[40px] items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold disabled:opacity-60">
            {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
            <span>Run AI Security Audit</span>
          </button>
        </div>
      </div>

      {(x402Loading || x402Proof || x402Error) && (
        <div className="ox-subcard space-y-3 rounded-2xl p-3.5">
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] font-semibold">
            {STEP_LABELS.map((label, idx) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 ${STEP_CLS[steps[idx]!]}`}>
                  {steps[idx] === "active" && <Loader2 className="h-3 w-3 animate-spin" />}
                  {steps[idx] === "done" && <CheckCircle2 className="h-3 w-3" />}
                  <span>{label}</span>
                </span>
                {idx < 2 && <span className="text-[var(--ox-muted)]">-&gt;</span>}
              </span>
            ))}
          </div>
          {x402Error && <p className="ox-badge-avax rounded-xl px-3 py-2 font-mono text-xs">{x402Error}</p>}
          {x402Proof && (
            <div className="space-y-3 text-xs">
              <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-[var(--ox-muted)] tabular-nums">
                <span>Payer: <strong className="text-[var(--ox-ink)]">{truncateHex(x402Proof.x402.payer, 6)}</strong></span>
                <span>Mode: <strong className="text-[var(--ox-ink)]">{x402Proof.x402.settlementMode}</strong></span>
                <span>Tx: <strong className="text-[var(--ox-ink)]">{truncateHex(x402Proof.x402.transaction, 6)}</strong></span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="space-y-1 rounded-xl border border-[var(--ox-line)] bg-[var(--ox-surface)] p-3 font-mono text-[11px] tabular-nums">
                  <p className="font-sans text-xs font-bold text-[var(--ox-ink)]">3-Gateway Proof Summary</p>
                  <p className="text-[var(--ox-muted)]">Amount: <span className="font-semibold text-[var(--ox-ok-ink)]">{x402Proof.guarantee ? formatVnd(x402Proof.guarantee.amountVnd) : "On-Chain Commitment"}</span></p>
                  <p className="text-[var(--ox-muted)]">Commitment: <span className="text-[var(--ox-ink)]">{truncateHex(x402Proof.guarantee?.orderCommitment ?? x402Proof.onChainFuji.orderCommitment, 6)}</span> · 0 PII On-Chain</p>
                  <p className="text-[var(--ox-muted)]">Fuji RPC: <span className="text-[var(--ox-ink)]">{x402Proof.onChainFuji.source}</span> · {x402Proof.onChainFuji.valid ? "VALID" : "UNREGISTERED"}{x402Proof.onChainFuji.liveBlockNumber ? ` · #${x402Proof.onChainFuji.liveBlockNumber.toLocaleString("en-US")}` : ""}</p>
                  <p className="text-[var(--ox-muted)]">ERC-8004: <span className="text-[var(--ox-ink)]">{x402Proof.erc8004.name}</span> · {truncateHex(x402Proof.erc8004.registrations[0]?.agentRegistry, 8)} · {x402Proof.erc8004.x402.priceUsdc} USDC</p>
                </div>
                <div className="space-y-2 rounded-xl border border-[var(--ox-line)] bg-[var(--ox-surface)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="text-xs font-bold text-[var(--ox-ink)]">WASM Policy Kernel</span>
                    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${getVerdictBadgeClasses(x402Proof.policyKernel.verdict)}`}>{x402Proof.policyKernel.verdict} · {x402Proof.policyKernel.reasonCode} · {x402Proof.policyKernel.wasmExecuted ? "WASM" : "Fallback"}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {KERNEL_CHECKS.map(([key, label]) => (
                      <span key={key} className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] ${x402Proof.policyKernel.checks[key] ? "bg-[var(--ox-ok-tint)] text-[var(--ox-ok-ink)]" : "bg-[var(--ox-avax-tint)] text-[var(--ox-avax-ink)]"}`}>{x402Proof.policyKernel.checks[key] ? "PASS" : "FAIL"} {label}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {aiError && <p className="ox-badge-avax rounded-xl px-3 py-2 font-mono text-xs">{aiError}</p>}
      {aiResult && (
        <div className="ox-subcard space-y-2.5 rounded-2xl p-3.5 text-xs">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] tabular-nums">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold ${aiResult.firewall.blocked ? "ox-badge-avax" : "ox-badge-verified"}`}>
              {aiResult.firewall.blocked ? <ShieldAlert className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
              <span>Firewall: {aiResult.firewall.blocked ? "BLOCKED" : "ALLOWED"} (Risk {aiResult.firewall.riskScore}/100)</span>
            </span>
            {aiResult.wasmDecision && <span className={`rounded-full px-2.5 py-0.5 font-bold ${getVerdictBadgeClasses(aiResult.wasmDecision.verdict)}`}>WASM: {aiResult.wasmDecision.verdict} ({aiResult.wasmDecision.reasonCode}) · {aiResult.wasmDecision.wasmExecuted ? "WASM" : "Fallback"}</span>}
          </div>
          <p className="leading-relaxed text-[var(--ox-ink)]">{aiResult.answer}</p>
          <div className="flex flex-wrap gap-1.5 font-mono text-[10px] tabular-nums">
            {aiResult.toolTrace.map((t, i) => (
              <span key={`${t.tool}-${i}`} className={`rounded-full px-2 py-0.5 ${t.securityDecision === "ALLOWED" ? "border border-[var(--ox-line)] bg-[var(--ox-surface)] text-[var(--ox-ink)]" : "ox-badge-avax"}`}>{t.tool} · {t.securityDecision} · {t.latencyMs}ms</span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
