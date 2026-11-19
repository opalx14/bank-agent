"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ClipboardList, FileCheck2, Landmark, Layers, LayoutDashboard, QrCode, Settings, ShieldCheck, ShoppingBag,
} from "lucide-react";
import { useWalletAuth } from "@/components/auth/auth.wallet-provider";

type EnterpriseSection = "OVERVIEW" | "PACKAGES" | "ORDERS" | "BANK" | "PROFILE";

const ENTERPRISE_TABS = [
  { section: "OVERVIEW" as const, hash: "#overview", label: "Overview", icon: LayoutDashboard },
  { section: "PACKAGES" as const, hash: "#packages", label: "Packages", icon: Layers },
  { section: "ORDERS" as const, hash: "#orders", label: "Orders", icon: ClipboardList },
  { section: "BANK" as const, hash: "#bank", label: "Bank", icon: Landmark },
  { section: "PROFILE" as const, hash: "#profile", label: "Profile", icon: Settings },
];

const BANK_TABS = [
  { href: "/bank#rails", hash: "#rails", label: "Bank Rails", icon: Landmark },
  { href: "/bank#attestations", hash: "#attestations", label: "Audits", icon: FileCheck2 },
  { href: "/bank#vault", hash: "#vault", label: "PolicyVault", icon: ShieldCheck },
] as const;

const HASH_TO_SECTION: Record<string, EnterpriseSection> = {
  "#overview": "OVERVIEW", "#packages": "PACKAGES", "#orders": "ORDERS", "#bank": "BANK", "#profile": "PROFILE", "#kyb": "PROFILE",
};

function MobileSearchSync({ onSync }: { onSync: () => void }) {
  const sp = useSearchParams();
  useEffect(() => { onSync(); }, [sp, onSync]);
  return null;
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const { roleSession } = useWalletAuth();
  const [isVaultTab, setIsVaultTab] = useState(false);
  const [hasGuestCheckout, setHasGuestCheckout] = useState(false);
  const [activeHash, setActiveHash] = useState("");
  const [entSection, setEntSection] = useState<EnterpriseSection>("OVERVIEW");

  const sync = useCallback(() => {
    const q = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    setIsVaultTab(q.get("tab") === "vault");
    setHasGuestCheckout(q.get("guest") === "1" || Boolean(q.get("enterprise")));
    setActiveHash(hash);
    if (HASH_TO_SECTION[hash]) setEntSection(HASH_TO_SECTION[hash]);
  }, []);

  useEffect(() => {
    const onTab = (e: Event) => setIsVaultTab((e as CustomEvent<string>).detail === "VAULT");
    const onEntSection = (e: Event) => {
      const next = (e as CustomEvent<EnterpriseSection>).detail;
      if (next) setEntSection(next);
    };
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    window.addEventListener("opalx:tab", onTab);
    window.addEventListener("opalx:enterprise-section", onEntSection);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("opalx:tab", onTab);
      window.removeEventListener("opalx:enterprise-section", onEntSection);
    };
  }, [pathname, sync]);

  const role = roleSession?.role;
  const isScan = pathname.startsWith("/scan");
  if (!role && !hasGuestCheckout && !isScan) return null;

  const isEnterpriseRoute = pathname.startsWith("/enterprise");
  const isBankRoute = pathname.startsWith("/bank");
  const isHome = pathname === "/" || pathname === "/opalx";

  const itemCls = (active: boolean, compact = false) =>
    `ox-press relative flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 ${compact ? "text-[10px]" : "text-[11px]"} transition-all ${
      active ? "ox-pill-active font-semibold" : "border border-transparent font-medium text-[var(--ox-muted)] hover:text-[var(--ox-ink)]"
    }`;

  const userTabs = [
    { href: role === "CUSTOMER" ? "/" : "/?guest=1", key: "checkout", label: "Buy Passes", icon: ShoppingBag, prominent: false },
    ...(role === "CUSTOMER" ? [{ href: "/?tab=vault", key: "vault", label: "My Passes", icon: FileCheck2, prominent: false }] : []),
    { href: "/scan", key: "scan", label: "Scan QR", icon: QrCode, prominent: true },
  ];

  return (
    <>
      <Suspense fallback={null}><MobileSearchSync onSync={sync} /></Suspense>
      <nav
        aria-label="Mobile navigation"
        className="ox-glass fixed inset-x-0 bottom-0 z-40 border-t border-[var(--ox-line)] px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden print:hidden"
      >
      {role === "ENTERPRISE" ? (
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
          {ENTERPRISE_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = isEnterpriseRoute && entSection === tab.section;
            const href = isEnterpriseRoute ? tab.hash : `/enterprise${tab.hash}`;
            return (
              <Link
                key={tab.section}
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  setEntSection(tab.section);
                  setActiveHash(tab.hash);
                  window.dispatchEvent(new CustomEvent("opalx:enterprise-section", { detail: tab.section }));
                }}
                className={itemCls(active, true)}
              >
                <Icon className="h-[17px] w-[17px]" />
                <span className="max-w-full truncate leading-none">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      ) : role === "BANK" ? (
        <div className="mx-auto grid max-w-md grid-cols-3 gap-1">
          {BANK_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = isBankRoute && (activeHash || "#rails") === tab.hash;
            return (
              <Link key={tab.href} href={tab.href} onClick={() => setActiveHash(tab.hash)} className={itemCls(active)}>
                <Icon className="h-[18px] w-[18px]" />
                <span className="max-w-full truncate leading-none">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className={`mx-auto grid max-w-md gap-1 ${userTabs.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
          {userTabs.map((tab) => {
            const Icon = tab.icon;
            const active = tab.key === "checkout" ? isHome && !isVaultTab : tab.key === "vault" ? isHome && isVaultTab : isScan;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={itemCls(active)}
                onClick={() => {
                  if (tab.key === "checkout" || tab.key === "vault") {
                    const vault = tab.key === "vault";
                    setIsVaultTab(vault);
                    window.dispatchEvent(new CustomEvent("opalx:tab", { detail: vault ? "VAULT" : "CHECKOUT" }));
                  }
                }}
              >
                {tab.prominent ? (
                  <span className={`flex h-6 w-9 items-center justify-center rounded-full shadow-xs ${active ? "bg-[var(--ox-avax)] text-white" : "bg-[var(--ox-avax-tint)] text-[var(--ox-avax-ink)]"}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                ) : (
                  <Icon className="h-[18px] w-[18px]" />
                )}
                <span className="max-w-full truncate leading-none">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </nav>
    </>
  );
}