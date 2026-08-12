/**
 * Export bulking workspace helpers — Operations vs Documentation personas.
 */

import type { AuthUser } from "@/types/auth";
import type {
  ExportBulkingBacklogFilter,
  ExportBulkingListView,
} from "@/lib/export-bulking-backlog";

export const EXPORT_DOC_COLUMN_IDS = [
  "si_no",
  "invoice_no",
  "pl_no",
  "peb_no",
  "peb_date",
  "bl_no",
  "bl_date",
  "cargo_name",
] as const;

export const OPERATIONS_COLUMN_IDS = [
  "cargo_lines",
  "demurrage_rate",
  "laycan",
  "cargo_readiness",
] as const;

/** Default visible columns on the Operations list tab. */
export const OPERATIONS_LIST_COLUMN_IDS = [
  "shipment_no",
  "vessel",
  "voyage",
  "loadport",
  "progress",
  "status",
  "cargo_lines",
  "total_qty",
  "shipper",
  "laycan",
  "cargo_readiness",
  "demurrage_rate",
  "eta",
] as const;

/** Default visible columns on the Documentation list tab. */
export const DOCUMENTATION_LIST_COLUMN_IDS = [
  "shipment_no",
  "vessel",
  "voyage",
  "loadport",
  "progress",
  "status",
  "cargo_name",
  "total_qty",
  "pic_documentation",
  "si_no",
  "invoice_no",
  "pl_no",
  "peb_no",
  "peb_date",
  "bl_no",
  "bl_date",
] as const;

export const DOCUMENTATION_COLUMN_LABELS: Partial<Record<string, string>> = {
  pic_documentation: "PIC documentation",
  cargo_name: "Commodity",
  total_qty: "Quantity",
  vessel: "Vessel Name",
  voyage: "Voyage No.",
  si_no: "Shipping Instruction No.",
  invoice_no: "No Invoice",
  pl_no: "No Packing List",
  peb_no: "No PEB",
  peb_date: "PEB date",
  bl_no: "No BL",
  bl_date: "BL date",
};

const DOCUMENTATION_BACKLOG_FILTERS: ReadonlySet<ExportBulkingBacklogFilter> = new Set([
  "missing_si",
  "missing_invoice",
  "missing_pl",
  "docs_complete",
]);

export function isDocumentationBacklogFilter(
  filter: ExportBulkingBacklogFilter | null | undefined,
): boolean {
  return filter != null && DOCUMENTATION_BACKLOG_FILTERS.has(filter);
}

export function canViewExportDocumentation(user: AuthUser | null | undefined): boolean {
  return Boolean(user?.effective_permissions?.includes("VIEW_EXPORT_DOCUMENTATION"));
}

function hasPermission(user: AuthUser | null | undefined, permission: string): boolean {
  return Boolean(user?.effective_permissions?.includes(permission));
}

/** Edit voyage planning, nomination, loading, and status fields. */
export function canEditExportOperations(user: AuthUser | null | undefined): boolean {
  return (
    hasPermission(user, "UPDATE_EXPORT_OPERATIONS") || hasPermission(user, "UPDATE_EXPORT_BULKING")
  );
}

/** Edit cargo lines, SI, invoices, packing lists, B/L, PEB, and uploaded export documents. */
export function canEditExportDocumentation(user: AuthUser | null | undefined): boolean {
  return (
    hasPermission(user, "UPDATE_EXPORT_DOCUMENTATION") || hasPermission(user, "UPDATE_EXPORT_BULKING")
  );
}

/** Edit cargo lines — commodity and quantity (operations or documentation permission). */
export function canEditExportCargo(user: AuthUser | null | undefined): boolean {
  return canEditExportOperations(user) || canEditExportDocumentation(user);
}

/** Edit cargo line destination port, country, and PE fields (documentation team). */
export function canEditExportCargoDestinations(user: AuthUser | null | undefined): boolean {
  return canEditExportDocumentation(user);
}

/** Any export bulking edit (operations or documentation). */
export function canEditExportBulking(user: AuthUser | null | undefined): boolean {
  return canEditExportOperations(user) || canEditExportDocumentation(user);
}

export function isExportBulkingDocumentationOfficer(user: AuthUser | null | undefined): boolean {
  const role = user?.role?.trim().toUpperCase();
  return role === "EXPORT_BULKING_DOCUMENT" || role === "EXPORT_BULKING_DOCUMENTATION";
}

/** Docs persona: may view documentation; operational fields are read-only. */
export function isExportDocumentationOnly(user: AuthUser | null | undefined): boolean {
  return canViewExportDocumentation(user) && !canEditExportOperations(user);
}

/** Ops persona: may edit operations; documentation tab is read-only when viewable. */
export function isExportOperationsOnly(user: AuthUser | null | undefined): boolean {
  return canEditExportOperations(user) && !canEditExportDocumentation(user);
}

/** Header badge label when user has a single primary workspace. */
export function getExportWorkspaceBadge(user: AuthUser | null | undefined): string | null {
  if (isExportDocumentationOnly(user)) return "Documentation";
  if (isExportOperationsOnly(user)) return "Operations";
  const role = user?.role?.trim().toUpperCase();
  if (role === "EXPORT_BULKING_OPERATION") return "Operations";
  if (role === "EXPORT_BULKING_DOCUMENT" || role === "EXPORT_BULKING_DOCUMENTATION") return "Documentation";
  if (role === "EXPORT_BULKING_LEAD_DOCUMENTATION") return "Lead documentation";
  return null;
}

export function getAvailableBulkingListViews(
  user: AuthUser | null | undefined,
): ExportBulkingListView[] {
  const canUpdateOps = canEditExportOperations(user);
  const canUpdateDocs = canEditExportDocumentation(user);
  const views: ExportBulkingListView[] = [];
  if (canUpdateOps && canUpdateDocs) views.push("all");
  if (canUpdateOps) views.push("operations");
  if (canUpdateDocs) views.push("documentation");
  if (views.length > 0) return views;
  if (canViewExportDocumentation(user)) return ["documentation"];
  return ["operations"];
}

/** Resolve list view from URL, redirecting inaccessible views. */
export function resolveBulkingListView(
  viewFromUrl: ExportBulkingListView | null,
  user: AuthUser | null | undefined,
  defaultView: ExportBulkingListView,
): ExportBulkingListView {
  const requested = viewFromUrl ?? defaultView;
  const allowed = getAvailableBulkingListViews(user);
  if (allowed.includes(requested)) return requested;
  return allowed[0] ?? "operations";
}

export function expandRowAriaLabel(
  expanded: boolean,
  listView: ExportBulkingListView,
  canViewDocs: boolean,
): string {
  const docsPanel =
    listView === "documentation" || (listView === "all" && canViewDocs);
  if (docsPanel) {
    return expanded ? "Collapse row details" : "Expand row details";
  }
  return expanded ? "Collapse cargo" : "Expand cargo";
}

export function friendlyExportDetailError(message: string | null | undefined): string {
  if (!message?.trim()) return "Shipment not found.";
  if (/invalid input syntax for type uuid/i.test(message)) return "Shipment not found.";
  return message;
}

export type BulkingDetailLinkOptions = {
  /** List workspace the user navigated from — documentation opens the docs tab on detail. */
  listView?: ExportBulkingListView;
  mode?: "view" | "edit";
};

/** Detail page URL for a bulk shipment, preserving list workspace and view/edit mode. */
export function buildBulkingDetailUrl(
  shipmentId: string,
  options?: BulkingDetailLinkOptions,
): string {
  const params = new URLSearchParams();
  if (options?.listView === "documentation") {
    params.set("tab", "documentation");
  }
  if (options?.mode === "view") {
    params.set("mode", "view");
  }
  const qs = params.toString();
  return `/export/bulking/${shipmentId}${qs ? `?${qs}` : ""}`;
}

/** List page URL when returning from detail — keeps the active workspace tab. */
export function buildBulkingListReturnUrl(listView?: ExportBulkingListView): string {
  if (listView === "documentation" || listView === "operations") {
    return `/export/bulking?view=${listView}`;
  }
  return "/export/bulking";
}
