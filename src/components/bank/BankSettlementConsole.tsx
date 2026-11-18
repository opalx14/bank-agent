"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import type { EnterpriseOrder, PolicyEvaluationResult, SandboxScenario } from "@/types";
import { getVerdictBadgeClasses } from "@/components/shared/formatters";

const SCENARIOS: Array<{ id: SandboxScenario; label: string }> = [
  { id: "ALLOW_VALID", label: "Thanh Toán Hợp Lệ (ALLOW + Cấp Hóa Đơn)" },
  { id: "DENY_REPLAY", label: "Giả Lập Trùng Mã FT (Chặn Replay)" },
  { id: "DENY_INVALID_HMAC", label: "Sai Chữ Ký PayOS HMAC (Chặn 401/DENY)" },
  { id: "DENY_AMOUNT_MISMATCH", label: "Lệch Tiền Chuyển Khoản (Chặn DENY)" },
  { id: "REQUIRE_APPROVAL_LIMIT", label: "Đơn Vượt Ngưỡng 10M (Yêu Cầu CFO)" },
];

interface BankSettlementConsoleProps {
  orders: EnterpriseOrder[];
  onCompleted: () => Promise<void>;
}

export function BankSettlementConsole({ orders, onCompleted }: BankSettlementConsoleProps) {
  const [orderCode, setOrderCode] = useState<number>(orders[0]?.orderCode ?? 20260002);
  const [scenario, setScenario] = useState<SandboxScenario>("ALLOW_VALID");
  const [running, setRunning] = useState(false);
  const [lastDecision, setLastDecision] = useState<PolicyEvaluationResult | null>(null);
  const syncedHeadRef = useRef<number | null>(null);

  useEffect(() => {
    if (orders.length === 0) return;
    const head = orders[0]?.orderCode ?? null;
    const pending = orders.find((o) => o.status === "PENDING_BANK");
    const hasCurrent = orders.some((o) => o.orderCode === orderCode);
    if (!hasCurrent || (head !== null && head !== syncedHeadRef.current && pending)) {
      syncedHeadRef.current = head;
      setOrderCode(pending?.orderCode ?? head ?? 20260002);
    }
  }, [orders, orderCode]);

  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/sandbox/simulate-bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderCode, scenario }),
      });
      const json = (await res.json().catch(() => ({}))) as { decision?: PolicyEvaluationResult };
      if (json.decision) setLastDecision(json.decision);
      await onCompleted();
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="ox-subcard space-y-4 rounded-2xl p-4 sm:p-5">
      <div>
        <h2 className="text-base font-bold text-[var(--ox-ink)]">Kiểm Thử Xác Thực Webhook &amp; BankGateway</h2>
        <p className="mt-0.5 text-xs text-[var(--ox-muted)]">
          Mô phỏng kịch bản đối soát (Hợp lệ hoặc Chặn gian lận) trước khi chạy thật.
        </p>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <div>
          <label htmlFor="bank-order-select" className="mb-1.5 block text-xs font-medium text-[var(--ox-muted)]">
            Chọn Đơn Hàng
          </label>
          <select
            id="bank-order-select"
            value={orderCode}
            onChange={(e) => setOrderCode(Number(e.target.value))}
            className="ox-input min-h-[44px] w-full rounded-xl px-3.5 py-2 font-mono text-xs"
          >
            {orders.map((o) => (
              <option key={o.orderCode} value={o.orderCode}>
                #{o.orderCode} · {o.amountVnd.toLocaleString("vi-VN")} ₫ ({o.status})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="bank-scenario-select" className="mb-1.5 block text-xs font-medium text-[var(--ox-muted)]">
            Kịch Bản Xác Thực
          </label>
          <select
            id="bank-scenario-select"
            value={scenario}
            onChange={(e) => setScenario(e.target.value as SandboxScenario)}
            className="ox-input min-h-[44px] w-full rounded-xl px-3.5 py-2 text-xs"
          >
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="button"
        disabled={running}
        onClick={() => void handleRun()}
        className="ox-btn-ghost inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60 sm:w-auto"
      >
        {running ? (
          <Loader2 className="h-4 w-4 animate-spin text-[var(--ox-avax)]" />
        ) : (
          <ShieldAlert className="h-4 w-4 text-[var(--ox-avax)]" />
        )}
        <span>{running ? "Đang xác thực..." : "Chạy Kiểm Thử Cổng Ngân Hàng"}</span>
      </button>

      {lastDecision && (
        <div className={`rounded-xl border p-3.5 text-xs ${getVerdictBadgeClasses(lastDecision.verdict)}`}>
          Phán quyết Kernel: <strong>{lastDecision.verdict}</strong> · Mã lý do:{" "}
          <span className="font-mono">{lastDecision.reasonCode}</span> (WASM:{" "}
          {lastDecision.wasmExecuted ? "ON" : "FALLBACK"})
        </div>
      )}
    </section>
  );
}
