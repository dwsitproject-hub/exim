/**
 * Auth service — login, logout, refresh, getMe, verifyEmail, forgotPassword, resetPassword.
 * Uses API client; no token storage (handled by auth state).
 */

import { apiPost, apiGet } from "./api-client";
import { config } from "@/lib/config";
import type { LoginResponseData, RefreshResponseData, AuthUser } from "@/types/auth";
import type { ApiResponse } from "@/types/api";

const AUTH_PREFIX = "auth";

export async function login(
  email: string,
  password: string
): Promise<ApiResponse<LoginResponseData>> {
  return apiPost<LoginResponseData>(`${AUTH_PREFIX}/login`, { email, password });
}

export async function verifyEmail(token: string): Promise<ApiResponse<unknown>> {
  return apiPost<unknown>(`${AUTH_PREFIX}/verify-email`, { token });
}

export async function forgotPassword(email: string): Promise<ApiResponse<unknown>> {
  return apiPost<unknown>(`${AUTH_PREFIX}/forgot-password`, { email });
}

export async function resetPassword(payload: {
  token: string;
  new_password: string;
  password_confirmation: string;
}): Promise<ApiResponse<unknown>> {
  return apiPost<unknown>(`${AUTH_PREFIX}/reset-password`, payload);
}

/** Refresh uses HttpOnly `eos_refresh` cookie; body may be empty. */
export async function refresh(): Promise<ApiResponse<RefreshResponseData>> {
  return apiPost<RefreshResponseData>(`${AUTH_PREFIX}/refresh`, {});
}

/** Logout revokes refresh and clears HttpOnly cookies. */
export async function logout(): Promise<ApiResponse<unknown>> {
  return apiPost<unknown>(`${AUTH_PREFIX}/logout`, {});
}

export async function getMe(accessToken?: string | null): Promise<ApiResponse<AuthUser>> {
  return apiGet<AuthUser>(`${AUTH_PREFIX}/me`, accessToken ?? null);
}

/** Whether DWS Hub OIDC SSO is configured on the backend. */
export async function getOidcStatus(): Promise<ApiResponse<{ enabled: boolean }>> {
  return apiGet<{ enabled: boolean }>(`${AUTH_PREFIX}/oidc/status`);
}

/** Full browser navigation URL for SP-initiated Hub login (sets cookies via redirect). */
export function oidcLoginUrl(): string {
  const base = config.apiBaseUrl.replace(/\/$/, "");
  const path = `${base}/auth/oidc/login`;
  return path.startsWith("http") || path.startsWith("/") ? path : `/${path}`;
}
