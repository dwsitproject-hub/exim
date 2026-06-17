/**
 * Required fields per shipment status for status-update UX.
 * Before advancing **current → target**, only **current** status rules apply (fields + enforced docs).
 * Requirements for the **target** status are satisfied while that status is current, before the next move.
 *
 * Incoterm-based rules:
 * - EXW / FCA / FOB: BIDDING_TRANSPORTER exists in the chain.
 * - CFR / CIF / CPT / CIP / DAP / DPU / DDP: BIDDING_TRANSPORTER is skipped.
 *
 * **Ship by** when **Ship via** is **Sea**: required only when leaving **TRANSPORT_CONFIRMED** (not Initiate).
 *
 * **Single-step** forward (next status only): enforce **current** status fields + docs (+ `closed_at` when target is Delivered).
 * **Multi-skip**: enforce fields + docs for **every** status from current through target (inclusive on the applicable chain).
 */

import type { ShipmentDocumentListItem } from "@/types/shipments";
import { isPibTypeBc23, isPibTypeBc20, isPibTypeConsignmentNote } from "@/lib/pib-type-label";

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

/** Incoterms where buyer arranges transport: Bidding Transporter step exists and is validated */
export const INCOTERMS_WITH_BIDDING_TRANSPORTER = ["EXW", "FCA", "FOB"] as const;

/** Incoterms where other party arranges transport: Bidding Transporter skipped */
export const INCOTERMS_WITHOUT_BIDDING_TRANSPORTER = ["CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"] as const;

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

/**
 * Returns the list of statuses that apply for this shipment based on incoterm.
 * When incoterm is CFR/CIF/CPT/CIP/DAP/DPU/DDP, BIDDING_TRANSPORTER is excluded.
 */
export function getApplicableStatuses(incoterm: string | null | undefined): readonly string[] {
  if (hasBiddingTransporterStep(incoterm)) return SHIPMENT_STATUS_ORDER;
  return SHIPMENT_STATUS_ORDER.filter((s) => s !== "BIDDING_TRANSPORTER");
}

/** Human-readable field labels for missing-field messages */
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

/** Synthetic keys returned with field keys from getMissingRequiredDocuments (scroll + labels). */
export const STATUS_DOC_REQUIREMENT_LABELS: Record<string, string> = {
  "doc:po": "PO (one upload per group PO — Documents)",
  "doc:commercial_invoice": "Commercial Invoice (Documents)",
  "doc:packing_list": "Packing List (Documents)",
  "doc:bl": "Bill of Lading (Documents)",
  "doc:pib_bc": "PIB / BC (Documents)",
  "doc:sppb": "SPPB (Documents)",
  "doc:sppbmcp": "SPPBMCP (Documents)",
  "doc:vo": "VO (Documents — required at Ready Pickup when Surveyor is Yes)",
  "doc:billing": "Billing (Documents)",
  "doc:bpn": "BPN (Documents)",
  "doc:inbound_charge": "Inbound Charge (Documents)",
  "doc:bukti_bayar": "Bukti Bayar (Documents)",
};

/**
 * Required / optional documents per status for the status-update hint text.
 * Optional items are not enforced by getMissingRequiredDocuments.
 */
export const STATUS_REQUIRED_DOCS: Record<string, string[]> = {
  INITIATE_SHIPPING_DOCUMENT: ["PO", "Commercial Invoice", "Packing List"],
  BIDDING_TRANSPORTER: ["Quotation from each forwarder (optional)"],
  TRANSPORT_CONFIRMED: [],
  READY_PICKUP: ["VO (required when Surveyor is Yes)"],
  PICKED_UP: ["Laporan Surveyor (optional)"],
  ON_SHIPMENT: ["Bill of Lading", "COO (optional)", "Insurance (optional)"],
  /** Non–Consignment Note; Consignment Note hints are built in `getRequiredDocsForTransition`. */
  CUSTOMS_CLEARANCE: ["PIB / BC", "SPPB", "SPPBMCP (optional)"],
  DELIVERED: [],
};

export interface StatusRequirement {
  status: string;
  requiredFields: string[];
  requiredDocs: string[];
}

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

/**
 * Statuses strictly after current through target (inclusive of target), on the incoterm-applicable chain.
 * Validation uses **current** status only; this helper remains for callers that need the forward path.
 */
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
    out.push(applicable[i]);
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

/**
 * Required field keys before `currentStatus` → `targetStatus` (forward on the applicable chain).
 * Adjacent step: **current** only + `closed_at` if target is Delivered.
 * Multi-skip: union of requirements for every status from **current through target** inclusive.
 */
export function getRequiredFieldsForTransition(
  currentStatus: string,
  targetStatus: string,
  incoterm?: string | null,
  /** When PIB type is BC 2.3, BM rate is not required for customs clearance. */
  pibType?: string | null,
  /** Ship via: Ship by is required only when this is Sea. */
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

/**
 * Check which required fields are missing on the shipment detail for the given transition.
 * Uses detail.incoterm to apply incoterm-based rules (Bidding Transporter skip).
 */
export function getMissingRequiredFields(
  currentStatus: string,
  targetStatus: string,
  detail: {
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
    linked_pos?: unknown[];
  }
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
        if (!po || typeof po !== "object") return false;
        const lines = (po as { line_received?: unknown[] }).line_received;
        if (!Array.isArray(lines)) return false;
        return lines.some((line) => {
          if (!line || typeof line !== "object") return false;
          const qty = Number((line as { received_qty?: unknown }).received_qty);
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
          if (!po || typeof po !== "object") return false;
          const c = String((po as { currency?: unknown }).currency ?? "")
            .trim()
            .toUpperCase();
          return c === "IDR" || c === "RP";
        });
      if (allIdr) {
        continue;
      }
      /** One currency rate for the whole shipment group; any linked row may hold it. */
      const hasGroupFxRate =
        hasLinked &&
        linked.some((po) => {
          if (!po || typeof po !== "object") return false;
          const c = String((po as { currency?: unknown }).currency ?? "")
            .trim()
            .toUpperCase();
          if (c === "IDR" || c === "RP") return false;
          const raw = (po as { currency_rate?: unknown }).currency_rate;
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

function hasShipmentLevelCommercialInvoice(docs: ShipmentDocumentListItem[]): boolean {
  return docs.some(
    (d) =>
      d.document_type === "INVOICE" &&
      d.intake_id == null &&
      (d.status == null || d.status === "DRAFT" || d.status === "FINAL")
  );
}

function hasPackingListDoc(docs: ShipmentDocumentListItem[]): boolean {
  return docs.some((d) => d.document_type === "PACKING_LIST");
}

function hasBlDoc(docs: ShipmentDocumentListItem[]): boolean {
  return docs.some((d) => d.document_type === "BL");
}

function hasPibBcDoc(docs: ShipmentDocumentListItem[]): boolean {
  return docs.some((d) => d.document_type === "PIB_BC");
}

function hasSppbDoc(docs: ShipmentDocumentListItem[]): boolean {
  return docs.some((d) => d.document_type === "SPPB");
}

function hasSppbmcpDoc(docs: ShipmentDocumentListItem[]): boolean {
  return docs.some((d) => d.document_type === "SPPBMCP");
}

function hasVoDoc(docs: ShipmentDocumentListItem[]): boolean {
  return docs.some((d) => d.document_type === "VO");
}

function hasBillingDoc(docs: ShipmentDocumentListItem[]): boolean {
  return docs.some((d) => d.document_type === "BILLING");
}

function hasBpnDoc(docs: ShipmentDocumentListItem[]): boolean {
  return docs.some((d) => d.document_type === "BPN");
}

function hasInboundChargeDoc(docs: ShipmentDocumentListItem[]): boolean {
  return docs.some((d) => d.document_type === "INBOUND_CHARGE");
}

function hasBuktiBayarDoc(docs: ShipmentDocumentListItem[]): boolean {
  return docs.some((d) => d.document_type === "BUKTI_BAYAR");
}

function isSurveyorYes(surveyor: string | null | undefined): boolean {
  return (surveyor ?? "").trim() === "Yes";
}

function linkedPosMissingPoDoc(
  docs: ShipmentDocumentListItem[],
  linkedPos: { intake_id: string }[]
): boolean {
  return linkedPos.some(
    (po) => !docs.some((d) => d.document_type === "PO" && d.intake_id === po.intake_id)
  );
}

export type ShipmentDocumentValidationContext = {
  documents: ShipmentDocumentListItem[];
  linked_pos: { intake_id: string }[];
  /** Used for VO requirement at Ready Pickup when Surveyor is Yes. */
  surveyor: string | null;
  /** Customs clearance document set when PIB type is Consignment Note. */
  pib_type?: string | null;
};

function addEnforcedDocsForLifecycleStatus(
  missing: Set<string>,
  statusKey: string,
  docs: ShipmentDocumentListItem[],
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
      if (!hasInboundChargeDoc(docs)) missing.add("doc:inbound_charge");
      if (!hasBuktiBayarDoc(docs)) missing.add("doc:bukti_bayar");
    } else if (isPibTypeBc20(pibType)) {
      if (!hasPibBcDoc(docs)) missing.add("doc:pib_bc");
      if (!hasSppbDoc(docs)) missing.add("doc:sppb");
      if (!hasBillingDoc(docs)) missing.add("doc:billing");
      if (!hasBpnDoc(docs)) missing.add("doc:bpn");
    } else {
      if (!hasPibBcDoc(docs)) missing.add("doc:pib_bc");
      if (!hasSppbDoc(docs)) missing.add("doc:sppb");
    }
  }
}

/**
 * Enforced document uploads: same adjacency rule as `getRequiredFieldsForTransition`.
 */
export function getMissingRequiredDocuments(
  currentStatus: string,
  targetStatus: string,
  incoterm: string | null | undefined,
  ctx: ShipmentDocumentValidationContext
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

export function getRequiredDocsForStatus(status: string): string[] {
  return STATUS_REQUIRED_DOCS[status] ?? [];
}

function customsClearanceDocHintLines(pibType: string | null | undefined): string[] {
  if (isPibTypeConsignmentNote(pibType)) return ["SPPBMCP", "Inbound Charge", "Bukti Bayar"];
  if (isPibTypeBc20(pibType)) return ["PIB / BC", "SPPB", "Billing", "BPN"];
  return STATUS_REQUIRED_DOCS.CUSTOMS_CLEARANCE ?? [];
}

/** Hint list: **current** only if single-step; union of hints for every status on the path if multi-skip. */
export function getRequiredDocsForTransition(
  currentStatus: string,
  targetStatus: string,
  incoterm?: string | null,
  pibType?: string | null
): string[] {
  const applicable = getApplicableStatuses(incoterm);
  const current = statusIndexInList(currentStatus, applicable);
  const target = statusIndexInList(targetStatus, applicable);
  if (current === -1 || target === -1 || target <= current) return [];

  const singleStep = target === current + 1;
  const statusKeys = singleStep
    ? [currentStatus]
    : [...applicable.slice(current, target + 1)];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of statusKeys) {
    const lines = s === "CUSTOMS_CLEARANCE" ? customsClearanceDocHintLines(pibType) : (STATUS_REQUIRED_DOCS[s] ?? []);
    for (const line of lines) {
      if (!seen.has(line)) {
        seen.add(line);
        out.push(line);
      }
    }
  }
  return out;
}

export function getFieldLabel(fieldKey: string): string {
  if (fieldKey.startsWith("doc:")) {
    return STATUS_DOC_REQUIREMENT_LABELS[fieldKey] ?? fieldKey;
  }
  return STATUS_FIELD_LABELS[fieldKey] ?? fieldKey;
}


