/**
 * Shipment status field + document requirements for API validation.
 * Mirrors frontEnd/lib/shipment-status-requirements.ts (keep in sync).
 * Single-step: **current** fields + docs (+ `closed_at` if target Delivered). Multi-skip: union current…target inclusive.
 * **Ship by** (Sea): only when leaving TRANSPORT_CONFIRMED, not Initiate.
 */

import { isPibTypeBc23, isPibTypeConsignmentNote } from "../../../shared/pib-type.js";

export const SHIPMENT_STATUS_ORDER = [
  "INITIATE_SHIPPING_DOCUMENT",
  "BIDDING_TRANSPORTER",
  "TRANSPORT_CONFIRMED",
  "READY_PICKUP",
  "PICKED_UP",
  "ON_SHIPMENT",
  "CUSTOMS_CLEARANCE",
  "DELIVERED",
] as const;

const INCOTERMS_WITH_BIDDING_TRANSPORTER = ["EXW", "FCA", "FOB"] as const;

function normalizeIncoterm(incoterm: string | null | undefined): string {
  return (incoterm ?? "").trim().toUpperCase();
}

function hasBiddingTransporterStep(incoterm: string | null | undefined): boolean {
  const n = normalizeIncoterm(incoterm);
  return INCOTERMS_WITH_BIDDING_TRANSPORTER.includes(n as (typeof INCOTERMS_WITH_BIDDING_TRANSPORTER)[number]);
}

/** Ship by (Bulk / LCL / FCL) applies to Sea only; Air does not use Ship by. */
export function isShipmentMethodSea(shipmentMethod: string | null | undefined): boolean {
  return (shipmentMethod ?? "").trim().toUpperCase() === "SEA";
}

export function getApplicableStatuses(incoterm: string | null | undefined): readonly string[] {
  if (hasBiddingTransporterStep(incoterm)) return SHIPMENT_STATUS_ORDER;
  return SHIPMENT_STATUS_ORDER.filter((s) => s !== "BIDDING_TRANSPORTER");
}

/** Human-readable labels for errors (aligned with frontEnd STATUS_FIELD_LABELS / STATUS_DOC_REQUIREMENT_LABELS). */
export const STATUS_FIELD_LABELS: Record<string, string> = {
  ship_by: "Ship by",
  pib_type: "PIB type",
  no_request_pib: "PIB Doc No",
  ppjk_mkl: "PPJK/EMKL",
  nopen: "Nopen",
  nopen_date: "Nopen Date",
  coo: "COO (Certificate of Origin)",
  origin_port_name: "Origin port name",
  origin_port_country: "Origin port country",
  etd: "ETD (Est. time departure)",
  eta: "ETA (Est. time arrival)",
  forwarder_name: "Forwarder / liner",
  shipment_method: "Ship via (Air / Sea)",
  destination_port_name: "Destination port name",
  destination_port_country: "Destination port country",
  atd: "ATD (actual departure)",
  ata: "ATA (actual arrival)",
  depo: "Depo",
  depo_location: "Depo location",
  bl_awb: "BL/AWB",
  has_linked_po: "At least one PO in the group",
  has_bidding_participant: "At least one Forwarder Bidding participant",
  has_received_this_shipment: "Delivered Qty on group PO lines",
  has_currency_rate: "Currency rate on group PO",
  line_duty_percentages: "BM%, PPN%, and PPH% on each delivered line item",
  closed_at: "Delivered at",
  incoterm_amount: "Freight charges",
  product_classification: "Product classification type",
  surveyor: "Surveyor",
};

const STATUS_DOC_LABELS: Record<string, string> = {
  "doc:po": "PO (one upload per group PO — Documents)",
  "doc:commercial_invoice": "Commercial Invoice (Documents)",
  "doc:packing_list": "Packing List (Documents)",
  "doc:bl": "Bill of Lading (Documents)",
  "doc:pib_bc": "PIB / BC (Documents)",
  "doc:sppb": "SPPB (Documents)",
  "doc:sppbmcp": "SPPBMCP (Documents)",
  "doc:vo": "VO (Documents — required at Ready Pickup when Surveyor is Yes)",
};

const STATUS_REQUIRED_DOCS: Record<string, string[]> = {
  INITIATE_SHIPPING_DOCUMENT: ["PO", "Commercial Invoice", "Packing List"],
  BIDDING_TRANSPORTER: ["Quotation from each forwarder (optional)"],
  TRANSPORT_CONFIRMED: [],
  READY_PICKUP: ["VO (required when Surveyor is Yes)"],
  PICKED_UP: ["Laporan Surveyor (optional)"],
  ON_SHIPMENT: ["Bill of Lading", "COO (optional)", "Insurance (optional)"],
  /** Hints for non–Consignment Note; Consignment Note uses dynamic list in UI (SPPBMCP only). */
  CUSTOMS_CLEARANCE: ["PIB / BC", "SPPB", "SPPBMCP (optional)"],
  DELIVERED: [],
};

type StatusRequirement = { status: string; requiredFields: string[]; requiredDocs: string[] };

const STATUS_REQUIREMENTS: Record<string, StatusRequirement> = {
  INITIATE_SHIPPING_DOCUMENT: {
    status: "INITIATE_SHIPPING_DOCUMENT",
    requiredFields: [
      "pib_type",
      "origin_port_name",
      "origin_port_country",
      "etd",
      "eta",
      "product_classification",
      "depo",
      "surveyor",
    ],
    requiredDocs: STATUS_REQUIRED_DOCS.INITIATE_SHIPPING_DOCUMENT,
  },
  BIDDING_TRANSPORTER: {
    status: "BIDDING_TRANSPORTER",
    requiredFields: ["has_bidding_participant"],
    requiredDocs: STATUS_REQUIRED_DOCS.BIDDING_TRANSPORTER,
  },
  TRANSPORT_CONFIRMED: {
    status: "TRANSPORT_CONFIRMED",
    requiredFields: ["forwarder_name", "incoterm_amount", "shipment_method"],
    requiredDocs: [],
  },
  READY_PICKUP: {
    status: "READY_PICKUP",
    requiredFields: [],
    requiredDocs: STATUS_REQUIRED_DOCS.READY_PICKUP,
  },
  PICKED_UP: {
    status: "PICKED_UP",
    requiredFields: ["atd", "has_linked_po", "has_received_this_shipment"],
    requiredDocs: STATUS_REQUIRED_DOCS.PICKED_UP,
  },
  ON_SHIPMENT: {
    status: "ON_SHIPMENT",
    requiredFields: ["bl_awb", "no_request_pib", "ppjk_mkl"],
    requiredDocs: STATUS_REQUIRED_DOCS.ON_SHIPMENT,
  },
  CUSTOMS_CLEARANCE: {
    status: "CUSTOMS_CLEARANCE",
    requiredFields: ["ata", "nopen", "nopen_date", "has_currency_rate", "line_duty_percentages"],
    requiredDocs: STATUS_REQUIRED_DOCS.CUSTOMS_CLEARANCE,
  },
  DELIVERED: {
    status: "DELIVERED",
    requiredFields: ["closed_at"],
    requiredDocs: [],
  },
};

function statusIndexInList(status: string, list: readonly string[]): number {
  const i = list.indexOf(status);
  return i === -1 ? -1 : i;
}

/** Statuses after current through target (inclusive); validation uses current status only. */
export function getStatusesRequiredForTransition(
  currentStatus: string,
  targetStatus: string,
  incoterm?: string | null
): string[] {
  const applicable = getApplicableStatuses(incoterm);
  const current = statusIndexInList(currentStatus, applicable);
  const target = statusIndexInList(targetStatus, applicable);
  if (current === -1 || target === -1 || target <= current) return [];
  const out: string[] = [];
  for (let i = current + 1; i <= target; i++) {
    const s = applicable[i];
    if (s) out.push(s);
  }
  return out;
}

function addRequiredFieldsForLifecycleStatus(
  set: Set<string>,
  statusKey: string,
  incoterm: string | null | undefined,
  pibType: string | null | undefined,
  shipmentMethod: string | null | undefined
): void {
  const biddingStepApplies = hasBiddingTransporterStep(incoterm);
  const skipBmForBc23 = isPibTypeBc23(pibType);
  const req = STATUS_REQUIREMENTS[statusKey];
  if (!req) return;
  for (const f of req.requiredFields) {
    if (f === "has_bidding_participant") {
      if (!biddingStepApplies || statusKey !== "BIDDING_TRANSPORTER") continue;
    }
    if (f === "line_duty_percentages" && skipBmForBc23) continue;
    if (
      (f === "forwarder_name" || f === "incoterm_amount" || f === "shipment_method") &&
      statusKey !== "TRANSPORT_CONFIRMED"
    ) {
      continue;
    }
    set.add(f);
  }
  if (statusKey === "TRANSPORT_CONFIRMED" && isShipmentMethodSea(shipmentMethod)) {
    set.add("ship_by");
  }
}

export function getRequiredFieldsForTransition(
  currentStatus: string,
  targetStatus: string,
  incoterm?: string | null,
  pibType?: string | null,
  shipmentMethod?: string | null
): string[] {
  const applicable = getApplicableStatuses(incoterm);
  const current = statusIndexInList(currentStatus, applicable);
  const target = statusIndexInList(targetStatus, applicable);
  if (current === -1 || target === -1 || target <= current) return [];

  const set = new Set<string>();
  const singleStep = target === current + 1;

  if (singleStep) {
    addRequiredFieldsForLifecycleStatus(set, currentStatus, incoterm, pibType, shipmentMethod);
    if (targetStatus === "DELIVERED") {
      const delivered = STATUS_REQUIREMENTS.DELIVERED;
      if (delivered) {
        for (const f of delivered.requiredFields) set.add(f);
      }
    }
  } else {
    for (const s of applicable.slice(current, target + 1)) {
      addRequiredFieldsForLifecycleStatus(set, s, incoterm, pibType, shipmentMethod);
    }
  }
  return Array.from(set);
}

export interface ShipmentDetailForStatusValidation {
  incoterm?: string | null;
  ship_by?: string | null;
  pib_type?: string | null;
  no_request_pib?: string | null;
  ppjk_mkl?: string | null;
  nopen?: string | null;
  nopen_date?: string | null;
  coo?: string | null;
  origin_port_name?: string | null;
  origin_port_country?: string | null;
  etd?: string | null;
  eta?: string | null;
  forwarder_name?: string | null;
  shipment_method?: string | null;
  destination_port_name?: string | null;
  destination_port_country?: string | null;
  surveyor?: string | null;
  bl_awb?: string | null;
  atd?: string | null;
  ata?: string | null;
  depo?: boolean | null;
  product_classification?: string | null;
  closed_at?: string | null;
  incoterm_amount?: number | null;
  bids?: unknown[];
  linked_pos?: Array<{
    intake_id: string;
    currency?: string | null;
    currency_rate?: number | null;
    line_received?: Array<{
      received_qty?: number;
      bm_percentage?: number | null;
      ppn_percentage?: number | null;
      pph_percentage?: number | null;
    }>;
  }>;
}

export function getMissingRequiredFields(
  currentStatus: string,
  targetStatus: string,
  detail: ShipmentDetailForStatusValidation
): string[] {
  const required = getRequiredFieldsForTransition(
    currentStatus,
    targetStatus,
    detail.incoterm,
    detail.pib_type,
    detail.shipment_method
  );
  const missing: string[] = [];
  for (const key of required) {
    if (key === "has_linked_po") {
      const count = detail.linked_pos?.length ?? 0;
      if (count < 1) missing.push(key);
      continue;
    }
    if (key === "has_bidding_participant") {
      const bidCount = detail.bids?.length ?? 0;
      if (bidCount < 1) missing.push(key);
      continue;
    }
    if (key === "has_received_this_shipment") {
      const linked = Array.isArray(detail.linked_pos) ? detail.linked_pos : [];
      const hasReceived = linked.some((po) => {
        const lines = po.line_received;
        if (!Array.isArray(lines)) return false;
        return lines.some((line) => {
          const qty = Number(line.received_qty);
          return Number.isFinite(qty) && qty > 0;
        });
      });
      if (!hasReceived) missing.push(key);
      continue;
    }
    if (key === "has_currency_rate") {
      const linked = Array.isArray(detail.linked_pos) ? detail.linked_pos : [];
      const hasLinked = linked.length > 0;
      const allIdr =
        hasLinked &&
        linked.every((po) => {
          const c = String(po.currency ?? "")
            .trim()
            .toUpperCase();
          return c === "IDR" || c === "RP";
        });
      if (allIdr) continue;
      /** Group uses one FX rate (same on every mapping row when saved); any row with a rate satisfies. */
      const hasGroupFxRate =
        hasLinked &&
        linked.some((po) => {
          const c = String(po.currency ?? "")
            .trim()
            .toUpperCase();
          if (c === "IDR" || c === "RP") return false;
          const raw = po.currency_rate;
          const n = Number(raw);
          return Number.isFinite(n) && n > 0;
        });
      if (!hasGroupFxRate) missing.push(key);
      continue;
    }
    if (key === "incoterm_amount") {
      const v = detail.incoterm_amount;
      if (v == null || !Number.isFinite(Number(v))) missing.push(key);
      continue;
    }
    if (key === "line_duty_percentages") {
      const linked = Array.isArray(detail.linked_pos) ? detail.linked_pos : [];
      let incomplete = false;
      outer: for (const po of linked) {
        if (!po || typeof po !== "object") continue;
        const lines = (po as { line_received?: unknown[] }).line_received;
        if (!Array.isArray(lines)) continue;
        for (const line of lines) {
          if (!line || typeof line !== "object") continue;
          const qty = Number((line as { received_qty?: unknown }).received_qty);
          if (!Number.isFinite(qty) || qty <= 0) continue;
          const bm = (line as { bm_percentage?: unknown }).bm_percentage;
          const ppn = (line as { ppn_percentage?: unknown }).ppn_percentage;
          const pph = (line as { pph_percentage?: unknown }).pph_percentage;
          const ok = (v: unknown) => v != null && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100;
          if (!ok(bm) || !ok(ppn) || !ok(pph)) {
            incomplete = true;
            break outer;
          }
        }
      }
      if (incomplete) missing.push(key);
      continue;
    }
    const value = (detail as Record<string, unknown>)[key];
    if (value == null || (typeof value === "string" && value.trim() === "")) {
      missing.push(key);
    }
  }
  return missing;
}

export interface DocumentRowForValidation {
  document_type: string;
  status: string | null;
  intake_id: string | null;
}

function hasShipmentLevelCommercialInvoice(docs: DocumentRowForValidation[]): boolean {
  return docs.some(
    (d) =>
      d.document_type === "INVOICE" &&
      d.intake_id == null &&
      (d.status == null || d.status === "DRAFT" || d.status === "FINAL")
  );
}

function hasPackingListDoc(docs: DocumentRowForValidation[]): boolean {
  return docs.some((d) => d.document_type === "PACKING_LIST");
}

function hasBlDoc(docs: DocumentRowForValidation[]): boolean {
  return docs.some((d) => d.document_type === "BL");
}

function hasPibBcDoc(docs: DocumentRowForValidation[]): boolean {
  return docs.some((d) => d.document_type === "PIB_BC");
}

function hasSppbDoc(docs: DocumentRowForValidation[]): boolean {
  return docs.some((d) => d.document_type === "SPPB");
}

function hasSppbmcpDoc(docs: DocumentRowForValidation[]): boolean {
  return docs.some((d) => d.document_type === "SPPBMCP");
}

function hasVoDoc(docs: DocumentRowForValidation[]): boolean {
  return docs.some((d) => d.document_type === "VO");
}

function isSurveyorYes(surveyor: string | null | undefined): boolean {
  return (surveyor ?? "").trim() === "Yes";
}

function linkedPosMissingPoDoc(docs: DocumentRowForValidation[], linkedPos: { intake_id: string }[]): boolean {
  return linkedPos.some((po) => !docs.some((d) => d.document_type === "PO" && d.intake_id === po.intake_id));
}

function addEnforcedDocsForLifecycleStatus(
  missing: Set<string>,
  statusKey: string,
  docs: DocumentRowForValidation[],
  linked: { intake_id: string }[],
  surveyor: string | null,
  pibType: string | null | undefined
): void {
  if (statusKey === "INITIATE_SHIPPING_DOCUMENT") {
    if (linked.length > 0 && linkedPosMissingPoDoc(docs, linked)) {
      missing.add("doc:po");
    }
    if (!hasShipmentLevelCommercialInvoice(docs)) {
      missing.add("doc:commercial_invoice");
    }
    if (!hasPackingListDoc(docs)) {
      missing.add("doc:packing_list");
    }
  }
  if (statusKey === "READY_PICKUP" && isSurveyorYes(surveyor)) {
    if (!hasVoDoc(docs)) missing.add("doc:vo");
  }
  if (statusKey === "ON_SHIPMENT") {
    if (!hasBlDoc(docs)) missing.add("doc:bl");
  }
  if (statusKey === "CUSTOMS_CLEARANCE") {
    if (isPibTypeConsignmentNote(pibType)) {
      if (!hasSppbmcpDoc(docs)) missing.add("doc:sppbmcp");
    } else {
      if (!hasPibBcDoc(docs)) missing.add("doc:pib_bc");
      if (!hasSppbDoc(docs)) missing.add("doc:sppb");
    }
  }
}

export function getMissingRequiredDocuments(
  currentStatus: string,
  targetStatus: string,
  incoterm: string | null | undefined,
  ctx: {
    documents: DocumentRowForValidation[];
    linked_pos: { intake_id: string }[];
    surveyor: string | null;
    pib_type?: string | null;
  }
): string[] {
  const applicable = getApplicableStatuses(incoterm);
  const current = statusIndexInList(currentStatus, applicable);
  const target = statusIndexInList(targetStatus, applicable);
  if (current === -1 || target === -1 || target <= current) return [];

  const missing = new Set<string>();
  const docs = ctx.documents ?? [];
  const linked = ctx.linked_pos ?? [];
  const singleStep = target === current + 1;

  const pibType = ctx.pib_type;
  if (singleStep) {
    addEnforcedDocsForLifecycleStatus(missing, currentStatus, docs, linked, ctx.surveyor, pibType);
  } else {
    for (const s of applicable.slice(current, target + 1)) {
      addEnforcedDocsForLifecycleStatus(missing, s, docs, linked, ctx.surveyor, pibType);
    }
  }

  return Array.from(missing);
}

export function getFieldLabel(fieldKey: string): string {
  if (fieldKey.startsWith("doc:")) {
    return STATUS_DOC_LABELS[fieldKey] ?? fieldKey;
  }
  return STATUS_FIELD_LABELS[fieldKey] ?? fieldKey;
}

/** True when shipment is at CUSTOMS_CLEARANCE or DELIVERED (currency rate rules). */
export function isAtOrPastCustomsClearance(currentStatus: string): boolean {
  const customsIdx = SHIPMENT_STATUS_ORDER.indexOf("CUSTOMS_CLEARANCE");
  const idx = SHIPMENT_STATUS_ORDER.indexOf(currentStatus as (typeof SHIPMENT_STATUS_ORDER)[number]);
  return customsIdx >= 0 && idx >= customsIdx;
}


