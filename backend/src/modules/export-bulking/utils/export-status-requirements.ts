/**
 * Export bulking status field requirements for API validation.
 * Mirrors frontEnd/lib/export-status-requirements.ts (keep in sync).
 */

import type { ExportBulkingStatus } from "../dto/index.js";

export type SiLineForRequirements = {
  cargo_line_id?: string | null;
  bl_split_qty?: number | null;
};

export type SiForRequirements = {
  messrs?: string | null;
  bill_of_lading_option?: string | null;
  consignee?: string | null;
  notify_party?: string | null;
  freight?: string | null;
  npwp?: string | null;
  bl_indicated?: string | null;
  lines?: SiLineForRequirements[];
};

export type ExportBulkingForStatusValidation = {
  current_status: string;
  loadport_name: string | null;
  total_quantity: number | null;
  received_nomination: string | null;
  received_shipping_instruction: string | null;
  incoterms?: string | null;
  laycan?: string | null;
  laycan_from?: string | null;
  laycan_to?: string | null;
  est_cargo_readiness: string | null;
  est_cargo_readiness_period?: string | null;
  eta: string | null;
  ata?: string | null;
  etb?: string | null;
  atb?: string | null;
  commence_loading?: string | null;
  etc?: string | null;
  atc?: string | null;
  td?: string | null;
  laytime_rate_mtph: number | null;
  demurrage_rate_pdpr: number | null;
  cargo_count?: number;
  cargo_lines?: { id: string }[];
  shipping_instructions?: SiForRequirements[];
};

export const EXPORT_STATUS_FIELD_LABELS: Record<string, string> = {
  total_quantity: "Total quantity (MT)",
  loadport_name: "Load port",
  has_cargo_lines: "At least one cargo line",
  received_nomination: "Received nomination",
  laycan: "Laycan",
  est_cargo_readiness: "Est. cargo readiness",
  eta: "ETA (estimated arrival)",
  laytime_rate_mtph: "Laytime rate (MT/PH)",
  demurrage_rate_pdpr: "Demurrage rate (PD/PR)",
  incoterms: "Incoterms",
  received_shipping_instruction: "Received shipping instruction",
  has_shipping_instructions: "At least one shipping instruction",
  si_messrs: "Messrs (shipping instruction)",
  si_bill_of_lading_option: "Bill of lading (shipping instruction)",
  si_consignee: "Consignee (shipping instruction)",
  si_notify_party: "Notify party (shipping instruction)",
  si_freight: "Freight (shipping instruction)",
  si_npwp: "NPWP (shipping instruction)",
  si_bl_indicated: "B/L indicated (shipping instruction)",
  si_cargo_lines: "Cargo lines with B/L split (shipping instruction)",
  ata: "ATA (actual arrival)",
  etb: "ETB (estimated berth)",
  atb: "ATB (actual berth)",
  commence_loading: "Commence loading",
  etc: "ETC (estimated completion)",
  atc: "ATC (actual completion)",
  td: "Time of departure",
};

const SI_HEADER_FIELD_KEYS = [
  "si_messrs",
  "si_bill_of_lading_option",
  "si_consignee",
  "si_notify_party",
  "si_freight",
  "si_npwp",
  "si_bl_indicated",
] as const;

const SI_KEY_TO_PROP: Record<(typeof SI_HEADER_FIELD_KEYS)[number], keyof SiForRequirements> = {
  si_messrs: "messrs",
  si_bill_of_lading_option: "bill_of_lading_option",
  si_consignee: "consignee",
  si_notify_party: "notify_party",
  si_freight: "freight",
  si_npwp: "npwp",
  si_bl_indicated: "bl_indicated",
};

/** Fields that must be satisfied while in `current` before moving to the next status. */
const REQUIREMENTS_BEFORE_ADVANCE: Record<ExportBulkingStatus, string[]> = {
  SHIPMENT_PLANNING: ["total_quantity", "loadport_name", "has_cargo_lines"],
  NOMINATION: [
    "received_nomination",
    "laycan",
    "est_cargo_readiness",
    "eta",
    "laytime_rate_mtph",
    "demurrage_rate_pdpr",
    "incoterms",
  ],
  SI_RECEIVE: [
    "received_shipping_instruction",
    "has_shipping_instructions",
    ...SI_HEADER_FIELD_KEYS,
    "si_cargo_lines",
  ],
  VOYAGE_OPERATIONS: [
    "eta",
    "ata",
    "etb",
    "atb",
    "laycan",
    "commence_loading",
    "etc",
    "atc",
    "td",
  ],
};

function hasCargoLines(data: ExportBulkingForStatusValidation): boolean {
  if (data.cargo_lines && data.cargo_lines.length > 0) return true;
  if (data.cargo_count != null && data.cargo_count > 0) return true;
  return false;
}

function siHeaderFieldSatisfied(key: (typeof SI_HEADER_FIELD_KEYS)[number], sis: SiForRequirements[]): boolean {
  const prop = SI_KEY_TO_PROP[key];
  return sis.every((si) => Boolean(String(si[prop] ?? "").trim()));
}

function siCargoLinesSatisfied(sis: SiForRequirements[]): boolean {
  return sis.every((si) =>
    (si.lines ?? []).some(
      (line) =>
        Boolean(line.cargo_line_id) &&
        line.bl_split_qty != null &&
        !Number.isNaN(Number(line.bl_split_qty)) &&
        Number(line.bl_split_qty) > 0,
    ),
  );
}

function fieldSatisfied(key: string, data: ExportBulkingForStatusValidation): boolean {
  const sis = data.shipping_instructions ?? [];

  switch (key) {
    case "loadport_name":
      return Boolean(data.loadport_name?.trim());
    case "total_quantity":
      return data.total_quantity != null && Number(data.total_quantity) > 0;
    case "has_cargo_lines":
      return hasCargoLines(data);
    case "received_nomination":
      return Boolean(data.received_nomination);
    case "laycan":
      return Boolean(data.laycan_from) && Boolean(data.laycan_to);
    case "est_cargo_readiness": {
      if (!data.est_cargo_readiness) return false;
      const p = (data.est_cargo_readiness_period ?? "").trim().toUpperCase();
      return p === "AM" || p === "PM";
    }
    case "eta":
      return Boolean(data.eta);
    case "laytime_rate_mtph":
      return data.laytime_rate_mtph != null && !Number.isNaN(Number(data.laytime_rate_mtph));
    case "demurrage_rate_pdpr":
      return data.demurrage_rate_pdpr != null && !Number.isNaN(Number(data.demurrage_rate_pdpr));
    case "incoterms":
      return Boolean(data.incoterms?.trim());
    case "received_shipping_instruction":
      return Boolean(data.received_shipping_instruction);
    case "has_shipping_instructions":
      return sis.length > 0;
    case "si_cargo_lines":
      return sis.length > 0 && siCargoLinesSatisfied(sis);
    case "ata":
      return Boolean(data.ata);
    case "etb":
      return Boolean(data.etb);
    case "atb":
      return Boolean(data.atb);
    case "commence_loading":
      return Boolean(data.commence_loading);
    case "etc":
      return Boolean(data.etc);
    case "atc":
      return Boolean(data.atc);
    case "td":
      return Boolean(data.td);
    default:
      if (key in SI_KEY_TO_PROP) {
        return sis.length > 0 && siHeaderFieldSatisfied(key as (typeof SI_HEADER_FIELD_KEYS)[number], sis);
      }
      return true;
  }
}

export function getFieldLabel(key: string): string {
  return EXPORT_STATUS_FIELD_LABELS[key] ?? key;
}

/** Missing requirement keys when advancing from current → next (single step). */
export function getMissingRequirementsForAdvance(data: ExportBulkingForStatusValidation): string[] {
  const current = data.current_status as ExportBulkingStatus;
  const required = REQUIREMENTS_BEFORE_ADVANCE[current] ?? [];
  return required.filter((key) => !fieldSatisfied(key, data));
}

export function getMissingRequirementLabels(data: ExportBulkingForStatusValidation): string[] {
  return getMissingRequirementsForAdvance(data).map(getFieldLabel);
}
