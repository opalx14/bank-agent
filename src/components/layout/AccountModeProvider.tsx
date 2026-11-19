"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AccountClassificationResponse,
  AccountProfileKind,
  MerchantAccountProfile,
} from "@/types";
import { AVAX_FAUCET_RESOURCES, DEFAULT_DEMO_PROFILE } from "@/core/bank/account-mode";

const STORAGE_KEY = "opalx.accountProfile";

const INITIAL_CLASSIFICATION: AccountClassificationResponse & { walletAvaxBalance?: string } = {
  defaultProfile: "DEMO_ACCOUNT",
  profiles: {
    DEMO_ACCOUNT: DEFAULT_DEMO_PROFILE,
    LIVE_DIRECT_ACCOUNT: {
      ...DEFAULT_DEMO_PROFILE,
      kind: "LIVE_DIRECT_ACCOUNT",
      railMode: "LIVE_BANK",
      badgeLabel: "[LIVE BANK]",
      title: "Live Direct Account ([LIVE BANK])",
    },
  },
  liveReadiness: {
    payosConfigured: false,
    bankAccountConfigured: false,
    fujiIssuerKeyConfigured: false,
    fujiContractsDeployed: false,
    readyForLiveBank: false,
    readyForLiveFujiTx: false,
    missingEnvKeys: [],
  },
  faucets: AVAX_FAUCET_RESOURCES,
  checkedAtIso: "2026-11-14T00:00:00.000Z",
};

interface AccountModeContextValue {
  activeKind: AccountProfileKind;
  setActiveKind: (kind: AccountProfileKind) => void;
  activeProfile: MerchantAccountProfile;
  classification: AccountClassificationResponse & { walletAvaxBalance?: string };
  refreshAccountMode: () => Promise<void>;
}

const AccountModeContext = createContext<AccountModeContextValue>({
  activeKind: "DEMO_ACCOUNT",
  setActiveKind: () => undefined,
  activeProfile: DEFAULT_DEMO_PROFILE,
  classification: INITIAL_CLASSIFICATION,
  refreshAccountMode: async () => undefined,
});

export function AccountModeProvider({ children }: { children: ReactNode }) {
  const [classification, setClassification] = useState(INITIAL_CLASSIFICATION);
  const [activeKind, setActiveKindState] = useState<AccountProfileKind>("DEMO_ACCOUNT");

  const refreshAccountMode = useCallback(async () => {
    try {
      const res = await fetch("/api/account-mode", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as AccountClassificationResponse & {
        walletAvaxBalance?: string;
      };
      setClassification(data);
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "DEMO_ACCOUNT" || saved === "LIVE_DIRECT_ACCOUNT") {
        setActiveKindState(saved);
      } else {
        setActiveKindState(data.defaultProfile);
      }
    } catch {
      // Keep fallback state silently.
    }
  }, []);

  useEffect(() => {
    void refreshAccountMode();
  }, [refreshAccountMode]);

  const setActiveKind = useCallback((kind: AccountProfileKind) => {
    setActiveKindState(kind);
    try {
      window.localStorage.setItem(STORAGE_KEY, kind);
    } catch {
      // Ignore storage quota issues.
    }
  }, []);

  const value = useMemo<AccountModeContextValue>(
    () => ({
      activeKind,
      setActiveKind,
      activeProfile: classification.profiles[activeKind] ?? DEFAULT_DEMO_PROFILE,
      classification,
      refreshAccountMode,
    }),
    [activeKind, classification, refreshAccountMode, setActiveKind],
  );

  return <AccountModeContext.Provider value={value}>{children}</AccountModeContext.Provider>;
}

export function useAccountMode(): AccountModeContextValue {
  return useContext(AccountModeContext);
}
