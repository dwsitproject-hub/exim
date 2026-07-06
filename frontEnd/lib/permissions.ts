/**
 * Client-side permission checks using effective_permissions from auth API.
 */

import type { AuthUser } from "@/types/auth";

export function can(user: AuthUser | null | undefined, permission: string): boolean {
  return Boolean(user?.effective_permissions?.includes(permission));
}

const ADMIN_AREA_ROLES = new Set(["ADMIN", "ADMIN_IMPORT", "ADMIN_EXPORT"]);

const ADMIN_AREA_PERMISSIONS = [
  "MANAGE_USERS",
  "MANAGE_IMPORT_MASTERS",
  "MANAGE_EXPORT_MASTERS",
  "MANAGE_SHIPPERS",
  "MANAGE_AGENTS",
  "MANAGE_SURVEYORS",
  "MANAGE_COMMODITIES",
  "VIEW_PO_PDF_AI_USAGE",
] as const;

/** Whether the user can open the Administration section at all. */
export function canAccessAdminArea(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  const role = user.role?.trim().toUpperCase() ?? "";
  if (ADMIN_AREA_ROLES.has(role)) return true;
  return ADMIN_AREA_PERMISSIONS.some((p) => can(user, p));
}

/** @deprecated Use canAccessAdminArea — kept for existing call sites. */
export function isAdminRole(user: AuthUser | null | undefined): boolean {
  return canAccessAdminArea(user);
}

export function canManageImportMasters(user: AuthUser | null | undefined): boolean {
  return can(user, "MANAGE_IMPORT_MASTERS") || can(user, "MANAGE_SHIPPERS");
}

export function canManageExportMasters(user: AuthUser | null | undefined): boolean {
  return (
    can(user, "MANAGE_EXPORT_MASTERS") ||
    can(user, "MANAGE_SHIPPERS") ||
    can(user, "MANAGE_AGENTS") ||
    can(user, "MANAGE_SURVEYORS") ||
    can(user, "MANAGE_COMMODITIES")
  );
}

export function canManageExportMasterList(
  user: AuthUser | null | undefined,
  legacyPermission: "MANAGE_AGENTS" | "MANAGE_SURVEYORS" | "MANAGE_COMMODITIES",
): boolean {
  return can(user, "MANAGE_EXPORT_MASTERS") || can(user, "MANAGE_SHIPPERS") || can(user, legacyPermission);
}

export function canAccessShipperMasterAdmin(user: AuthUser | null | undefined): boolean {
  return canManageImportMasters(user) || canManageExportMasters(user);
}
