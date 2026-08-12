/**
 * Shared route and app constants — single source for paths used in middleware and client.
 */

/** Path for first-login / forced password change. */
export const CHANGE_PASSWORD_PATH = "/change-password";

/** Login path — used for redirects and route protection. */
export const LOGIN_PATH = "/login";

/** Default landing path after login (hub page). */
export const DEFAULT_AFTER_LOGIN_PATH = "/";

/**
 * useAuth `accessToken` state when tokens are HttpOnly cookies (JS cannot read JWT).
 * API client omits Authorization and relies on `credentials: "include"`.
 */
export const COOKIE_AUTH_SENTINEL = "cookie";
