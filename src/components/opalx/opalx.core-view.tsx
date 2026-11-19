"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, FileCheck2, Loader2, RefreshCw, ScanLine, ShoppingBag, Store, Wallet } from "lucide-react";
import type { GuaranteeCertificate } from "@/types";
import { RoleLoginGateway } from "@/components/auth/auth.role-login-gateway";
import { useWalletAuth } from "@/components/auth/auth.wallet-provider";
import { SegmentedTabs } from "@/components/shared/shared.ui-kit";
import { AvalancheTechVerifier } from "./opalx.avalanche-verifier";
import { CustomerPackageCheckout } from "./opalx.customer-checkout";
import { GuaranteeCategoryVault } from "./opalx.guarantee-vault";

type PortalTab = "CHECKOUT" | "VAULT" | "FUJI";
const TAB_TITLES: Record<PortalTab, string> = {
  CHECKOUT: "Buy Passes & Pay", VAULT: "My Guarantee Passes", FUJI: "Fuji Infrastructure",
};

function OpalxSearchSync({ onSync }: { onSync: () => void }) {
  const sp = useSearchParams();
  useEffect(() => { onSync(); }, [sp, onSync]);
  return null;
}

export function OpalxCoreView() {
  const pathname = usePathname();
  const router = useRouter();
  const { session, roleSession, loading: authLoading } = useWalletAuth();
  const activeSession = roleSession ?? session;
  const [guarantees, setGuarantees] = useState<GuaranteeCertificate[]>([]);
  const [activeTab, setActiveTab] = useState<PortalTab>("CHECKOUT");
  const [urlEnterpriseId, setUrlEnterpriseId] = useState<string | undefined>(undefined);
  const [isPreview, setIsPreview] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [highlightedGuaranteeId, setHighlightedGuaranteeId] = useState<string | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  const syncFromUrl = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    setUrlEnterpriseId(params.get("enterprise") || undefined);
    setIsPreview(params.get("preview") === "1");
    setIsGuest(params.get("guest") === "1");
    const tab = params.get("tab")?.toLowerCase();
    setActiveTab(tab === "vault" ? "VAULT" : tab === "fuji" ? "FUJI" : "CHECKOUT");
    setInitialized(true);
  }, []);

  useEffect(() => {
    const onTabEvent = (e: Event) => {
      const detail = (e as CustomEvent<PortalTab>).detail;
      if (detail === "VAULT" || detail === "CHECKOUT" || detail === "FUJI") setActiveTab(detail);
    };
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    window.addEventListener("opalx:tab", onTabEvent);
    return () => {
      window.removeEventListener("popstate", syncFromUrl);
      window.removeEventListener("opalx:tab", onTabEvent);
    };
  }, [pathname, syncFromUrl]);

  useEffect(() => {
    if (!initialized || authLoading) return;
    if (roleSession?.role === "ENTERPRISE" && !isPreview) router.replace("/enterprise");
    else if (roleSession?.role === "BANK") router.replace("/bank");
    else if (!roleSession && !isGuest && !urlEnterpriseId && activeTab === "VAULT") setActiveTab("CHECKOUT");
  }, [initialized, authLoading, roleSession, isPreview, isGuest, urlEnterpriseId, activeTab, router]);

  const loadAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/guarantees", { cache: "no-store" });
      if (res.ok) setGuarantees(((await res.json()) as { guarantees?: GuaranteeCertificate[] }).guarantees ?? []);
    } finally { setRefreshing(false); }
  }, []);

  useEffect(() => {
    if (initialized && !authLoading && (roleSession?.role === "CUSTOMER" || activeTab === "VAULT")) void loadAll();
  }, [initialized, authLoading, roleSession?.role, activeTab, loadAll]);

  const selectTab = (tabId: PortalTab) => {
    setActiveTab(tabId);
    window.dispatchEvent(new CustomEvent("opalx:tab", { detail: tabId }));
    if (pathname === "/opalx" || pathname === "/") {
      const params = new URLSearchParams(window.location.search);
      if (tabId === "VAULT") params.set("tab", "vault");
      else if (tabId === "FUJI") params.set("tab", "fuji");
      else params.delete("tab");
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    }
  };

  const handleOpenVault = (guaranteeId?: string) => {
    if (guaranteeId) setHighlightedGuaranteeId(guaranteeId);
    void loadAll();
    selectTab("VAULT");
  };

  const handleGuaranteeUpdated = (updated: GuaranteeCertificate) => {
    setGuarantees((prev) => prev.map((g) => (g.guaranteeId === updated.guaranteeId ? updated : g)));
  };

  const isRedirecting = !initialized || authLoading || (roleSession?.role === "ENTERPRISE" && !isPreview) || roleSession?.role === "BANK";
  const myEmail = activeSession?.email?.trim().toLowerCase();
  const myGuaranteesCount = myEmail ? guarantees.filter((g) => g.buyerEmail?.trim().toLowerCase() === myEmail).length : undefined;
  const lockedEntId = urlEnterpriseId ?? roleSession?.rolePositionId;

  return (
    <>
      <Suspense fallback={null}><OpalxSearchSync onSync={syncFromUrl} /></Suspense>
      {isRedirecting ? (
        <div className="mx-auto flex min-h-[55vh] max-w-6xl items-center justify-center px-4 py-10">
          <div className="ox-card flex items-center gap-2.5 rounded-2xl px-6 py-5 text-sm text-[var(--ox-muted)]">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--ox-ok)]" /><span>Preparing your workspace...</span>
          </div>
        </div>
      ) : roleSession?.role === "ENTERPRISE" && isPreview ? (
        <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <header className="ox-card flex flex-col justify-between gap-3 rounded-3xl p-4 sm:flex-row sm:items-center sm:p-5">
            <div className="flex items-center gap-2.5">
              <span className="ox-badge-verified flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"><Store className="h-4 w-4" /></span>
              <p className="text-xs font-medium text-[var(--ox-ink)] sm:text-sm">Previewing customer checkout (showing only your enterprise&apos;s packages).</p>
            </div>
            <Link href="/enterprise" className="ox-btn-primary inline-flex min-h-[38px] shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold">
              <ArrowLeft className="h-3.5 w-3.5" /><span>Back to Enterprise Studio</span>
            </Link>
          </header>
          <CustomerPackageCheckout lockedEnterpriseId={lockedEntId} onGuaranteeIssued={loadAll} />
        </div>
      ) : !roleSession && !isGuest && !urlEnterpriseId && activeTab !== "FUJI" ? (
        <RoleLoginGateway defaultRole="CUSTOMER" />
      ) : (
        <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <header className="ox-card flex flex-col gap-3.5 rounded-3xl p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <h1 className="min-w-0 truncate text-xl font-bold tracking-tight text-[var(--ox-ink)] sm:text-2xl">{TAB_TITLES[activeTab]}</h1>
            <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:flex-nowrap">
            <div className="min-w-0 flex-1 lg:flex-initial">
              <SegmentedTabs
                ariaLabel="Switch between Buy Passes and My Passes"
                value={activeTab === "FUJI" ? "CHECKOUT" : activeTab}
                onChange={selectTab}
                className="w-full sm:min-w-[280px]"
                items={[
                  { key: "CHECKOUT", label: "Buy Passes", icon: <ShoppingBag className="h-3.5 w-3.5 shrink-0" /> },
                  { key: "VAULT", label: "My Passes", icon: <FileCheck2 className="h-3.5 w-3.5 shrink-0" />, ...(roleSession?.role === "CUSTOMER" ? { badge: myGuaranteesCount ?? 0 } : {}) },
                ]}
              />
            </div>
            <Link href="/scan" className="ox-btn-ghost ox-press hidden min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold sm:inline-flex">
              <ScanLine className="h-3.5 w-3.5 text-[var(--ox-ok-ink)]" /><span>Scan QR</span>
            </Link>
              {activeTab === "VAULT" && (
                <button type="button" onClick={() => void loadAll()} disabled={refreshing} aria-label="Refresh passes" className="ox-btn-ghost ox-press inline-flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full disabled:opacity-60">
                  <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                </button>
              )}
            </div>
          </header>

          {activeTab === "CHECKOUT" && <CustomerPackageCheckout initialEnterpriseId={urlEnterpriseId} onGuaranteeIssued={loadAll} onOpenVault={handleOpenVault} />}

          {activeTab === "VAULT" &&
            (activeSession ? (
              <GuaranteeCategoryVault guarantees={guarantees} userEmail={activeSession.email} highlightedGuaranteeId={highlightedGuaranteeId} onGuaranteeUpdated={handleGuaranteeUpdated} onSwitchToCheckout={() => selectTab("CHECKOUT")} />
            ) : (
              <div className="ox-card rounded-3xl px-6 py-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--ox-line)] bg-[var(--ox-soft)] text-[var(--ox-ink)]"><Wallet className="h-5 w-5" /></div>
                <h2 className="mt-4 text-base font-bold text-[var(--ox-ink)]">Sign in with Wallet to view your guarantee passes</h2>
                <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("opalx:open-login", { detail: { defaultLayout: "CUSTOMER" } }))} className="ox-btn-primary mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-5 py-2 text-xs">
                  <Wallet className="h-3.5 w-3.5" /><span>Sign in with Wallet</span>
                </button>
              </div>
            ))}

          {activeTab === "FUJI" && <AvalancheTechVerifier defaultOpen />}
        </div>
      )}
    </>
  );
}