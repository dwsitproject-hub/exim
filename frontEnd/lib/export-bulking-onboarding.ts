import { DEFAULT_AFTER_LOGIN_PATH } from "@/lib/constants";

const EXPORT_BULKING_ROLES = new Set([
  "EXPORT_BULKING_OPERATION",
  "EXPORT_BULKING_DOCUMENT",
  "EXPORT_BULKING_DOCUMENTATION",
  "EXPORT_BULKING_LEAD_DOCUMENTATION",
  "ADMIN_EXPORT",
]);

/** Landing path after a new export bulking user finishes password setup. */
export function getPostOnboardingPath(role: string | null | undefined): string {
  const key = role?.trim().toUpperCase() ?? "";
  if (EXPORT_BULKING_ROLES.has(key)) {
    return "/export/bulking";
  }
  return DEFAULT_AFTER_LOGIN_PATH;
}

export function isExportBulkingRole(role: string | null | undefined): boolean {
  return EXPORT_BULKING_ROLES.has(role?.trim().toUpperCase() ?? "");
}
