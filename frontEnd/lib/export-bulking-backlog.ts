/**
 * Export bulking backlog filters, view defaults, and ops/docs attention helpers.
 */

import type { AuthUser } from "@/types/auth";
import type { ExportBulkingListItem } from "@/types/export-bulking";
import { buildExportCompletionSummary, type ExportCompletionListInput } from "@/lib/export-bulking-completion";

export type ExportBulkingListView = "all" | "operations" | "documentation";

export type ExportBulkingBacklogFilter =
  | "missing_si"
  | "missing_invoice"
  | "missing_pl"
  | "docs_incomplete"
  | "docs_complete"
  | "eta_overdue";

export interface DocBacklogCounts {
  missingSi: number;
  missingInvoice: number;
  missingPl: number;
  docsComplete: number;
}

export function listItemToCompletionInput(row: ExportBulkingListItem): ExportCompletionListInput {
  return {
    current_status: row.current_status,
    vessel_name: row.vessel_name,
    voyage_number: row.voyage_number,
    shipper: row.shipper,
    loadport_name: row.loadport_name,
    total_quantity: row.total_quantity,
    received_nomination: row.received_nomination,
    eta: row.eta,
    ata: row.ata,
    td: row.td,
    cargo_count: row.cargo_count,
    si_numbers: row.si_numbers,
    invoice_numbers: row.invoice_numbers,
    pl_numbers: row.pl_numbers,
  };
}

function hasSi(row: ExportCompletionListInput): boolean {
  return (row.si_numbers?.length ?? 0) > 0;
}

function hasInvoice(row: ExportCompletionListInput): boolean {
  return (row.invoice_numbers?.length ?? 0) > 0;
}

function hasPl(row: ExportCompletionListInput): boolean {
  return (row.pl_numbers?.length ?? 0) > 0;
}

function docsComplete(row: ExportCompletionListInput): boolean {
  return hasSi(row) && hasInvoice(row) && hasPl(row);
}

export function isEtaOverdue(eta: string | null | undefined): boolean {
  if (!eta) return false;
  return new Date(eta).getTime() < Date.now();
}

export function computeDocBacklogCounts(rows: ExportBulkingListItem[]): DocBacklogCounts {
  let missingSi = 0;
  let missingInvoice = 0;
  let missingPl = 0;
  let complete = 0;

  for (const row of rows) {
    const input = listItemToCompletionInput(row);
    if (!hasSi(input)) missingSi++;
    if (!hasInvoice(input)) missingInvoice++;
    if (!hasPl(input)) missingPl++;
    if (docsComplete(input)) complete++;
  }

  return { missingSi, missingInvoice, missingPl, docsComplete: complete };
}

export function matchesBacklogFilter(
  row: ExportBulkingListItem,
  filter: ExportBulkingBacklogFilter,
): boolean {
  const input = listItemToCompletionInput(row);

  switch (filter) {
    case "missing_si":
      return !hasSi(input);
    case "missing_invoice":
      return !hasInvoice(input);
    case "missing_pl":
      return !hasPl(input);
    case "docs_incomplete":
      return !docsComplete(input);
    case "docs_complete":
      return docsComplete(input);
    case "eta_overdue":
      return isEtaOverdue(row.eta);
    default:
      return true;
  }
}

export const BACKLOG_FILTER_LABELS: Record<ExportBulkingBacklogFilter, string> = {
  missing_si: "Missing SI",
  missing_invoice: "Missing invoice",
  missing_pl: "Missing packing list",
  docs_incomplete: "Documents incomplete",
  docs_complete: "Documents complete",
  eta_overdue: "ETA overdue",
};

export function parseListView(raw: string | null | undefined): ExportBulkingListView | null {
  if (raw === "all" || raw === "operations" || raw === "documentation") return raw;
  return null;
}

export function parseBacklogFilter(raw: string | null | undefined): ExportBulkingBacklogFilter | null {
  if (!raw) return null;
  if (raw in BACKLOG_FILTER_LABELS) return raw as ExportBulkingBacklogFilter;
  return null;
}

export function getDefaultBulkingView(user: AuthUser | null | undefined): ExportBulkingListView {
  if (!user) return "all";
  const role = user.role.trim().toUpperCase();
  if (role === "DOCS") return "documentation";
  const perms = user.effective_permissions ?? [];
  const canUpdate = perms.includes("UPDATE_EXPORT_BULKING");
  const canViewDocs = perms.includes("VIEW_EXPORT_DOCUMENTATION");
  if (!canUpdate && canViewDocs) return "documentation";
  if (canUpdate) return "operations";
  return "all";
}

const VOYAGE_STATUSES = new Set(["ARRIVAL", "AT_BERTH", "LOADING", "NPE", "CASE_OFF"]);

export function getOpsAttentionReason(row: ExportBulkingListItem): string | null {
  const summary = buildExportCompletionSummary(listItemToCompletionInput(row));
  if (summary.isBusinessComplete) return null;

  const now = Date.now();
  if (row.eta) {
    const etaMs = new Date(row.eta).getTime();
    const days = (etaMs - now) / (1000 * 60 * 60 * 24);
    if (days < 0) return "ETA overdue";
    if (days <= 7) return "ETA within 7 days";
  }

  if ((row.cargo_count ?? 0) === 0) return "No cargo lines";
  if (!row.received_nomination && row.current_status === "NOMINATION") return "Nomination date missing";
  if (!row.td && row.current_status === "CASE_OFF") return "TD not recorded";
  if (VOYAGE_STATUSES.has(row.current_status) && !row.ata) return "ATA not recorded";

  if (summary.percent < 50) return "Early setup incomplete";

  return null;
}

export function getDocsAttentionReason(row: ExportBulkingListItem): string | null {
  const input = listItemToCompletionInput(row);
  const summary = buildExportCompletionSummary(input);
  if (summary.isBusinessComplete) return null;

  const inDocsOrVoyage =
    row.current_status === "SI_RECEIVE" || VOYAGE_STATUSES.has(row.current_status);

  if (!hasSi(input)) {
    if (inDocsOrVoyage) return "No shipping instruction";
    if (row.current_status !== "SHIPMENT_PLANNING") return "SI not recorded";
  }

  if (!hasInvoice(input) && inDocsOrVoyage) return "No invoice";
  if (!hasPl(input) && VOYAGE_STATUSES.has(row.current_status)) return "No packing list";
  if (!docsComplete(input) && VOYAGE_STATUSES.has(row.current_status)) return "Document set incomplete";

  return null;
}