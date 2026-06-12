/**
 * Export bulking workspace helpers — Operations vs Documentation personas.
 */

import type { AuthUser } from "@/types/auth";
import type {
  ExportBulkingBacklogFilter,
  ExportBulkingListView,
} from "@/lib/export-bulking-backlog";

export const EXPORT_DOC_COLUMN_IDS = ["si_no", "invoice_no", "pl_no"] as const;

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

export function canEditExportBulking(user: AuthUser | null | undefined): boolean {
  return Boolean(user?.effective_permissions?.includes("UPDATE_EXPORT_BULKING"));
}

/** Docs-only: may view documentation but not edit operational fields. */
export function isExportDocumentationOnly(user: AuthUser | null | undefined): boolean {
  return canViewExportDocumentation(user) && !canEditExportBulking(user);
}

/** Ops-only: may edit operations but not view documentation detail. */
export function isExportOperationsOnly(user: AuthUser | null | undefined): boolean {
  return canEditExportBulking(user) && !canViewExportDocumentation(user);
}

/** Header badge label when user has a single primary workspace. */
export function getExportWorkspaceBadge(user: AuthUser | null | undefined): string | null {
  if (isExportDocumentationOnly(user)) return "Documentation";
  if (isExportOperationsOnly(user)) return "Operations";
  return null;
}

export function getAvailableBulkingListViews(
  user: AuthUser | null | undefined,
): ExportBulkingListView[] {
  const canViewDocs = canViewExportDocumentation(user);
  const canEdit = canEditExportBulking(user);
  const views: ExportBulkingListView[] = [];
  if (canViewDocs && canEdit) views.push("all");
  if (canEdit || !canViewDocs) views.push("operations");
  if (canViewDocs) views.push("documentation");
  if (views.length === 0) views.push("operations");
  return views;
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
