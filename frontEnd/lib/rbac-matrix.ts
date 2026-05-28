/**
 * Labels for admin user RBAC UI (keys must match backend PERMISSIONS).
 */

export const USER_ROLE_OPTIONS = ["ADMIN", "EXIM_OFFICER", "VIEWER"] as const;

export type UserRoleOption = (typeof USER_ROLE_OPTIONS)[number];

export const PERMISSION_CATALOG: readonly { key: string; label: string }[] = [
  { key: "VIEW_TRANSACTIONS", label: "View transactions" },
  { key: "CREATE_TRANSACTION", label: "Create transaction" },
  { key: "UPDATE_TRANSACTION", label: "Update transaction" },
  { key: "UPDATE_STATUS", label: "Update status" },
  { key: "UPLOAD_DOCUMENT", label: "Upload document" },
  { key: "MANAGE_USERS", label: "Manage users" },
  { key: "VIEW_PO_INTAKE", label: "View PO intake" },
  { key: "TAKE_OWNERSHIP", label: "Take ownership" },
  { key: "CREATE_PO_INTAKE_TEST", label: "Create PO intake (test)" },
  { key: "UPDATE_PO_INTAKE", label: "Update PO intake" },
  { key: "VIEW_SHIPMENTS", label: "View shipments" },
  { key: "CREATE_SHIPMENT", label: "Create shipment" },
  { key: "UPDATE_SHIPMENT", label: "Update shipment" },
  { key: "COUPLE_DECOUPLE_PO", label: "Couple / decouple PO" },
] as const;

/** Frontend copy of backend role→permission matrix (must stay in sync with backend `shared/rbac.ts`). */
export const ROLE_DEFAULT_PERMISSIONS: Readonly<Record<UserRoleOption, readonly string[]>> = {
  ADMIN: [
    "VIEW_TRANSACTIONS",
    "CREATE_TRANSACTION",
    "UPDATE_TRANSACTION",
    "UPDATE_STATUS",
    "UPLOAD_DOCUMENT",
    "MANAGE_USERS",
    "VIEW_PO_INTAKE",
    "TAKE_OWNERSHIP",
    "CREATE_PO_INTAKE_TEST",
    "UPDATE_PO_INTAKE",
    "VIEW_SHIPMENTS",
    "CREATE_SHIPMENT",
    "UPDATE_SHIPMENT",
    "COUPLE_DECOUPLE_PO",
  ],
  EXIM_OFFICER: [
    "VIEW_TRANSACTIONS",
    "CREATE_TRANSACTION",
    "UPDATE_TRANSACTION",
    "UPDATE_STATUS",
    "UPLOAD_DOCUMENT",
    "VIEW_PO_INTAKE",
    "TAKE_OWNERSHIP",
    "CREATE_PO_INTAKE_TEST",
    "UPDATE_PO_INTAKE",
    "VIEW_SHIPMENTS",
    "CREATE_SHIPMENT",
    "UPDATE_SHIPMENT",
    "COUPLE_DECOUPLE_PO",
  ],
  VIEWER: ["VIEW_TRANSACTIONS", "VIEW_PO_INTAKE", "CREATE_PO_INTAKE_TEST", "VIEW_SHIPMENTS"],
} as const;

export function getRoleDefaultPermissionSet(role: string): ReadonlySet<string> {
  const key = role.trim().toUpperCase() as UserRoleOption;
  const list = ROLE_DEFAULT_PERMISSIONS[key] ?? [];
  return new Set(list);
}
