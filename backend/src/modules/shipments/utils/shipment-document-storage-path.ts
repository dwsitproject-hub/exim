/**
 * Filing plan on shared storage:
 * PT / Year (shipment) / Plant__{BC 2.0|BC 2.3|…} / Supplier__{PO…} / file
 *
 * Same plant + different PIB → different Plant__BC segment (PIB from shipment).
 * Multiple POs from one supplier → one folder; PO numbers concatenated (sorted).
 */

import type { PoIntakeRow } from "../../po-intake/dto/index.js";
import type { LinkedPoWithIntake } from "../repositories/shipment-po-mapping.repository.js";
import type { ShipmentRow } from "../dto/index.js";
import { pibTypeStorageFolderName } from "../../../shared/pib-type.js";

const MAX_SEGMENT = 120;

export interface FilingPathContext {
  pt: string | null;
  plant: string | null;
  supplierName: string;
  /** One or more PO numbers (same supplier); sorted unique */
  poNumbers: string[];
}

function segment(raw: string | null | undefined, fallback: string): string {
  const s = (raw != null ? String(raw) : "")
    .trim()
    .replace(/[/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, MAX_SEGMENT)
    .trim();
  return s || fallback;
}

function normalizeSupplier(s: string): string {
  return s.trim().toLowerCase();
}

/** Shipment “year” from ETD → ETA → created_at (UTC). */
function shipmentYearUtc(shipment: ShipmentRow): string {
  const d = shipment.etd ?? shipment.eta ?? shipment.created_at;
  return String(d.getUTCFullYear());
}

/**
 * Build filing context from optional intake row and active linked POs.
 * When several POs share the same supplier name, all their PO numbers are included (one folder).
 */
export function buildFilingPathContext(
  shipment: ShipmentRow,
  intakeRow: PoIntakeRow | null,
  linked: LinkedPoWithIntake[]
): FilingPathContext | null {
  if (intakeRow && linked.length === 0) {
    return {
      pt: intakeRow.pt,
      plant: intakeRow.plant,
      supplierName: intakeRow.supplier_name,
      poNumbers: [intakeRow.po_number].filter(Boolean),
    };
  }
  if (linked.length === 0) return null;

  const primarySupplier =
    intakeRow?.supplier_name?.trim() || linked[0]?.supplier_name?.trim() || "";
  const primaryNorm = primarySupplier ? normalizeSupplier(primarySupplier) : "";

  const sameSupplier = primaryNorm
    ? linked.filter((l) => normalizeSupplier(l.supplier_name) === primaryNorm)
    : linked;

  const source = sameSupplier.length > 0 ? sameSupplier : linked;
  const poNumbers = [
    ...new Set(source.map((r) => r.po_number.trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const pt = intakeRow?.pt ?? linked[0]?.pt ?? null;
  const plant = intakeRow?.plant ?? linked[0]?.plant ?? null;
  const supplierName =
    intakeRow?.supplier_name?.trim() ||
    linked[0]?.supplier_name?.trim() ||
    shipment.vendor_name?.trim() ||
    "";

  if (!supplierName && poNumbers.length === 0) return null;

  return {
    pt,
    plant,
    supplierName: supplierName || "NO_SUPPLIER",
    poNumbers: poNumbers.length > 0 ? poNumbers : [shipment.shipment_no],
  };
}

/**
 * Relative path (no leading slash) under STORAGE_LOCAL_PATH.
 */
export function buildShipmentDocumentDirectoryPrefix(
  shipment: ShipmentRow,
  ctx: FilingPathContext | null
): string {
  const year = shipmentYearUtc(shipment);
  const pt = ctx ? segment(ctx.pt, "_NO_PT") : "_NO_PT";

  const pibFolder = pibTypeStorageFolderName(shipment.pib_type);
  const plantBc = ctx
    ? `${segment(ctx.plant, "_NO_PLANT")}__${pibFolder}`
    : `_NO_PLANT__${pibFolder}`;

  const supplierPart = segment(ctx?.supplierName ?? null, "NO_SUPPLIER");
  const poPart = ctx?.poNumbers?.length
    ? ctx.poNumbers.map((p) => segment(p, "NO_PO")).join("_")
    : segment(shipment.shipment_no, "NO_SHIPMENT_NO");
  const supplierPo = `${supplierPart}__${poPart}`.slice(0, MAX_SEGMENT * 3);

  return [pt, year, plantBc, supplierPo].join("/");
}
