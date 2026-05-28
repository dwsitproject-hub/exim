/**
 * Shared route and app constants — single source for paths used in middleware and client.
 */

/** Login path — used for redirects and route protection. */
export const LOGIN_PATH = "/login";

/** Default dashboard path after login. */
export const DEFAULT_AFTER_LOGIN_PATH = "/dashboard";

/**
 * useAuth `accessToken` state when tokens are HttpOnly cookies (JS cannot read JWT).
 * API client omits Authorization and relies on `credentials: "include"`.
 */
export const COOKIE_AUTH_SENTINEL = "cookie";
