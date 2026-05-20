/**
 * Process completion checklist for export bulking shipments.
 */

import { EXPORT_BULKING_STATUSES } from "@/types/export-bulking";
import type { ExportBulkingShipmentDetail } from "@/types/export-bulking";

export interface ExportCompletionCheckItem {
  id: string;
  label: string;
  done: boolean;
  hint?: string;
}

export interface ExportCompletionSummary {
  items: ExportCompletionCheckItem[];
  doneCount: number;
  totalCount: number;
  percent: number;
  isBusinessComplete: boolean;
}

export type ExportCompletionListInput = {
  current_status: string;
  vessel_name: string | null;
  voyage_number: string | null;
  shipper: string | null;
  loadport_name: string | null;
  total_quantity: number | null;
  received_nomination?: string | null;
  eta?: string | null;
  td?: string | null;
  cargo_count?: number;
  si_numbers?: string[] | null;
  invoice_numbers?: string[] | null;
  pl_numbers?: string[] | null;
};

function statusAtLeast(current: string, target: string): boolean {
  const ci = EXPORT_BULKING_STATUSES.indexOf(current as (typeof EXPORT_BULKING_STATUSES)[number]);
  const ti = EXPORT_BULKING_STATUSES.indexOf(target as (typeof EXPORT_BULKING_STATUSES)[number]);
  if (ci < 0 || ti < 0) return false;
  return ci >= ti;
}

function planningDone(d: ExportCompletionListInput): boolean {
  return (
    Boolean(d.vessel_name?.trim()) &&
    Boolean(d.voyage_number?.trim()) &&
    Boolean(d.shipper?.trim()) &&
    Boolean(d.loadport_name?.trim()) &&
    d.total_quantity != null &&
    Number(d.total_quantity) > 0 &&
    (d.cargo_count ?? 0) > 0
  );
}

function nominationDone(d: ExportCompletionListInput): boolean {
  return Boolean(d.received_nomination) || statusAtLeast(d.current_status, "NOMINATION");
}

function siDone(d: ExportCompletionListInput): boolean {
  return (d.si_numbers?.length ?? 0) > 0 || statusAtLeast(d.current_status, "SI_RECEIVE");
}

function voyageDone(d: ExportCompletionListInput): boolean {
  return statusAtLeast(d.current_status, "VOYAGE_OPERATIONS");
}

function docsDone(d: ExportCompletionListInput): boolean {
  return (
    (d.si_numbers?.length ?? 0) > 0 &&
    (d.invoice_numbers?.length ?? 0) > 0 &&
    (d.pl_numbers?.length ?? 0) > 0
  );
}

function businessComplete(d: ExportCompletionListInput): boolean {
  return voyageDone(d) && Boolean(d.td) && docsDone(d);
}

export function buildExportCompletionSummary(
  input: ExportCompletionListInput,
): ExportCompletionSummary {
  const items: ExportCompletionCheckItem[] = [
    {
      id: "planning",
      label: "Planning",
      done: planningDone(input),
      hint: "Vessel, shipper, load port, qty, cargo lines",
    },
    {
      id: "nomination",
      label: "Nomination",
      done: nominationDone(input),
      hint: "Received nomination recorded",
    },
    {
      id: "si",
      label: "Shipping instructions",
      done: siDone(input),
      hint: "At least one SI",
    },
    {
      id: "voyage",
      label: "Voyage / port ops",
      done: voyageDone(input),
      hint: "Status at voyage operations",
    },
    {
      id: "departure",
      label: "Time of departure (TD)",
      done: Boolean(input.td),
      hint: "Record TD in nomination section",
    },
    {
      id: "documents",
      label: "Documents set",
      done: docsDone(input),
      hint: "SI, invoice, and packing list",
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const totalCount = items.length;
  return {
    items,
    doneCount,
    totalCount,
    percent: totalCount ? Math.round((doneCount / totalCount) * 100) : 0,
    isBusinessComplete: businessComplete(input),
  };
}

export function detailToCompletionInput(d: ExportBulkingShipmentDetail): ExportCompletionListInput {
  return {
    current_status: d.current_status,
    vessel_name: d.vessel_name,
    voyage_number: d.voyage_number,
    shipper: d.shipper,
    loadport_name: d.loadport_name,
    total_quantity: d.total_quantity,
    received_nomination: d.received_nomination,
    eta: d.eta,
    td: d.td,
    cargo_count: d.cargo_lines.length,
    si_numbers: d.shipping_instructions.map((s) => s.si_number).filter(Boolean) as string[],
    invoice_numbers: d.invoices.map((i) => i.invoice_no).filter(Boolean) as string[],
    pl_numbers: d.packing_lists.map((p) => p.packing_list_number).filter(Boolean) as string[],
  };
}

export function listItemToCompletionInput(row: ExportCompletionListInput): ExportCompletionListInput {
  return row;
}
