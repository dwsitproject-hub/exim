/**
 * Data SAP helpers — one SAP row per sales order (SO) on invoice lines.
 * SPR is stored once per shipment (export_bulking_shipments.spr), not per SO.
 */

import type { ExportBulkingShipmentDetail, Invoice, SapLine, SapLineUpsertPayload } from "@/types/export-bulking";

export function distinctSoNosFromShipment(
  shipment: Pick<ExportBulkingShipmentDetail, "invoices">,
): string[] {
  const seen = new Set<string>();
  for (const inv of shipment.invoices ?? []) {
    for (const ln of inv.lines ?? []) {
      const t = ln.so_no?.trim();
      if (t) seen.add(t);
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

export function distinctSoNosFromInvoices(invoices: Invoice[]): string[] {
  return distinctSoNosFromShipment({ invoices });
}

function sapLineComplete(line: SapLine | undefined): boolean {
  if (!line) return false;
  return (
    line.quantity_spb != null &&
    !Number.isNaN(Number(line.quantity_spb)) &&
    Boolean(line.spb?.trim()) &&
    Boolean(line.delivery_order_pgi?.trim())
  );
}

/** Shipment-level SPR; falls back to legacy per-line values if present. */
export function resolveShipmentSpr(
  shipment: Pick<ExportBulkingShipmentDetail, "spr" | "sap_lines">,
): string {
  const onShipment = shipment.spr?.trim();
  if (onShipment) return onShipment;
  for (const line of shipment.sap_lines ?? []) {
    const legacy = line.spr?.trim();
    if (legacy) return legacy;
  }
  return "";
}

/** True when every invoice SO has complete SAP fields and the shipment has SPR. */
export function isSapDataComplete(shipment: ExportBulkingShipmentDetail): boolean {
  const sos = distinctSoNosFromShipment(shipment);
  if (sos.length === 0) return false;
  if (!resolveShipmentSpr(shipment).trim()) return false;
  const bySo = new Map<string, SapLine>();
  for (const line of shipment.sap_lines ?? []) {
    const key = line.so_no.trim();
    if (key) bySo.set(key, line);
  }
  return sos.every((so) => sapLineComplete(bySo.get(so)));
}

export type SapLineDraft = {
  rowKey: string;
  id?: string;
  so_no: string;
  quantity_spb: string;
  spb: string;
  delivery_order_pgi: string;
};

export function buildSapLineDrafts(
  shipment: ExportBulkingShipmentDetail,
  formatQty: (value: number | null | undefined) => string,
): SapLineDraft[] {
  const sos = distinctSoNosFromShipment(shipment);
  const savedBySo = new Map<string, SapLine>();
  for (const line of shipment.sap_lines ?? []) {
    const key = line.so_no.trim();
    if (key) savedBySo.set(key, line);
  }
  return sos.map((so) => {
    const saved = savedBySo.get(so);
    return {
      rowKey: saved?.id ?? `so-${so}`,
      id: saved?.id,
      so_no: so,
      quantity_spb: formatQty(saved?.quantity_spb ?? null),
      spb: saved?.spb ?? "",
      delivery_order_pgi: saved?.delivery_order_pgi ?? "",
    };
  });
}

export function sapDraftsToUpsertPayload(
  drafts: SapLineDraft[],
  parseQty: (raw: string) => number | null,
): SapLineUpsertPayload[] {
  return drafts.map((row, idx) => ({
    id: row.id,
    so_no: row.so_no.trim(),
    line_order: idx + 1,
    quantity_spb: parseQty(row.quantity_spb),
    spb: row.spb.trim() || null,
    delivery_order_pgi: row.delivery_order_pgi.trim() || null,
  }));
}
