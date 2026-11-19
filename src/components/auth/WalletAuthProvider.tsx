"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PortalRole, UserWalletSession, WalletActionConfirmation } from "@/types";

export interface RoleLoginParams {
  role: PortalRole;
  provider: "GOOGLE" | "EMAIL";
  email: string;
  displayName?: string;
  rolePositionId?: string;
}

interface WalletAuthContextValue {
  session: UserWalletSession | null;
  roleSession: UserWalletSession | null;
  loading: boolean;
  lastConfirmation: WalletActionConfirmation | null;
  refreshSession: () => Promise<void>;
  loginWithGoogle: (email?: string, displayName?: string) => Promise<UserWalletSession | null>;
  loginWithEmail: (email: string, displayName?: string) => Promise<UserWalletSession | null>;
  loginWithRole: (params: RoleLoginParams) => Promise<UserWalletSession | null>;
  confirmWithWallet: (action: WalletActionConfirmation["action"], summary: string) => Promise<WalletActionConfirmation | null>;
  logout: () => Promise<void>;
}

const WalletAuthContext = createContext<WalletAuthContextValue>({
  session: null,
  roleSession: null,
  loading: false,
  lastConfirmation: null,
  refreshSession: async () => undefined,
  loginWithGoogle: async () => null,
  loginWithEmail: async () => null,
  loginWithRole: async () => null,
  confirmWithWallet: async () => null,
  logout: async () => undefined,
});

export function WalletAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<UserWalletSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastConfirmation, setLastConfirmation] = useState<WalletActionConfirmation | null>(null);

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/wallet-login", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { session?: UserWalletSession | null };
      setSession(data.session ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const performLogin = useCallback(
    async (
      provider: "GOOGLE" | "EMAIL",
      email: string,
      displayName?: string,
      role?: PortalRole,
      rolePositionId?: string,
    ) => {
      setLoading(true);
      try {
        const cleanedPositionId = rolePositionId?.trim();
        const effectivePositionId =
          cleanedPositionId && cleanedPositionId !== "new"
            ? cleanedPositionId
            : undefined;
        const emailScopeKey = email.trim().toLowerCase().slice(0, 64);
        const defaultScopeId =
          effectivePositionId ??
          (role === "ENTERPRISE"
            ? emailScopeKey || "california-fitness"
            : "california-fitness");

        const res = await fetch("/api/auth/wallet-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "LOGIN",
            provider,
            email,
            ...(displayName?.trim() ? { displayName: displayName.trim() } : {}),
            defaultScopeId,
            ...(role ? { role } : {}),
            ...(effectivePositionId ? { rolePositionId: effectivePositionId } : {}),
          }),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as {
          session?: UserWalletSession;
          confirmation?: WalletActionConfirmation;
        };
        if (data.session) setSession(data.session);
        if (data.confirmation) setLastConfirmation(data.confirmation);
        return data.session ?? null;
      } catch {
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const loginWithGoogle = useCallback(
    async (email = "member.cali@gmail.com", displayName = "Google Member") => performLogin("GOOGLE", email, displayName),
    [performLogin],
  );

  const loginWithEmail = useCallback(
    async (email: string, displayName?: string) => performLogin("EMAIL", email, displayName),
    [performLogin],
  );

  const loginWithRole = useCallback(
    async (params: RoleLoginParams) =>
      performLogin(params.provider, params.email, params.displayName, params.role, params.rolePositionId),
    [performLogin],
  );

  const confirmWithWallet = useCallback(
    async (action: WalletActionConfirmation["action"], summary: string) => {
      if (!session) return null;
      try {
        const res = await fetch("/api/auth/wallet-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "CONFIRM_WALLET", action, summary }),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as {
          session?: UserWalletSession;
          confirmation?: WalletActionConfirmation;
        };
        if (data.session) setSession(data.session);
        if (data.confirmation) setLastConfirmation(data.confirmation);
        return data.confirmation ?? null;
      } catch {
        return null;
      }
    },
    [session],
  );

  const logout = useCallback(async () => {
    setLoading(true);
    try {
      await fetch("/api/auth/wallet-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "LOGOUT" }),
      });
      setSession(null);
      setLastConfirmation(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const roleSession = useMemo(() => (session?.role ? session : null), [session]);

  const value = useMemo<WalletAuthContextValue>(
    () => ({
      session,
      roleSession,
      loading,
      lastConfirmation,
      refreshSession,
      loginWithGoogle,
      loginWithEmail,
      loginWithRole,
      confirmWithWallet,
      logout,
    }),
    [session, roleSession, loading, lastConfirmation, refreshSession, loginWithGoogle, loginWithEmail, loginWithRole, confirmWithWallet, logout],
  );

  return <WalletAuthContext.Provider value={value}>{children}</WalletAuthContext.Provider>;
}

export function useWalletAuth(): WalletAuthContextValue {
  return useContext(WalletAuthContext);
}
