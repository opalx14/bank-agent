"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, ClipboardList, ExternalLink, Landmark, LayoutDashboard, Loader2, Package, PackageCheck, Settings, Sparkles, TrendingUp, X } from "lucide-react";
import type { BankPartnerRail, EnterpriseOrder, VerifiedEnterpriseProfile } from "@/types";
import { RoleLoginGateway } from "@/components/auth/RoleLoginGateway";
import { useWalletAuth } from "@/components/auth/WalletAuthProvider";
import { BrandOrb } from "@/components/shared/BrandOrb";
import { OpalxGuaranteePass } from "@/components/shared/OpalxGuaranteePass";
import { CountUpValue } from "@/components/shared/ui-kit";
import { formatVnd, truncateHex } from "@/components/shared/formatters";
import { EnterpriseBankLinkCard } from "./EnterpriseBankLinkCard";
import { EnterpriseKybModal } from "./EnterpriseKybModal";
import { EnterpriseOrderList } from "./EnterpriseOrderList";
import { EnterprisePackageManager } from "./EnterprisePackageManager";
import { EnterpriseProfileCard } from "./EnterpriseProfileCard";

export type EnterpriseSection = "OVERVIEW" | "PACKAGES" | "ORDERS" | "BANK" | "PROFILE";

const SIDEBAR_ITEMS: ReadonlyArray<{ id: EnterpriseSection; label: string; icon: typeof LayoutDashboard }> = [
  { id: "OVERVIEW", label: "Overview", icon: LayoutDashboard },
  { id: "PACKAGES", label: "Packages & Services", icon: Package },
  { id: "ORDERS", label: "Orders", icon: ClipboardList },
  { id: "BANK", label: "Bank & VietQR", icon: Landmark },
  { id: "PROFILE", label: "Enterprise Profile", icon: Settings },
];

const HASH_SECTION_MAP: Record<string, EnterpriseSection> = {
  overview: "OVERVIEW", packages: "PACKAGES", orders: "ORDERS", bank: "BANK", profile: "PROFILE", kyb: "PROFILE",
};

export function EnterpriseGatewayView() {
  const { roleSession, loading: authLoading } = useWalletAuth();
  const [enterprises, setEnterprises] = useState<VerifiedEnterpriseProfile[]>([]);
  const [activeBanks, setActiveBanks] = useState<BankPartnerRail[]>([]);
  const [orders, setOrders] = useState<EnterpriseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<EnterpriseSection>("OVERVIEW");
  const [justCreatedContract, setJustCreatedContract] = useState<VerifiedEnterpriseProfile | null>(null);

  const loadData = useCallback(async () => {
    setErrorMsg(null);
    try {
      const [entRes, ordRes] = await Promise.all([fetch("/api/enterprises", { cache: "no-store" }), fetch("/api/orders", { cache: "no-store" })]);
      if (!entRes.ok) throw new Error(`Failed to load enterprises (${entRes.status})`);
      const entJson = (await entRes.json()) as { enterprises: VerifiedEnterpriseProfile[]; activeBanks: BankPartnerRail[] };
      setEnterprises(entJson.enterprises);
      setActiveBanks(entJson.activeBanks);
      if (ordRes.ok) setOrders(((await ordRes.json()) as { orders: EnterpriseOrder[] }).orders);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load Enterprise Portal data.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const syncFromHash = () => {
      const next = HASH_SECTION_MAP[window.location.hash.replace(/^#/, "").trim().toLowerCase()];
      if (next) setActiveSection(next);
    };
    const onSectionEvent = (e: Event) => {
      const detail = (e as CustomEvent<EnterpriseSection>).detail;
      if (detail) setActiveSection(detail);
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    window.addEventListener("opalx:enterprise-section", onSectionEvent);
    return () => {
      window.removeEventListener("hashchange", syncFromHash);
      window.removeEventListener("opalx:enterprise-section", onSectionEvent);
    };
  }, []);

  useEffect(() => {
    setJustCreatedContract(null);
    if (roleSession?.role !== "ENTERPRISE") return;
    setLoading(true);
    void loadData();
  }, [roleSession?.role, roleSession?.email, roleSession?.walletAddress, roleSession?.rolePositionId, loadData]);

  const myEnt = useMemo(() => {
    if (!roleSession) return null;
    const pos = roleSession.rolePositionId?.trim();
    if (pos && pos !== "new") {
      const byPos = enterprises.find((e) => e.id.toLowerCase() === pos.toLowerCase());
      if (byPos) return byPos;
    }
    const email = roleSession.email.trim().toLowerCase();
    const wallet = roleSession.walletAddress.toLowerCase();
    return enterprises.find((e) => e.ownerEmail?.trim().toLowerCase() === email || e.ownerWalletAddress.toLowerCase() === wallet) ?? null;
  }, [enterprises, roleSession]);

  const enterpriseOrders = useMemo(() => {
    if (!myEnt) return [];
    const targetId = myEnt.id.toLowerCase();
    return orders.filter((o) => o.enterpriseId?.toLowerCase() === targetId || o.sellerTaxId === myEnt.taxId);
  }, [orders, myEnt]);

  const kpiStats = useMemo(() => {
    const activePackages = myEnt ? myEnt.packages.filter((p) => p.active).length : 0;
    const guaranteed = enterpriseOrders.filter((o) => o.status === "GUARANTEED");
    return {
      activePackages, totalPackages: myEnt?.packages.length ?? 0,
      guaranteedCount: guaranteed.length, totalOrders: enterpriseOrders.length,
      guaranteedRevenueVnd: guaranteed.reduce((sum, o) => sum + o.amountVnd, 0),
    };
  }, [myEnt, enterpriseOrders]);

  const selectSection = useCallback((id: EnterpriseSection) => {
    setActiveSection(id);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${id.toLowerCase()}`);
      window.dispatchEvent(new CustomEvent("opalx:enterprise-section", { detail: id }));
    }
  }, []);

  const handleCreated = async (created: VerifiedEnterpriseProfile) => {
    setEnterprises((prev) => (prev.some((e) => e.id === created.id) ? prev : [created, ...prev]));
    setJustCreatedContract(created);
    selectSection("PACKAGES");
    await loadData();
  };

  if (!authLoading && (!roleSession || roleSession.role !== "ENTERPRISE")) return <RoleLoginGateway defaultRole="ENTERPRISE" />;
  if (authLoading || loading) return (
    <div className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center px-4 py-10">
      <div className="ox-card flex items-center gap-2.5 rounded-2xl px-6 py-5 text-sm text-[var(--ox-muted)]">
        <Loader2 className="h-4 w-4 animate-spin text-[var(--ox-ok)]" />
        <span>{authLoading ? "Loading Enterprise workspace..." : "Syncing enterprise profile..."}</span>
      </div>
    </div>
  );
  if (!myEnt) return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6 lg:py-8">
      <div className="ox-card flex items-center gap-3 rounded-2xl p-5">
        <span className="ox-badge-verified flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"><Building2 className="h-5 w-5" /></span>
        <div>
          <h1 className="text-base font-bold text-[var(--ox-ink)]">Register Enterprise Profile</h1>
          <p className="text-xs text-[var(--ox-muted)]">Account <span className="font-medium text-[var(--ox-ink)]">{roleSession?.email}</span> has no profile yet. Complete below to publish packages &amp; accept VietQR.</p>
        </div>
      </div>
      {errorMsg && <div role="alert" className="ox-badge-avax flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-medium"><AlertTriangle className="h-4 w-4 shrink-0" /><span>{errorMsg}</span></div>}
      <EnterpriseKybModal open inline activeBanks={activeBanks} onClose={() => undefined} onCreated={handleCreated} />
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <aside className="ox-card w-full min-w-0 shrink-0 rounded-2xl p-4 lg:sticky lg:top-24 lg:w-64">
          <div className="flex items-center gap-3 border-b border-[var(--ox-line)] pb-3.5">
            <BrandOrb seed={myEnt.id || myEnt.enterpriseName || "opalx"} label={myEnt.enterpriseName || "Enterprise"} logoUrl={myEnt.logoImageUrl} size={38} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[var(--ox-ink)]">{myEnt.enterpriseName}</p>
              <p className="truncate text-[11px] text-[var(--ox-muted)]">{myEnt.categoryLabel}</p>
            </div>
          </div>
          <nav aria-label="Enterprise navigation" className="no-scrollbar mt-3 flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {SIDEBAR_ITEMS.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" onClick={() => selectSection(id)} className={`ox-press flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium transition-all lg:w-full ${activeSection === id ? "ox-pill-active font-semibold" : "text-[var(--ox-muted)] hover:bg-[var(--ox-soft)] hover:text-[var(--ox-ink)]"}`}>
                <Icon className="h-4 w-4 shrink-0" /><span className="whitespace-nowrap">{label}</span>
              </button>
            ))}
          </nav>
          <div className="mt-3.5 border-t border-[var(--ox-line)] pt-3">
            <Link href={`/?enterprise=${encodeURIComponent(myEnt.id)}&preview=1`} className="ox-btn-ghost flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold"><span>Preview storefront</span><ExternalLink className="h-3.5 w-3.5" /></Link>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-5">
          {justCreatedContract && (
            <section role="status" className="ox-badge-verified flex items-start justify-between gap-3 rounded-2xl p-4">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold"><Sparkles className="h-3.5 w-3.5" /><span>Enterprise Created</span></span>
                <p className="text-sm font-semibold text-[var(--ox-ink)]">{justCreatedContract.enterpriseName} is ready to publish packages &amp; accept VietQR.</p>
                <p className="font-mono text-[11px] text-[var(--ox-muted)]">Smart Contract: {truncateHex(justCreatedContract.merchantContractAddress, 6)}</p>
              </div>
              <button type="button" onClick={() => setJustCreatedContract(null)} aria-label="Dismiss notice" className="rounded-lg p-1 text-[var(--ox-muted)] hover:text-[var(--ox-ink)]"><X className="h-4 w-4" /></button>
            </section>
          )}
          {errorMsg && <div role="alert" className="ox-badge-avax flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-medium"><AlertTriangle className="h-4 w-4 shrink-0" /><span>{errorMsg}</span></div>}

          {activeSection === "OVERVIEW" && (
            <div className="space-y-5">
              <div><h1 className="text-lg font-bold text-[var(--ox-ink)] sm:text-xl">Overview</h1><p className="mt-0.5 text-xs text-[var(--ox-muted)]">Guaranteed revenue, packages, and orders for {myEnt.enterpriseName}.</p></div>
              <div className="grid gap-4 xl:grid-cols-[340px_1fr] xl:items-center">
                <OpalxGuaranteePass variant="crimson" solidState statusLabel="MERCHANT CONTRACT" enterpriseName={myEnt.enterpriseName} packageName={myEnt.categoryLabel} guaranteeId={truncateHex(myEnt.merchantContractAddress, 4)} holderLabel={myEnt.accountName} bankLabel={`${myEnt.bankShortName} · ${myEnt.accountNo}`} txRef={myEnt.kybCommitmentHash ?? myEnt.merchantContractAddress} className="mx-auto xl:mx-0" />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
                  {[
                    { label: "Guaranteed Revenue", val: kpiStats.guaranteedRevenueVnd, fmt: formatVnd, cls: "text-[var(--ox-ok-ink)]", sub: `${kpiStats.guaranteedCount} / ${kpiStats.totalOrders} orders guaranteed`, Icon: TrendingUp, iconCls: "text-[var(--ox-ok-ink)]" },
                    { label: "Active Packages", val: kpiStats.activePackages, suffix: ` / ${kpiStats.totalPackages} pkgs`, cls: "text-[var(--ox-ink)]", sub: "Manage & add packages →", action: () => selectSection("PACKAGES"), Icon: PackageCheck, iconCls: "text-[var(--ox-info-ink)]" },
                    { label: "Orders & VietQR", val: kpiStats.totalOrders, suffix: " orders", cls: "text-[var(--ox-ink)]", sub: `${myEnt.bankShortName} · ${myEnt.accountNo}`, Icon: ClipboardList, iconCls: "text-[var(--ox-avax)]" },
                  ].map((k) => (
                    <div key={k.label} className="ox-card flex items-center justify-between gap-3 rounded-2xl p-4">
                      <div className="min-w-0">
                        <p className="text-xs text-[var(--ox-muted)]">{k.label}</p>
                        <p className={`mt-1 font-mono text-lg font-bold ${k.cls}`}><CountUpValue value={k.val} format={k.fmt} />{k.suffix && <span className="text-xs font-normal text-[var(--ox-muted)]">{k.suffix}</span>}</p>
                        {k.action ? <button type="button" onClick={k.action} className="text-[11px] font-semibold text-[var(--ox-ok-ink)] hover:underline">{k.sub}</button> : <p className="truncate text-[11px] text-[var(--ox-muted)] tabular-nums">{k.sub}</p>}
                      </div>
                      <k.Icon className={`h-5 w-5 shrink-0 ${k.iconCls}`} />
                    </div>
                  ))}
                </div>
              </div>
              <EnterpriseOrderList orders={enterpriseOrders.slice(0, 5)} onSelectOrder={() => undefined} variant="card" />
            </div>
          )}

          {activeSection === "PACKAGES" && <EnterprisePackageManager enterprise={myEnt} onUpdated={loadData} />}
          {activeSection === "ORDERS" && <EnterpriseOrderList orders={enterpriseOrders} onSelectOrder={() => undefined} variant="card" />}
          {activeSection === "BANK" && <EnterpriseBankLinkCard enterprise={myEnt} activeBanks={activeBanks} onUpdated={loadData} />}
          {activeSection === "PROFILE" && <EnterpriseProfileCard enterprise={myEnt} onUpdated={loadData} />}
        </main>
      </div>
    </div>
  );
}