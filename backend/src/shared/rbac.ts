/**
 * RBAC: roles, permissions, and role→permission mapping (API Spec §7 Access Control Matrix).
 * Business rules live here; middleware only calls hasPermission.
 */

/** Supported roles (align with API Spec). */
export const ROLES = {
  ADMIN: "ADMIN",
  EXIM_OFFICER: "EXIM_OFFICER",
  VIEWER: "VIEWER",
  DOCS: "DOCS",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/** Permissions from Access Control Matrix. */
export const PERMISSIONS = {
  VIEW_TRANSACTIONS: "VIEW_TRANSACTIONS",
  CREATE_TRANSACTION: "CREATE_TRANSACTION",
  UPDATE_TRANSACTION: "UPDATE_TRANSACTION",
  UPDATE_STATUS: "UPDATE_STATUS",
  UPLOAD_DOCUMENT: "UPLOAD_DOCUMENT",
  MANAGE_USERS: "MANAGE_USERS",
  VIEW_PO_INTAKE: "VIEW_PO_INTAKE",
  UPDATE_PO_INTAKE: "UPDATE_PO_INTAKE",
  TAKE_OWNERSHIP: "TAKE_OWNERSHIP",
  CREATE_PO_INTAKE_TEST: "CREATE_PO_INTAKE_TEST",
  IMPORT_PO_CSV: "IMPORT_PO_CSV",
  PARSE_PO_PDF: "PARSE_PO_PDF",
  VIEW_SHIPMENTS: "VIEW_SHIPMENTS",
  CREATE_SHIPMENT: "CREATE_SHIPMENT",
  UPDATE_SHIPMENT: "UPDATE_SHIPMENT",
  COUPLE_DECOUPLE_PO: "COUPLE_DECOUPLE_PO",
  VIEW_EXPORT_BULKING: "VIEW_EXPORT_BULKING",
  CREATE_EXPORT_BULKING: "CREATE_EXPORT_BULKING",
  UPDATE_EXPORT_BULKING: "UPDATE_EXPORT_BULKING",
  UPDATE_EXPORT_BULKING_STATUS: "UPDATE_EXPORT_BULKING_STATUS",
  MANAGE_SHIPPERS: "MANAGE_SHIPPERS",
  MANAGE_AGENTS: "MANAGE_AGENTS",
  VIEW_PO_PDF_AI_USAGE: "VIEW_PO_PDF_AI_USAGE",
  VIEW_EXPORT_DOCUMENTATION: "VIEW_EXPORT_DOCUMENTATION",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** All known permission keys (for validation and UI). */
export const ALL_PERMISSION_KEYS: readonly string[] = Object.values(PERMISSIONS);

const ALL_PERM_SET = new Set<string>(ALL_PERMISSION_KEYS);

const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  [ROLES.ADMIN]: [
    PERMISSIONS.VIEW_TRANSACTIONS,
    PERMISSIONS.CREATE_TRANSACTION,
    PERMISSIONS.UPDATE_TRANSACTION,
    PERMISSIONS.UPDATE_STATUS,
    PERMISSIONS.UPLOAD_DOCUMENT,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.VIEW_PO_INTAKE,
    PERMISSIONS.UPDATE_PO_INTAKE,
    PERMISSIONS.TAKE_OWNERSHIP,
    PERMISSIONS.CREATE_PO_INTAKE_TEST,
    PERMISSIONS.IMPORT_PO_CSV,
    PERMISSIONS.PARSE_PO_PDF,
    PERMISSIONS.VIEW_SHIPMENTS,
    PERMISSIONS.CREATE_SHIPMENT,
    PERMISSIONS.UPDATE_SHIPMENT,
    PERMISSIONS.COUPLE_DECOUPLE_PO,
    PERMISSIONS.VIEW_EXPORT_BULKING,
    PERMISSIONS.CREATE_EXPORT_BULKING,
    PERMISSIONS.UPDATE_EXPORT_BULKING,
    PERMISSIONS.UPDATE_EXPORT_BULKING_STATUS,
    PERMISSIONS.MANAGE_SHIPPERS,
    PERMISSIONS.MANAGE_AGENTS,
    PERMISSIONS.VIEW_EXPORT_DOCUMENTATION,
    PERMISSIONS.VIEW_PO_PDF_AI_USAGE,
  ],
  [ROLES.EXIM_OFFICER]: [
    PERMISSIONS.VIEW_TRANSACTIONS,
    PERMISSIONS.CREATE_TRANSACTION,
    PERMISSIONS.UPDATE_TRANSACTION,
    PERMISSIONS.UPDATE_STATUS,
    PERMISSIONS.UPLOAD_DOCUMENT,
    PERMISSIONS.VIEW_PO_INTAKE,
    PERMISSIONS.UPDATE_PO_INTAKE,
    PERMISSIONS.TAKE_OWNERSHIP,
    PERMISSIONS.CREATE_PO_INTAKE_TEST,
    PERMISSIONS.IMPORT_PO_CSV,
    PERMISSIONS.PARSE_PO_PDF,
    PERMISSIONS.VIEW_SHIPMENTS,
    PERMISSIONS.CREATE_SHIPMENT,
    PERMISSIONS.UPDATE_SHIPMENT,
    PERMISSIONS.COUPLE_DECOUPLE_PO,
    PERMISSIONS.VIEW_EXPORT_BULKING,
    PERMISSIONS.CREATE_EXPORT_BULKING,
    PERMISSIONS.UPDATE_EXPORT_BULKING,
    PERMISSIONS.UPDATE_EXPORT_BULKING_STATUS,
  ],
  [ROLES.VIEWER]: [
    PERMISSIONS.VIEW_TRANSACTIONS,
    PERMISSIONS.VIEW_PO_INTAKE,
    PERMISSIONS.CREATE_PO_INTAKE_TEST, /* temporary for E2E testing until SaaS integration */
    PERMISSIONS.IMPORT_PO_CSV,
    PERMISSIONS.PARSE_PO_PDF,
    PERMISSIONS.VIEW_SHIPMENTS,
    PERMISSIONS.VIEW_EXPORT_BULKING,
  ],
  [ROLES.DOCS]: [
    PERMISSIONS.VIEW_TRANSACTIONS,
    PERMISSIONS.VIEW_PO_INTAKE,
    PERMISSIONS.VIEW_SHIPMENTS,
    PERMISSIONS.VIEW_EXPORT_BULKING,
    PERMISSIONS.VIEW_EXPORT_DOCUMENTATION,
  ],
};

/** Normalized role key (uppercase) for lookup. */
function normalizeRole(role: string): string {
  return role.toUpperCase();
}

/** Normalize override list to known permissions only. */
export function normalizePermissionOverrides(overrides: unknown): string[] {
  if (!Array.isArray(overrides)) return [];
  const out: string[] = [];
  for (const p of overrides) {
    if (typeof p === "string" && ALL_PERM_SET.has(p)) out.push(p);
  }
  return out;
}

/** Union of role permissions and optional per-user overrides. */
export function computeEffectivePermissions(role: string, overrides: string[]): ReadonlySet<string> {
  const base = getPermissionsForRole(role);
  const out = new Set<string>(base);
  for (const p of normalizePermissionOverrides(overrides)) out.add(p);
  return out;
}

/** Whether the user (role + optional overrides) has the permission. */
export function userHasPermission(
  role: string,
  overrides: string[] | null | undefined,
  permission: string
): boolean {
  return computeEffectivePermissions(role, overrides ?? []).has(permission);
}

/** Role-only check (no overrides). */
export function hasPermission(role: string, permission: string): boolean {
  return userHasPermission(role, [], permission);
}

/** Returns all permissions for a role (for future use). */
export function getPermissionsForRole(role: string): ReadonlySet<string> {
  const key = normalizeRole(role);
  const list = ROLE_PERMISSIONS[key] ?? [];
  return new Set(list);
}

/** Valid role values for DB/validation. */
export const VALID_ROLES: readonly string[] = Object.values(ROLES);
