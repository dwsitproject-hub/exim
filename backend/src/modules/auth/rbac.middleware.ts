/**
 * RBAC middleware: require role or permission. Use after authMiddleware.
 * Permission logic lives in shared/rbac.ts.
 */

import type { Request, Response, NextFunction } from "express";
import { sendError } from "../../shared/response.js";
import { userHasPermission } from "../../shared/rbac.js";

function ensureUser(req: Request, res: Response): boolean {
  if (!req.user) {
    sendError(res, "Unauthorized", { statusCode: 401 });
    return false;
  }
  return true;
}

/** Require one of the given roles (e.g. ROLES.ADMIN, 'IMPORT_OFFICER'). */
export function requireRole(...allowedRoles: string[]) {
  const set = new Set(allowedRoles.map((r) => r.toUpperCase()));
  return function middleware(req: Request, res: Response, next: NextFunction): void {
    if (!ensureUser(req, res)) return;
    if (!set.has(req.user!.role.toUpperCase())) {
      sendError(res, "Forbidden", { statusCode: 403 });
      return;
    }
    next();
  };
}

/** Require at least one of the given permissions (from API Spec §7). */
export function requirePermission(...permissions: string[]) {
  return function middleware(req: Request, res: Response, next: NextFunction): void {
    if (!ensureUser(req, res)) return;
    const role = req.user!.role;
    const overrides = req.user!.permission_overrides;
    const allowed = permissions.some((p) => userHasPermission(role, overrides, p));
    if (!allowed) {
      sendError(res, "Forbidden", { statusCode: 403 });
      return;
    }
    next();
  };
}
