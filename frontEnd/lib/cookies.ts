/**
 * Legacy cookie cleanup. Access/refresh tokens are HttpOnly (`Set-Cookie` from API); middleware still reads `eos_access`.
 * `clearTokens` removes any old non-HttpOnly cookies from previous deployments.
 */

const ACCESS_KEY = "eos_access";
const REFRESH_KEY = "eos_refresh";

/** SameSite=Lax; add Secure on HTTPS so cookies are not sent over plain HTTP. */
function cookieSuffix(): string {
  if (typeof window === "undefined") return "; SameSite=Lax";
  return window.location.protocol === "https:" ? "; SameSite=Lax; Secure" : "; SameSite=Lax";
}

export function getAccessToken(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${ACCESS_KEY}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function getRefreshToken(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${REFRESH_KEY}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** @deprecated Tokens are HttpOnly; kept for tests or emergency compat. */
export function setTokens(access: string, refresh: string, expiresInSeconds?: number): void {
  if (typeof document === "undefined") return;
  const maxAge = expiresInSeconds ?? 60 * 60;
  const suffix = cookieSuffix();
  document.cookie = `${ACCESS_KEY}=${encodeURIComponent(access)}; path=/; max-age=${maxAge}${suffix}`;
  document.cookie = `${REFRESH_KEY}=${encodeURIComponent(refresh)}; path=/; max-age=${60 * 60 * 24 * 7}${suffix}`;
}

/**
 * Clears only **non-HttpOnly** cookies with these names. HttpOnly session cookies are cleared by POST /auth/logout
 * (Set-Cookie from the API). This still removes legacy client-set tokens if present.
 */
export function clearTokens(): void {
  if (typeof document === "undefined") return;
  const suffix = cookieSuffix();
  document.cookie = `${ACCESS_KEY}=; path=/; max-age=0${suffix}`;
  document.cookie = `${REFRESH_KEY}=; path=/; max-age=0${suffix}`;
}

/** Cookie name for middleware to check (must match ACCESS_KEY). */
export const ACCESS_COOKIE_NAME = ACCESS_KEY;
