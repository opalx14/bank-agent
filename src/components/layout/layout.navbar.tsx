"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Download, Wallet } from "lucide-react";
import { useWalletAuth } from "@/components/auth/auth.wallet-provider";
import { WalletLoginModal } from "@/components/auth/auth.wallet-login-modal";
import { BankAgentLogo } from "@/components/shared/shared.brand-logo";
import type { PortalRole } from "@/types";
import { useAccountMode } from "./layout.account-mode-provider";
import { AgentWalletPopover } from "./layout.agent-wallet-popover";
import { PwaInstallButton } from "./layout.pwa-install-button";
import { ThemeToggleButton } from "./layout.theme-provider";

type EnterpriseSection = "OVERVIEW" | "PACKAGES" | "ORDERS" | "BANK" | "PROFILE";

const ROLE_META: Record<PortalRole, { home: string; badge: string; cls: string }> = {
  CUSTOMER: { home: "/", badge: "Personal", cls: "ox-subcard text-[var(--ox-ink)]" },
  ENTERPRISE: { home: "/enterprise", badge: "Enterprise", cls: "ox-badge-verified" },
  BANK: { home: "/bank", badge: "Bank", cls: "ox-badge-avax" },
};

const ENTERPRISE_NAV: ReadonlyArray<{ href: string; label: string; ent: EnterpriseSection }> = [
  { href: "/enterprise#overview", label: "Overview", ent: "OVERVIEW" },
  { href: "/enterprise#packages", label: "Packages", ent: "PACKAGES" },
  { href: "/enterprise#orders", label: "Orders", ent: "ORDERS" },
  { href: "/enterprise#bank", label: "Bank & Settlement", ent: "BANK" },
  { href: "/enterprise#profile", label: "Profile", ent: "PROFILE" },
];

const BANK_NAV: ReadonlyArray<{ href: string; hash: string; label: string }> = [
  { href: "/bank#rails", hash: "#rails", label: "Bank Rails" },
  { href: "/bank#attestations", hash: "#attestations", label: "NAPAS Audits" },
  { href: "/bank#vault", hash: "#vault", label: "PolicyVault" },
];

const HASH_TO_ENT: Record<string, EnterpriseSection> = {
  "#overview": "OVERVIEW", "#packages": "PACKAGES", "#orders": "ORDERS", "#bank": "BANK", "#profile": "PROFILE", "#kyb": "PROFILE",
};

function NavSearchSync({ onSync }: { onSync: () => void }) {
  const sp = useSearchParams();
  useEffect(() => { onSync(); }, [sp, onSync]);
  return null;
}

export function AppNavbar() {
  const pathname = usePathname();
  const { session, roleSession } = useWalletAuth();
  const { activeKind, setActiveKind } = useAccountMode();
  const [showApkUpgrade, setShowApkUpgrade] = useState(false);
  const [isVaultTab, setIsVaultTab] = useState(false);
  const [hasGuestCheckoutQuery, setHasGuestCheckoutQuery] = useState(false);
  const [entSection, setEntSection] = useState<EnterpriseSection>("OVERVIEW");
  const [bankHash, setBankHash] = useState("#rails");
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginDefaultLayout, setLoginDefaultLayout] = useState<PortalRole>("CUSTOMER");

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.userAgent.includes("OpalXGoAndroid/1.0")) setShowApkUpgrade(true);
  }, []);

  const sync = useCallback(() => {
    const q = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    setIsVaultTab(q.get("tab") === "vault");
    setHasGuestCheckoutQuery(q.get("guest") === "1" || Boolean(q.get("enterprise")));
    if (HASH_TO_ENT[hash]) setEntSection(HASH_TO_ENT[hash]);
    if (hash === "#rails" || hash === "#attestations" || hash === "#vault") setBankHash(hash);
  }, []);

  useEffect(() => {
    const onTab = (e: Event) => setIsVaultTab((e as CustomEvent<string>).detail === "VAULT");
    const onEnt = (e: Event) => { const next = (e as CustomEvent<EnterpriseSection>).detail; if (next) setEntSection(next); };
    const onOpenLogin = (e: Event) => {
      const detail = (e as CustomEvent<{ defaultLayout?: PortalRole }>).detail;
      setLoginDefaultLayout(detail?.defaultLayout ?? "CUSTOMER");
      setLoginOpen(true);
    };
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    window.addEventListener("opalx:tab", onTab);
    window.addEventListener("opalx:enterprise-section", onEnt);
    window.addEventListener("opalx:open-login", onOpenLogin);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("opalx:tab", onTab);
      window.removeEventListener("opalx:enterprise-section", onEnt);
      window.removeEventListener("opalx:open-login", onOpenLogin);
    };
  }, [pathname, sync]);

  const role = roleSession?.role;
  const roleMeta = role ? ROLE_META[role] : null;
  const isHomeRoute = pathname === "/" || pathname === "/opalx";
  const isLiveBank = activeKind === "LIVE_DIRECT_ACCOUNT";
  const showUserNav = role === "CUSTOMER" || (!role && (hasGuestCheckoutQuery || pathname.startsWith("/scan")));

  type NavItem = { href: string; label: string; active: boolean; tab?: "CHECKOUT" | "VAULT"; ent?: EnterpriseSection; hash?: string };
  const navItems: NavItem[] =
    role === "ENTERPRISE"
      ? ENTERPRISE_NAV.map((i) => ({ ...i, active: pathname.startsWith("/enterprise") && entSection === i.ent }))
      : role === "BANK"
        ? BANK_NAV.map((i) => ({ href: i.href, hash: i.hash, label: i.label, active: pathname.startsWith("/bank") && bankHash === i.hash }))
        : showUserNav
          ? [
              { href: role === "CUSTOMER" ? "/" : "/?guest=1", label: "Buy Passes", active: isHomeRoute && !isVaultTab, tab: "CHECKOUT" },
              ...(role === "CUSTOMER" ? [{ href: "/?tab=vault", label: "My Passes", active: isHomeRoute && isVaultTab, tab: "VAULT" as const }] : []),
              { href: "/scan", label: "Scan QR", active: pathname.startsWith("/scan") },
            ]
          : [];

  const pillCls = (active: boolean) =>
    `whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition-all ${
      active ? "ox-pill-active font-semibold" : "border border-transparent font-medium text-[var(--ox-muted)] hover:bg-[var(--ox-surface)] hover:text-[var(--ox-ink)]"
    }`;

  return (
    <>
      <Suspense fallback={null}><NavSearchSync onSync={sync} /></Suspense>
      <header className="ox-glass sticky top-0 z-40 border-b border-[var(--ox-line)] print:hidden">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-3 sm:gap-3 sm:px-6 lg:px-8">
          <Link href={roleMeta ? roleMeta.home : "/"} aria-label="Bank Agent — OpalX GO" className="flex shrink-0 items-center gap-2.5">
            <span className="inline-flex shrink-0 sm:hidden">
              <BankAgentLogo variant="mark" className="h-9 w-9" priority />
            </span>
            <span className="hidden shrink-0 sm:inline-flex">
              <BankAgentLogo variant="lockup" className="h-10 w-auto" priority />
            </span>
            {roleMeta ? (
              <span className={`hidden shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold lg:inline-flex ${roleMeta.cls}`}>
                {roleMeta.badge}
              </span>
            ) : null}
          </Link>

          {navItems.length > 0 ? (
            <nav aria-label="Role navigation" className="hidden items-center gap-0.5 rounded-full border border-[var(--ox-line)] bg-[var(--ox-soft)] p-1 md:flex">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={item.active ? "page" : undefined}
                  className={pillCls(item.active)}
                  onClick={() => {
                    if (item.tab) {
                      setIsVaultTab(item.tab === "VAULT");
                      window.dispatchEvent(new CustomEvent("opalx:tab", { detail: item.tab }));
                    }
                    if (item.ent) {
                      setEntSection(item.ent);
                      window.dispatchEvent(new CustomEvent("opalx:enterprise-section", { detail: item.ent }));
                    }
                    if (item.hash) setBankHash(item.hash);
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : null}

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {role === "BANK" ? (
              <button
                type="button"
                aria-pressed={isLiveBank}
                onClick={() => setActiveKind(isLiveBank ? "DEMO_ACCOUNT" : "LIVE_DIRECT_ACCOUNT")}
                title={isLiveBank ? "Active: [LIVE BANK] — Click to switch to [SANDBOX]" : "Active: [SANDBOX] — Click to switch to [LIVE BANK]"}
                className={`ox-press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[10px] font-bold tracking-tight whitespace-nowrap sm:text-[11px] ${
                  isLiveBank ? "ox-badge-verified" : "ox-badge-warn"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isLiveBank ? "bg-[var(--ox-ok)]" : "bg-[var(--ox-warn)]"}`} aria-hidden="true" />
                <span>{isLiveBank ? "[LIVE BANK]" : "[SANDBOX]"}</span>
              </button>
            ) : null}

            <ThemeToggleButton />
            <PwaInstallButton />

            {session ? (
              <AgentWalletPopover />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setLoginDefaultLayout(pathname.startsWith("/enterprise") ? "ENTERPRISE" : pathname.startsWith("/bank") ? "BANK" : "CUSTOMER");
                  setLoginOpen(true);
                }}
                className="ox-btn-primary inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap sm:px-4"
              >
                <Wallet className="h-3.5 w-3.5 shrink-0" />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </div>

        {showApkUpgrade ? (
          <div className="border-t border-[var(--ox-line)] bg-[var(--ox-soft)] px-4 py-1.5 text-[11px] text-[var(--ox-ink)]">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-2">
              <span className="truncate font-medium">APK v2.0 available with a compact header bar</span>
              <a href="/api/apk" className="ox-btn-primary inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-[11px]">
                <Download className="h-3 w-3" /><span>Download APK v2.0</span>
              </a>
            </div>
          </div>
        ) : null}
      </header>

      <WalletLoginModal open={loginOpen} defaultLayout={loginDefaultLayout} onClose={() => setLoginOpen(false)} />
    </>
  );
}