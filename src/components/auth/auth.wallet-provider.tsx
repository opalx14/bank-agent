"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  connectInjectedAccount,
  discoverInjectedWallets,
  signChallengeWithInjectedWallet,
  type Eip1193Provider,
} from "@/lib/avalanche/avalanche.browser-wallet";
import type { PortalRole, UserWalletSession, WalletActionConfirmation } from "@/types";

export interface RoleLoginParams {
  role: PortalRole;
  provider: "GOOGLE" | "EMAIL";
  email: string;
  displayName?: string;
  rolePositionId?: string;
}

export interface ExternalWalletLoginParams {
  role: PortalRole;
  provider?: Eip1193Provider;
  connectorName?: string;
  displayName?: string;
  rolePositionId?: string;
}

export interface ExternalWalletLoginResult {
  session: UserWalletSession | null;
  error?: string;
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
  loginWithExternalWallet: (params: ExternalWalletLoginParams) => Promise<ExternalWalletLoginResult>;
  switchRole: (role: PortalRole, rolePositionId?: string) => Promise<UserWalletSession | null>;
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
  loginWithExternalWallet: async () => ({ session: null }),
  switchRole: async () => null,
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

  const loginWithExternalWallet = useCallback(
    async (params: ExternalWalletLoginParams): Promise<ExternalWalletLoginResult> => {
      setLoading(true);
      try {
        let targetProvider = params.provider;
        let connectorName = params.connectorName;
        if (!targetProvider) {
          const wallets = await discoverInjectedWallets();
          if (wallets.length === 0) {
            return {
              session: null,
              error: "NO_WALLET_DETECTED",
            };
          }
          targetProvider = wallets[0].provider;
          connectorName = connectorName || wallets[0].name;
        }

        const walletAddress = await connectInjectedAccount(targetProvider);

        const challengeRes = await fetch("/api/auth/wallet-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "EXTERNAL_CHALLENGE",
            walletAddress,
            role: params.role,
          }),
        });
        if (!challengeRes.ok) {
          return { session: null, error: "Could not create wallet sign-in challenge." };
        }
        const challenge = (await challengeRes.json()) as {
          message: string;
          challengeToken: string;
        };

        const signature = await signChallengeWithInjectedWallet(
          targetProvider,
          walletAddress,
          challenge.message,
        );

        const verifyRes = await fetch("/api/auth/wallet-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "EXTERNAL_VERIFY",
            walletAddress,
            signature,
            message: challenge.message,
            challengeToken: challenge.challengeToken,
            role: params.role,
            ...(connectorName ? { connectorName } : {}),
            ...(params.displayName?.trim() ? { displayName: params.displayName.trim() } : {}),
            ...(params.rolePositionId?.trim() ? { rolePositionId: params.rolePositionId.trim() } : {}),
          }),
        });
        const verifyData = (await verifyRes.json()) as {
          session?: UserWalletSession;
          confirmation?: WalletActionConfirmation;
          error?: string;
        };
        if (!verifyRes.ok || !verifyData.session) {
          return {
            session: null,
            error: verifyData.error || "Wallet signature verification failed.",
          };
        }
        setSession(verifyData.session);
        if (verifyData.confirmation) setLastConfirmation(verifyData.confirmation);
        return { session: verifyData.session };
      } catch (err) {
        const code = (err as { code?: number } | null)?.code;
        if (code === 4001) {
          return { session: null, error: "Connection or signature rejected in your wallet." };
        }
        return {
          session: null,
          error: err instanceof Error ? err.message : "Unable to connect external wallet.",
        };
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const switchRole = useCallback(
    async (role: PortalRole, rolePositionId?: string): Promise<UserWalletSession | null> => {
      if (!session) return null;
      setLoading(true);
      try {
        const res = await fetch("/api/auth/wallet-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "SWITCH_ROLE",
            role,
            ...(rolePositionId?.trim() ? { rolePositionId: rolePositionId.trim() } : {}),
          }),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { session?: UserWalletSession };
        if (data.session) setSession(data.session);
        return data.session ?? null;
      } catch {
        return null;
      } finally {
        setLoading(false);
      }
    },
    [session],
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
      loginWithExternalWallet,
      switchRole,
      confirmWithWallet,
      logout,
    }),
    [
      session,
      roleSession,
      loading,
      lastConfirmation,
      refreshSession,
      loginWithGoogle,
      loginWithEmail,
      loginWithRole,
      loginWithExternalWallet,
      switchRole,
      confirmWithWallet,
      logout,
    ],
  );

  return <WalletAuthContext.Provider value={value}>{children}</WalletAuthContext.Provider>;
}

export function useWalletAuth(): WalletAuthContextValue {
  return useContext(WalletAuthContext);
}
