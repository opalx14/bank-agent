"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ExternalLink, Landmark, Loader2, RefreshCw } from "lucide-react";
import type {
  AvaxTreasurySnapshot, BankAttestationProof, BankPartnerRail, EnterpriseOrder,
  GuaranteeCertificate, PolicyAuditLogEntry, SupportedVnBank, VerifiedEnterpriseProfile,
} from "@/types";
import { RoleLoginGateway } from "@/components/auth/RoleLoginGateway";
import { useWalletAuth } from "@/components/auth/WalletAuthProvider";
import { useAccountMode } from "@/components/layout/AccountModeProvider";
import { BrandOrb } from "@/components/shared/BrandOrb";
import { truncateHex } from "@/components/shared/formatters";
import { AvaxTreasuryCard } from "@/components/opalx/AvaxTreasuryCard";
import { ContractAddressesBar } from "@/components/opalx/ContractAddressesBar";
import { EmergencyPauseCard } from "@/components/opalx/EmergencyPauseCard";
import { PolicyAuditTable } from "@/components/opalx/PolicyAuditTable";
import { BankAttestationTable } from "./BankAttestationTable";
import { BankPartnerRailManager } from "./BankPartnerRailManager";
import { BankSettlementConsole } from "./BankSettlementConsole";

const DEFAULT_ENDPOINTS = { sepayPath: "/api/webhooks/sepay", payosPath: "/api/webhooks/payos" };
const FALLBACK_BANK_GATEWAY = "0xf786333845a1b373b455d8f419b42291f821e721";

export function BankGatewayView() {
  const { roleSession, loading: authLoading } = useWalletAuth();
  const { activeProfile } = useAccountMode();
  const [bankRails, setBankRails] = useState<BankPartnerRail[]>([]);
  const [supportedBanks, setSupportedBanks] = useState<SupportedVnBank[]>([]);
  const [enterprises, setEnterprises] = useState<VerifiedEnterpriseProfile[]>([]);
  const [webhookEndpoints, setWebhookEndpoints] = useState(DEFAULT_ENDPOINTS);
  const [orders, setOrders] = useState<EnterpriseOrder[]>([]);
  const [attestations, setAttestations] = useState<BankAttestationProof[]>([]);
  const [snapshot, setSnapshot] = useState<AvaxTreasurySnapshot | null>(null);
  const [guarantees, setGuarantees] = useState<GuaranteeCertificate[]>([]);
  const [auditLogs, setAuditLogs] = useState<PolicyAuditLogEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [railsRes, entRes, ordRes, treasRes, guarRes] = await Promise.all([
        fetch("/api/bank/rails", { cache: "no-store" }),
        fetch("/api/enterprises", { cache: "no-store" }),
        fetch("/api/orders", { cache: "no-store" }),
        fetch("/api/treasury/status", { cache: "no-store" }),
        fetch("/api/guarantees", { cache: "no-store" }),
      ]);
      if (railsRes.ok) {
        const r = (await railsRes.json()) as { bankRails: BankPartnerRail[]; supportedBanks: SupportedVnBank[]; webhookEndpoints?: typeof DEFAULT_ENDPOINTS };
        setBankRails(r.bankRails); setSupportedBanks(r.supportedBanks);
        if (r.webhookEndpoints) setWebhookEndpoints(r.webhookEndpoints);
      }
      if (entRes.ok) setEnterprises(((await entRes.json()) as { enterprises: VerifiedEnterpriseProfile[] }).enterprises);
      if (ordRes.ok) {
        const o = (await ordRes.json()) as { orders: EnterpriseOrder[]; bankAttestations: BankAttestationProof[] };
        setOrders(o.orders); setAttestations(o.bankAttestations);
      }
      if (treasRes.ok) {
        const t = (await treasRes.json()) as { snapshot?: AvaxTreasurySnapshot };
        if (t.snapshot) setSnapshot(t.snapshot);
      }
      if (guarRes.ok) {
        const g = (await guarRes.json()) as { guarantees: GuaranteeCertificate[]; auditLogs: PolicyAuditLogEntry[] };
        setGuarantees(g.guarantees); setAuditLogs(g.auditLogs);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (roleSession?.role === "BANK") void loadData();
  }, [loadData, roleSession?.role]);

  if (authLoading) {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-6xl items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="ox-card flex w-full max-w-md items-center justify-center gap-3 rounded-2xl px-6 py-8 text-sm font-medium text-[var(--ox-muted)]">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--ox-avax)]" /><span>Đang kiểm tra kết nối ví Ngân hàng...</span>
        </div>
      </div>
    );
  }
  if (!roleSession || roleSession.role !== "BANK") return <RoleLoginGateway defaultRole="BANK" />;

  const gatewayAddress = snapshot?.contracts?.bankGateway || bankRails[0]?.gatewayContractAddress || FALLBACK_BANK_GATEWAY;
  const isLiveBank = activeProfile.railMode === "LIVE_BANK";
  const posNeedle = roleSession.rolePositionId?.trim().toLowerCase();
  const primaryRail = (posNeedle ? bankRails.find((r) => r.id.toLowerCase() === posNeedle || r.bankBin.toLowerCase() === posNeedle) : undefined) ?? bankRails[0];
  const activeRails = bankRails.filter((r) => r.active).length;

  return (
    <div className="mx-auto max-w-6xl space-y-7 px-4 py-5 sm:space-y-8 sm:px-6 lg:px-8 lg:py-7">
      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <BrandOrb seed={primaryRail?.id || primaryRail?.shortName || "napas-247"} label={primaryRail?.shortName || "OpalX Bank"} size={42} />
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold ${isLiveBank ? "bg-[var(--ox-ok-tint)] text-[var(--ox-ok-ink)]" : "bg-[var(--ox-warn-tint)] text-[var(--ox-warn-ink)]"}`}>
                  <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                    <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${isLiveBank ? "bg-emerald-400" : "bg-amber-400"}`} />
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${isLiveBank ? "bg-emerald-500" : "bg-amber-500"}`} />
                  </span>
                  <span>{activeProfile.badgeLabel}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ox-soft)] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--ox-ink)] tabular-nums">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                  <span>Fuji 43113{snapshot?.liveFujiBlockNumber ? ` · #${snapshot.liveFujiBlockNumber.toLocaleString("en-US")}` : ""}</span>
                </span>
              </div>
              <h1 className="text-xl font-bold tracking-tight text-[var(--ox-ink)] sm:text-2xl">
                OpalX Bank — Mạng Lưới Ngân Hàng VietQR &amp; Đối Soát Quỹ
              </h1>
              <p className="max-w-3xl text-sm text-[var(--ox-muted)]">
                {bankRails.length || 6} ngân hàng tại Việt Nam kết nối qua NAPAS 247 &amp;{" "}
                <span className="font-mono font-semibold text-[var(--ox-ink)]">BankGateway ({truncateHex(gatewayAddress, 4)})</span> trên Avalanche Fuji.
              </p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void loadData()} disabled={refreshing} className="ox-btn-ghost inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold disabled:opacity-60">
              <RefreshCw className={`h-3.5 w-3.5 text-[var(--ox-avax)] ${refreshing ? "animate-spin" : ""}`} /><span>Làm mới</span>
            </button>
            <a href={`https://testnet.snowtrace.io/address/${gatewayAddress}`} target="_blank" rel="noreferrer" className="ox-btn-ghost inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3 py-1.5 font-mono text-xs font-semibold">
              <Landmark className="h-3.5 w-3.5 text-[var(--ox-info-ink)]" /><span>BankGateway: {truncateHex(gatewayAddress, 4)}</span><ExternalLink className="h-3 w-3 text-[var(--ox-muted)]" />
            </a>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 font-mono tabular-nums sm:grid-cols-4">
          {[
            { label: "Rails hoạt động", value: `${activeRails}/${bankRails.length || 6}` },
            { label: "Báo có NAPAS", value: String(attestations.length) },
            { label: "Chứng thư Fuji", value: String(guarantees.length) },
            { label: "Relayer / Kênh", value: primaryRail ? `${primaryRail.shortName} · ${primaryRail.webhookProvider}` : "NAPAS 247" },
          ].map((tile) => (
            <div key={tile.label} className="rounded-2xl bg-[var(--ox-soft)] px-3.5 py-2.5">
              <div className="truncate text-sm font-bold text-[var(--ox-ink)]">{tile.value}</div>
              <div className="text-[11px] text-[var(--ox-muted)]">{tile.label}</div>
            </div>
          ))}
        </div>
      </header>

      <section id="rails" className="scroll-mt-20">
        <BankPartnerRailManager bankRails={bankRails} supportedBanks={supportedBanks} enterprises={enterprises} webhookEndpoints={webhookEndpoints} positionedRailId={roleSession.rolePositionId} onUpdated={loadData} />
      </section>

      <section id="attestations" className="scroll-mt-20 space-y-4">
        <BankAttestationTable attestations={attestations} />
        <details className="ox-card group rounded-2xl p-4 sm:p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-bold text-[var(--ox-ink)] sm:text-sm">
            <span className="flex flex-wrap items-center gap-2">
              <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${isLiveBank ? "bg-emerald-400" : "bg-amber-400"}`} />
                <span className={`relative inline-flex h-2 w-2 rounded-full ${isLiveBank ? "bg-emerald-500" : "bg-amber-500"}`} />
              </span>
              <span>Bank Settlement Console · {activeProfile.badgeLabel}</span>
              <span className="font-mono text-[11px] font-normal text-[var(--ox-muted)] tabular-nums">({orders.length} đơn)</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ox-muted)] transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-4 border-t border-[var(--ox-line)] pt-4"><BankSettlementConsole orders={orders} onCompleted={loadData} /></div>
        </details>
      </section>

      <section id="vault" className="scroll-mt-20 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-[var(--ox-ink)] sm:text-lg">Quản Trị Quỹ Bảo Chứng Avalanche Fuji &amp; Kill Switch</h2>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ox-soft)] px-3 py-1 font-mono text-xs font-semibold text-[var(--ox-ink)] tabular-nums">
            <span className={`h-2 w-2 rounded-full ${snapshot?.vaultPaused ? "bg-[var(--ox-avax)]" : "animate-pulse bg-emerald-500"}`} aria-hidden="true" />
            <span>Fuji Testnet · 43113 · 100% AVAX</span>
          </span>
        </div>
        <div className="grid gap-5 lg:grid-cols-[1.4fr_0.85fr]">
          <AvaxTreasuryCard snapshot={snapshot} guarantees={guarantees} onSettled={loadData} />
          <EmergencyPauseCard paused={Boolean(snapshot?.vaultPaused)} onUpdated={loadData} />
        </div>
        <ContractAddressesBar snapshot={snapshot} />
        <PolicyAuditTable guarantees={guarantees} auditLogs={auditLogs} />
      </section>
    </div>
  );
}
