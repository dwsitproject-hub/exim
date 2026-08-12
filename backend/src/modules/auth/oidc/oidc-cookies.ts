/**
 * Short-lived HttpOnly cookies holding SP-initiated PKCE state between login and callback.
 */

import type { Request, Response } from "express";
import { config } from "../../../config/index.js";

export const OIDC_STATE_COOKIE = "eos_oidc_state";
export const OIDC_NONCE_COOKIE = "eos_oidc_nonce";
export const OIDC_VERIFIER_COOKIE = "eos_oidc_verifier";

const MAX_AGE_MS = 10 * 60 * 1000;

function cookieOpts() {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_MS,
  };
}

export function setOidcPendingCookies(
  res: Response,
  data: { state: string; nonce: string; codeVerifier: string }
): void {
  const opts = cookieOpts();
  res.cookie(OIDC_STATE_COOKIE, data.state, opts);
  res.cookie(OIDC_NONCE_COOKIE, data.nonce, opts);
  res.cookie(OIDC_VERIFIER_COOKIE, data.codeVerifier, opts);
}

export function clearOidcPendingCookies(res: Response): void {
  const opts = {
    path: "/",
    sameSite: "lax" as const,
    secure: config.cookieSecure,
    httpOnly: true,
  };
  res.clearCookie(OIDC_STATE_COOKIE, opts);
  res.clearCookie(OIDC_NONCE_COOKIE, opts);
  res.clearCookie(OIDC_VERIFIER_COOKIE, opts);
}

export function readOidcPendingCookies(req: Request): {
  state: string | undefined;
  nonce: string | undefined;
  codeVerifier: string | undefined;
} {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return {
    state: cookies?.[OIDC_STATE_COOKIE],
    nonce: cookies?.[OIDC_NONCE_COOKIE],
    codeVerifier: cookies?.[OIDC_VERIFIER_COOKIE],
  };
}
