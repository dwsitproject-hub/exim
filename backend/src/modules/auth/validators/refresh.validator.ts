/**
 * Refresh and logout: refresh_token in JSON body and/or HttpOnly cookie `eos_refresh`.
 */

import type { Request } from "express";
import { REFRESH_TOKEN_COOKIE } from "../auth-cookies.js";
import type { ErrorField } from "../../../shared/response.js";

export interface RefreshInput {
  refresh_token: string;
}

export function validateRefreshBody(req: Request): { ok: true; data: RefreshInput } | { ok: false; errors: ErrorField[] } {
  const body = req.body as Record<string, unknown>;
  const errors: ErrorField[] = [];

  const fromBody = typeof body?.refresh_token === "string" ? body.refresh_token.trim() : "";
  const fromCookie =
    typeof req.cookies?.[REFRESH_TOKEN_COOKIE] === "string" ? req.cookies[REFRESH_TOKEN_COOKIE]!.trim() : "";
  const refresh_token = fromBody || fromCookie;
  if (!refresh_token) {
    errors.push({ field: "refresh_token", message: "Refresh token is required (body or cookie)" });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, data: { refresh_token } };
}
