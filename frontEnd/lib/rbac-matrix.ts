/**
 * Labels for admin user RBAC UI (keys must match backend PERMISSIONS).
 */

export const USER_ROLE_OPTIONS = [
  "ADMIN",
  "IMPORT_OFFICER",
  "VIEWER",
  "DOCS",
  "EXPORT_BULKING_OPERATION",
  "EXPORT_BULKING_LEAD_DOCUMENTATION",
  "EXPORT_BULKING_DOCUMENTATION",
] as const;

export type UserRoleOption = (typeof USER_ROLE_OPTIONS)[number];

/** Human-readable labels for admin role picker. */
export const ROLE_DISPLAY_LABELS: Record<UserRoleOption, string> = {
  ADMIN: "Admin",
  IMPORT_OFFICER: "Import officer",
  VIEWER: "Viewer",
  DOCS: "Documentation (legacy)",
  EXPORT_BULKING_OPERATION: "Export bulking — operations",
  EXPORT_BULKING_LEAD_DOCUMENTATION: "Export bulking — lead documentation",
  EXPORT_BULKING_DOCUMENTATION: "Export bulking — documentation",
};

export function formatRoleLabel(role: string): string {
  const key = role.trim().toUpperCase() as UserRoleOption;
  return ROLE_DISPLAY_LABELS[key] ?? role;
}

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
  { key: "VIEW_EXPORT_BULKING", label: "View export bulking" },
  { key: "CREATE_EXPORT_BULKING", label: "Create export bulking" },
  { key: "UPDATE_EXPORT_BULKING", label: "Update export bulking (all)" },
  { key: "UPDATE_EXPORT_OPERATIONS", label: "Update export bulking operations" },
  { key: "UPDATE_EXPORT_DOCUMENTATION", label: "Update export bulking documentation" },
  { key: "UPDATE_EXPORT_BULKING_STATUS", label: "Update export bulking status" },
  { key: "MANAGE_SHIPPERS", label: "Manage shippers" },
  { key: "MANAGE_AGENTS", label: "Manage agents" },
  { key: "VIEW_PO_PDF_AI_USAGE", label: "View PO PDF AI usage" },
  { key: "VIEW_EXPORT_DOCUMENTATION", label: "View export documentation" },
  { key: "ASSIGN_EXPORT_BULKING_DOCUMENTATION", label: "Assign export bulking documentation" },
] as const;

/** Frontend copy of backend role→permission matrix (must stay in sync with backend `shared/rbac.ts`). */
export const ROLE_DEFAULT_PERMISSIONS: Readonly<Record<UserRoleOption, readonly string[]>> = {
  ADMIN: PERMISSION_CATALOG.map((p) => p.key),
  IMPORT_OFFICER: [
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
    "VIEW_EXPORT_BULKING",
    "CREATE_EXPORT_BULKING",
    "UPDATE_EXPORT_BULKING",
    "UPDATE_EXPORT_BULKING_STATUS",
  ],
  VIEWER: ["VIEW_TRANSACTIONS", "VIEW_PO_INTAKE", "CREATE_PO_INTAKE_TEST", "VIEW_SHIPMENTS", "VIEW_EXPORT_BULKING"],
  DOCS: ["VIEW_TRANSACTIONS", "VIEW_PO_INTAKE", "VIEW_SHIPMENTS", "VIEW_EXPORT_BULKING", "VIEW_EXPORT_DOCUMENTATION"],
  EXPORT_BULKING_OPERATION: [
    "VIEW_EXPORT_BULKING",
    "VIEW_EXPORT_DOCUMENTATION",
    "CREATE_EXPORT_BULKING",
    "UPDATE_EXPORT_OPERATIONS",
    "UPDATE_EXPORT_BULKING_STATUS",
  ],
  EXPORT_BULKING_DOCUMENTATION: ["VIEW_EXPORT_BULKING", "VIEW_EXPORT_DOCUMENTATION"],
  EXPORT_BULKING_LEAD_DOCUMENTATION: [
    "VIEW_EXPORT_BULKING",
    "VIEW_EXPORT_DOCUMENTATION",
    "UPDATE_EXPORT_DOCUMENTATION",
    "UPLOAD_DOCUMENT",
    "ASSIGN_EXPORT_BULKING_DOCUMENTATION",
  ],
} as const;

export function getRoleDefaultPermissionSet(role: string): ReadonlySet<string> {
  const key = role.trim().toUpperCase() as UserRoleOption;
  const list = ROLE_DEFAULT_PERMISSIONS[key] ?? [];
  return new Set(list);
}
