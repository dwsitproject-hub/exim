/**
 * Paths that remain accessible while must_change_password is set.
 */

import type { Request } from "express";

const EXEMPT_SUFFIXES = [
  "/auth/change-password",
  "/auth/me",
  "/auth/logout",
  "/auth/refresh",
] as const;

export function isPasswordChangeExemptRequest(req: Request): boolean {
  const path = (req.originalUrl ?? req.url ?? "").split("?")[0] ?? "";
  return EXEMPT_SUFFIXES.some((suffix) => path.endsWith(suffix));
}
