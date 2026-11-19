import {
  extractTt78InvoiceSummary,
  proposeInvoiceFromUnstructuredText,
} from "@/core/enterprise/einvoice-parser";
import { detectCircularWashTrade, evaluateThreeWayPolicy } from "@/core/opalx/policy-bridge";
import type { EinvoiceSummary, PolicyVerdict } from "@/types";
import { buildEvalDataset } from "./cases";

export interface EvalCaseResult {
  id: string;
  category: "VALID" | "ADVERSARIAL";
  expectedVerdict: PolicyVerdict;
  actualVerdict: PolicyVerdict;
  expectedReasonCode?: string;
  actualReasonCode: string;
  wasmExecuted: boolean;
  passed: boolean;
}

export interface EvalSuiteSummary {
  total: number;
  passed: number;
  failed: number;
  adversarialTotal: number;
  adversarialPassed: number;
  adversarialPrecisionPct: string;
  results: EvalCaseResult[];
}

export function runArchitectureEvalSuite(): EvalSuiteSummary {
  const dataset = buildEvalDataset();
  const results: EvalCaseResult[] = dataset.map((item) => {
    let einvoice: EinvoiceSummary | undefined;
    if (item.invoiceXml) {
      try {
        einvoice = extractTt78InvoiceSummary(item.invoiceXml);
      } catch {
        einvoice = undefined;
      }
    } else if (item.aiUnstructuredNote) {
      einvoice = proposeInvoiceFromUnstructuredText(item.aiUnstructuredNote);
    }

    const decision = evaluateThreeWayPolicy({
      orderAmountVnd: item.order.amountVnd,
      bankPaidAmountVnd: item.bankPaidAmountVnd,
      invoiceTotalVnd: einvoice?.totalAmountVnd,
      webhookSignatureValid: item.webhookSignatureValid,
      bankRefPresent: item.bankRef.trim().length > 0,
      bankRefAlreadyUsed: Boolean(item.bankRefAlreadyUsed),
      requireInvoiceXml: item.order.requireInvoiceXml,
      invoiceXmlSignatureValid: Boolean(einvoice?.signatureValid && einvoice.source === "TT78_XML"),
      vaultPaused: Boolean(item.vaultPaused),
      washTradeDetected: item.transferEdges ? detectCircularWashTrade(item.transferEdges) : false,
      autoApproveLimitVnd: item.autoApproveLimitVnd,
    });

    const verdictMatch = decision.verdict === item.expectedVerdict;
    const reasonMatch = !item.expectedReasonCode || decision.reasonCode === item.expectedReasonCode;
    return {
      id: item.id,
      category: item.category,
      expectedVerdict: item.expectedVerdict,
      actualVerdict: decision.verdict,
      expectedReasonCode: item.expectedReasonCode,
      actualReasonCode: decision.reasonCode,
      wasmExecuted: decision.wasmExecuted,
      passed: decision.wasmExecuted && verdictMatch && reasonMatch,
    };
  });

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const adversarial = results.filter((r) => r.category === "ADVERSARIAL");
  const adversarialPassed = adversarial.filter((r) => r.passed).length;
  const adversarialPrecisionPct =
    adversarial.length > 0 ? ((adversarialPassed / adversarial.length) * 100).toFixed(1) : "0.0";

  return {
    total,
    passed,
    failed: total - passed,
    adversarialTotal: adversarial.length,
    adversarialPassed,
    adversarialPrecisionPct,
    results,
  };
}

const isEntrypoint = Boolean((import.meta as ImportMeta & { main?: boolean }).main);
if (isEntrypoint) {
  const summary = runArchitectureEvalSuite();
  for (const item of summary.results) {
    if (!item.passed) {
      console.error(
        `FAIL ${item.id}: expected=${item.expectedVerdict}/${item.expectedReasonCode ?? "*"} actual=${item.actualVerdict}/${item.actualReasonCode}`,
      );
    }
  }
  console.log(
    `EVAL_RESULT total=${summary.total} passed=${summary.passed} failed=${summary.failed} adversarial_precision=${summary.adversarialPrecisionPct}%`,
  );
  if (summary.failed > 0) process.exit(1);
}
