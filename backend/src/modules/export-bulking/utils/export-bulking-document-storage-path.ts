/**
 * Export bulking document filing: Export / bulking / Year / ShipmentNo / document_type
 */

import {
  EXPORT_BULKING_STORAGE_ROOT,
  EXPORT_STORAGE_ROOT,
} from "../../../shared/storage/trade-flow-folders.js";

const MAX_SEGMENT = 120;

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

function shipmentYearUtc(createdAt: Date, eta: string | null | undefined): string {
  if (eta) {
    const d = new Date(eta);
    if (!Number.isNaN(d.getTime())) return String(d.getUTCFullYear());
  }
  return String(createdAt.getUTCFullYear());
}

export function buildExportBulkingDocumentDirectoryPrefix(input: {
  shipment_no: string;
  created_at: Date;
  eta?: string | null;
  document_type: string;
}): string {
  const year = shipmentYearUtc(input.created_at, input.eta ?? null);
  const shipmentSeg = segment(input.shipment_no, "NO_SHIPMENT");
  const typeSeg = segment(input.document_type, "OTHER");
  return [EXPORT_STORAGE_ROOT, EXPORT_BULKING_STORAGE_ROOT, year, shipmentSeg, typeSeg].join("/");
}
