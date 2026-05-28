"use client";

/**
 * Auth state — user and session. Access/refresh tokens are HttpOnly cookies (not readable by JS).
 * `accessToken` state uses COOKIE_AUTH_SENTINEL when the session is cookie-based.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getMe, login as authLogin, logout as authLogout, refresh as authRefresh } from "@/services/auth-service";
import type { AuthUser, LoginResponseData } from "@/types/auth";
import { isApiError } from "@/types/api";
import { COOKIE_AUTH_SENTINEL } from "@/lib/constants";
import { clearTokens } from "@/lib/cookies";

function normalizeAuthUser(raw: unknown): AuthUser | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string") return null;
  return {
    id: o.id,
    name: typeof o.name === "string" ? o.name : "",
    email: typeof o.email === "string" ? o.email : "",
    role: typeof o.role === "string" ? o.role : "VIEWER",
    permission_overrides: Array.isArray(o.permission_overrides)
      ? o.permission_overrides.filter((x): x is string => typeof x === "string")
      : [],
    effective_permissions: Array.isArray(o.effective_permissions)
      ? o.effective_permissions.filter((x): x is string => typeof x === "string")
      : [],
  };
}

interface AuthState {
  user: AuthUser | null;
  /** `COOKIE_AUTH_SENTINEL` when HttpOnly cookies carry tokens; legacy JWT string if ever migrated back. */
  accessToken: string | null;
  loading: boolean;
  initialized: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string; errors?: { field: string; message: string }[] }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    loading: true,
    initialized: false,
  });

  const refreshSession = useCallback(async (): Promise<boolean> => {
    const res = await authRefresh();
    if (isApiError(res) || !res.data?.user) {
      clearTokens();
      setState((s) => ({ ...s, user: null, accessToken: null, loading: false, initialized: true }));
      return false;
    }
    const nextUser = normalizeAuthUser(res.data.user);
    if (!nextUser) {
      clearTokens();
      setState((s) => ({ ...s, user: null, accessToken: null, loading: false, initialized: true }));
      return false;
    }
    setState((s) => ({
      ...s,
      user: nextUser,
      accessToken: COOKIE_AUTH_SENTINEL,
      loading: false,
      initialized: true,
    }));
    return true;
  }, []);

  useEffect(() => {
    getMe(null)
      .then((res) => {
        if (!isApiError(res) && res.data) {
          setState((s) => ({
            ...s,
            user: res.data as AuthUser,
            accessToken: COOKIE_AUTH_SENTINEL,
            loading: false,
            initialized: true,
          }));
          return;
        }
        refreshSession();
      })
      .catch(() => refreshSession());
  }, [refreshSession]);

  useEffect(() => {
    function onAccessRefreshed(e: Event) {
      const detail = (e as CustomEvent<{ accessToken?: string }>).detail;
      if (detail?.accessToken) {
        setState((s) => ({ ...s, accessToken: detail.accessToken! }));
      }
    }
    window.addEventListener("eos-access-token-refreshed", onAccessRefreshed);
    return () => window.removeEventListener("eos-access-token-refreshed", onAccessRefreshed);
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<{ ok: boolean; error?: string; errors?: { field: string; message: string }[] }> => {
      setState((s) => ({ ...s, loading: true }));
      try {
        const res = await authLogin(email, password);
        if (isApiError(res)) {
          setState((s) => ({ ...s, loading: false }));
          return { ok: false, error: res.message, errors: res.errors };
        }
        const data = res.data as LoginResponseData;
        const nu = normalizeAuthUser(data.user);
        if (!nu) {
          setState((s) => ({ ...s, loading: false }));
          return { ok: false, error: "Invalid user payload from server" };
        }
        setState((s) => ({
          ...s,
          user: nu,
          accessToken: COOKIE_AUTH_SENTINEL,
          loading: false,
          initialized: true,
        }));
        return { ok: true };
      } catch (err) {
        setState((s) => ({ ...s, loading: false }));
        return { ok: false, error: err instanceof Error ? err.message : "Login failed" };
      }
    },
    []
  );

  const logout = useCallback(async () => {
    await authLogout().catch(() => {});
    clearTokens();
    setState((s) => ({ ...s, user: null, accessToken: null }));
  }, []);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      logout,
      refreshSession,
    }),
    [state, login, logout, refreshSession]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
