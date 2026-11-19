"use client";

import Link from "next/link";
import { ChevronDown, ExternalLink, Mail, ShieldCheck } from "lucide-react";
import type { EnterpriseOrder } from "@/types";
import { formatVnd } from "@/components/shared/formatters";

interface EnterpriseOrderListProps {
  orders: EnterpriseOrder[];
  selectedOrderCode?: number;
  onSelectOrder: (order: EnterpriseOrder) => void;
  variant?: "card" | "accordion";
}

function getOrderStatusMeta(status: EnterpriseOrder["status"]): {
  label: string;
  className: string;
} {
  if (status === "GUARANTEED") return { label: "GUARANTEED", className: "ox-badge-verified" };
  if (status === "DENIED") return { label: "DENIED", className: "ox-badge-avax" };
  if (status === "REVOKED") return { label: "REVOKED", className: "ox-badge-avax" };
  if (status === "NEEDS_APPROVAL") return { label: "NEEDS APPROVAL", className: "ox-badge-warn" };
  return { label: "PENDING PAYMENT", className: "ox-badge-warn" };
}

function OrderRows({
  orders,
  selectedOrderCode,
  onSelectOrder,
}: Omit<EnterpriseOrderListProps, "variant">) {
  if (orders.length === 0) {
    return (
      <p className="py-7 text-center text-xs text-[var(--ox-muted)]">
        No customer orders yet.
      </p>
    );
  }

  return (
    <div className="divide-y divide-[var(--ox-line)]">
      {orders.map((ord) => {
        const active = ord.orderCode === selectedOrderCode;
        const statusMeta = getOrderStatusMeta(ord.status);
        const isOpalxDirect = ord.paymentMethod === "OPALX_DIRECT";
        const customerEmail = ord.buyerEmail?.trim();
        const customerFallback = ord.payerName?.trim() || ord.buyerName;

        return (
          <div
            key={ord.orderCode}
            className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs transition-colors ${
              active ? "bg-[var(--ox-ok-tint)]" : "hover:bg-[var(--ox-soft)]"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelectOrder(ord)}
              className="min-w-0 flex-1 space-y-1 text-left"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-bold text-[var(--ox-ink)] tabular-nums">#{ord.orderCode}</span>
                <span className="font-mono font-bold text-[var(--ox-ok-ink)] tabular-nums">
                  {formatVnd(ord.amountVnd)}
                </span>
                <span
                  className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                    isOpalxDirect
                      ? "ox-badge-info"
                      : "border border-[var(--ox-line)] bg-[var(--ox-soft)] text-[var(--ox-muted)]"
                  }`}
                >
                  {isOpalxDirect ? "OpalX GO" : "VietQR Bank"}
                </span>
              </div>

              <p className="truncate font-semibold text-[var(--ox-ink)]">
                {ord.productName ?? ord.sellerName}
              </p>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--ox-muted)]">
                <span className="inline-flex items-center gap-1 truncate">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">{customerEmail || customerFallback}</span>
                </span>
                {customerEmail && customerFallback && customerFallback !== customerEmail && (
                  <span className="truncate">· {customerFallback}</span>
                )}
              </div>
            </button>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <span className={`rounded-lg px-2.5 py-1 font-mono text-[10px] font-semibold ${statusMeta.className}`}>
                {statusMeta.label}
              </span>

              {ord.guaranteeId && (
                <Link
                  href={`/verify/${encodeURIComponent(ord.guaranteeId)}`}
                  className="ox-btn-ghost inline-flex min-h-[30px] items-center gap-1 rounded-lg px-2.5 py-1 font-mono text-[10px] font-semibold"
                >
                  <ShieldCheck className="h-3 w-3 text-[var(--ox-ok-ink)]" />
                  <span>Verify Pass</span>
                  <ExternalLink className="h-2.5 w-2.5" />
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function EnterpriseOrderList({
  orders,
  selectedOrderCode,
  onSelectOrder,
  variant = "accordion",
}: EnterpriseOrderListProps) {
  const guaranteedCount = orders.filter((o) => o.status === "GUARANTEED").length;

  if (variant === "card") {
    return (
      <section className="ox-card overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ox-line)] bg-[var(--ox-soft)] px-4 py-3">
          <h3 className="text-xs font-bold text-[var(--ox-ink)] sm:text-sm">
            Customer Orders &amp; Issued Guarantees ({orders.length})
          </h3>
          <span className="ox-badge-verified rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums">
            {guaranteedCount} guaranteed
          </span>
        </div>
        <OrderRows orders={orders} selectedOrderCode={selectedOrderCode} onSelectOrder={onSelectOrder} />
      </section>
    );
  }

  return (
    <details className="ox-card group overflow-hidden rounded-2xl">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 text-xs font-bold text-[var(--ox-ink)]">
        <span>Customer Orders &amp; Issued Guarantees ({orders.length})</span>
        <ChevronDown className="h-4 w-4 text-[var(--ox-muted)] transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-[var(--ox-line)]">
        <OrderRows orders={orders} selectedOrderCode={selectedOrderCode} onSelectOrder={onSelectOrder} />
      </div>
    </details>
  );
}
