import { displayPibTypeLabel, isPibTypeBc23 } from "../../../shared/pib-type.js";
import { normalizeProductClassificationForApi } from "../../../shared/product-classification.js";
import type { ShipmentListLinkedPo, ShipmentListPoLineItem, ShipmentRow } from "../dto/index.js";

export type ShipmentExportSource = {
  shipment: ShipmentRow;
  linked_pos: ShipmentListLinkedPo[];
};

function csvField(value: string | number | boolean | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatStatusLabel(status: string | null | undefined): string {
  const raw = status?.trim() ?? "";
  if (!raw) return "";
  return raw
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

function ymd(value: Date | string | null | undefined): string {
  if (value == null) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  return s ? s.slice(0, 10) : "";
}

function iso(value: Date | string | null | undefined): string {
  if (value == null) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return value.toISOString();
  }
  return String(value).trim();
}

function yesNo(value: boolean | null | undefined): string {
  if (value == null) return "";
  return value ? "Yes" : "No";
}

function num(value: number | string | null | undefined): string {
  if (value == null || value === "") return "";
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

function joinUnique(values: Array<string | null | undefined>): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw?.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out.join("; ");
}

function formatUnits(row: ShipmentRow): string {
  const inch = "\u2033";
  const sb = (row.ship_by ?? "").trim();
  if (sb === "Bulk") return "";
  if (sb === "LCL") {
    const parts: string[] = [];
    if (row.package_count != null) parts.push(`${row.package_count} packages`);
    if (row.cbm != null) parts.push(`${row.cbm} m³`);
    return parts.join(", ");
  }
  if (sb === "FCL") {
    const parts: string[] = [];
    if (row.unit_20ft === true) {
      parts.push(`20${inch}${row.container_count_20ft != null ? ` × ${row.container_count_20ft}` : ""}`.trim());
    }
    if (row.unit_40ft === true) {
      parts.push(`40${inch}${row.container_count_40ft != null ? ` × ${row.container_count_40ft}` : ""}`.trim());
    }
    if (row.unit_20_iso_tank === true) {
      parts.push(
        `20${inch} ISO Tank${row.container_count_20_iso_tank != null ? ` × ${row.container_count_20_iso_tank}` : ""}`.trim()
      );
    }
    if (row.unit_40_hc === true) {
      parts.push(`40 HC${row.container_count_40_hc != null ? ` × ${row.container_count_40_hc}` : ""}`.trim());
    }
    if (row.unit_20_fr === true) {
      parts.push(`20 FR${row.container_count_20_fr != null ? ` × ${row.container_count_20_fr}` : ""}`.trim());
    }
    if (row.unit_40_fr === true) {
      parts.push(`40 FR${row.container_count_40_fr != null ? ` × ${row.container_count_40_fr}` : ""}`.trim());
    }
    return parts.join(", ");
  }
  return "";
}

function formatPoLine(poNumber: string, item: ShipmentListPoLineItem): string {
  const parts = [
    poNumber,
    item.item_description?.trim() || "",
    item.qty_po != null ? `qty PO ${item.qty_po}` : "",
    item.delivery_qty != null ? `delivered ${item.delivery_qty}` : "",
    item.unit?.trim() || "",
    item.bm_percentage != null ? `BM ${item.bm_percentage}%` : "",
    item.ppn_percentage != null ? `PPN ${item.ppn_percentage}%` : "",
    item.pph_percentage != null ? `PPH ${item.pph_percentage}%` : "",
  ].filter(Boolean);
  return parts.join(" | ");
}

function formatPoLines(linked: ShipmentListLinkedPo[]): string {
  const lines: string[] = [];
  for (const po of linked) {
    const items = po.items ?? [];
    if (items.length === 0) {
      lines.push(po.po_number);
      continue;
    }
    for (const item of items) {
      lines.push(formatPoLine(po.po_number, item));
    }
  }
  return lines.join(" || ");
}

function dutyAmounts(row: ShipmentRow): { bm: number; ppn: number; pph: number; pdri: number } {
  if (isPibTypeBc23(row.pib_type)) return { bm: 0, ppn: 0, pph: 0, pdri: 0 };
  const bm = Number(row.bm ?? 0) || 0;
  const ppn = Number(row.ppn_amount ?? 0) || 0;
  const pph = Number(row.pph_amount ?? 0) || 0;
  return { bm, ppn, pph, pdri: bm + ppn + pph };
}

type Col = { header: string; value: (src: ShipmentExportSource) => string | number | boolean | null | undefined };

const COLUMNS: Col[] = [
  { header: "PT", value: ({ linked_pos }) => linked_pos[0]?.pt },
  { header: "Plant", value: ({ linked_pos }) => linked_pos[0]?.plant },
  { header: "Shipment number", value: ({ shipment }) => shipment.shipment_no },
  { header: "Status", value: ({ shipment }) => formatStatusLabel(shipment.current_status) },
  { header: "Created at", value: ({ shipment }) => iso(shipment.created_at) },
  { header: "Updated at", value: ({ shipment }) => iso(shipment.updated_at) },
  {
    header: "PIC",
    value: ({ linked_pos }) => linked_pos.find((p) => p.taken_by_name?.trim())?.taken_by_name ?? "",
  },
  { header: "Vendor / supplier", value: ({ shipment }) => shipment.vendor_name },
  { header: "Vendor code", value: ({ shipment }) => shipment.vendor_code },
  { header: "Forwarder / liner", value: ({ shipment }) => shipment.forwarder_name },
  { header: "Forwarder code", value: ({ shipment }) => shipment.forwarder_code },
  { header: "Delivery address", value: ({ shipment }) => shipment.warehouse_name },
  { header: "Origin port name", value: ({ shipment }) => shipment.origin_port_name },
  { header: "Origin port country", value: ({ shipment }) => shipment.origin_port_country },
  { header: "Origin port code", value: ({ shipment }) => shipment.origin_port_code },
  {
    header: "Product classification type",
    value: ({ shipment }) => normalizeProductClassificationForApi(shipment.product_classification),
  },
  { header: "Incoterm", value: ({ shipment }) => shipment.incoterm },
  { header: "Kawasan berikat", value: ({ shipment }) => shipment.kawasan_berikat },
  { header: "Surveyor", value: ({ shipment }) => shipment.surveyor },
  { header: "Ship via", value: ({ shipment }) => shipment.shipment_method },
  { header: "Ship by", value: ({ shipment }) => shipment.ship_by },
  { header: "Unit", value: ({ shipment }) => formatUnits(shipment) },
  { header: "Number of packages", value: ({ shipment }) => num(shipment.package_count) },
  { header: "CBM (m³)", value: ({ shipment }) => num(shipment.cbm) },
  { header: '20"', value: ({ shipment }) => yesNo(shipment.unit_20ft) },
  { header: 'Number of 20" containers', value: ({ shipment }) => num(shipment.container_count_20ft) },
  { header: '40"', value: ({ shipment }) => yesNo(shipment.unit_40ft) },
  { header: 'Number of 40" containers', value: ({ shipment }) => num(shipment.container_count_40ft) },
  { header: '20" ISO Tank', value: ({ shipment }) => yesNo(shipment.unit_20_iso_tank) },
  { header: 'Number of 20" ISO tanks', value: ({ shipment }) => num(shipment.container_count_20_iso_tank) },
  { header: "40 HC", value: ({ shipment }) => yesNo(shipment.unit_40_hc) },
  { header: "Number of 40 HC containers", value: ({ shipment }) => num(shipment.container_count_40_hc) },
  { header: "20 FR", value: ({ shipment }) => yesNo(shipment.unit_20_fr) },
  { header: "Number of 20 FR containers", value: ({ shipment }) => num(shipment.container_count_20_fr) },
  { header: "40 FR", value: ({ shipment }) => yesNo(shipment.unit_40_fr) },
  { header: "Number of 40 FR containers", value: ({ shipment }) => num(shipment.container_count_40_fr) },
  { header: "PIB type", value: ({ shipment }) => displayPibTypeLabel(shipment.pib_type) },
  { header: "PIB Doc No", value: ({ shipment }) => shipment.no_request_pib },
  { header: "Nopen", value: ({ shipment }) => shipment.nopen },
  { header: "Nopen date", value: ({ shipment }) => ymd(shipment.nopen_date) },
  { header: "Insurance No", value: ({ shipment }) => shipment.insurance_no },
  { header: "Insurance amount", value: ({ shipment }) => num(shipment.insurance_amount) },
  { header: "COO (Certificate of Origin)", value: ({ shipment }) => shipment.coo },
  { header: "ETD", value: ({ shipment }) => ymd(shipment.etd) },
  { header: "ATD", value: ({ shipment }) => ymd(shipment.atd) },
  { header: "Destination port name", value: ({ shipment }) => shipment.destination_port_name },
  { header: "Destination port country", value: ({ shipment }) => shipment.destination_port_country },
  { header: "Destination port code", value: ({ shipment }) => shipment.destination_port_code },
  { header: "Depo", value: ({ shipment }) => yesNo(shipment.depo) },
  { header: "Depo location", value: ({ shipment }) => shipment.depo_location },
  { header: "BL/AWB", value: ({ shipment }) => shipment.bl_awb },
  { header: "PPJK/EMKL", value: ({ shipment }) => shipment.ppjk_mkl },
  { header: "ETA", value: ({ shipment }) => ymd(shipment.eta) },
  { header: "ATA", value: ({ shipment }) => ymd(shipment.ata) },
  { header: "Freight charges", value: ({ shipment }) => num(shipment.incoterm_amount) },
  { header: "Freight currency", value: ({ shipment }) => shipment.incoterm_currency },
  { header: "Net weight (MT)", value: ({ shipment }) => num(shipment.net_weight_mt) },
  { header: "Gross weight (MT)", value: ({ shipment }) => num(shipment.gross_weight_mt) },
  { header: "BM (total)", value: ({ shipment }) => num(dutyAmounts(shipment).bm) },
  { header: "PPN (total)", value: ({ shipment }) => num(dutyAmounts(shipment).ppn) },
  { header: "PPH (total)", value: ({ shipment }) => num(dutyAmounts(shipment).pph) },
  { header: "PDRI", value: ({ shipment }) => num(dutyAmounts(shipment).pdri) },
  { header: "Delivered at", value: ({ shipment }) => ymd(shipment.closed_at) },
  { header: "Close reason", value: ({ shipment }) => shipment.close_reason },
  { header: "Remarks", value: ({ shipment }) => shipment.remarks },
  { header: "PO number", value: ({ linked_pos }) => joinUnique(linked_pos.map((p) => p.po_number)) },
  { header: "Invoice no", value: ({ linked_pos }) => joinUnique(linked_pos.map((p) => p.invoice_no)) },
  { header: "Currency", value: ({ linked_pos }) => joinUnique(linked_pos.map((p) => p.currency)) },
  {
    header: "Currency rate",
    value: ({ linked_pos }) => joinUnique(linked_pos.map((p) => (p.currency_rate != null ? String(p.currency_rate) : ""))),
  },
  { header: "PO supplier", value: ({ linked_pos }) => joinUnique(linked_pos.map((p) => p.supplier_name)) },
  { header: "PO incoterm location", value: ({ linked_pos }) => joinUnique(linked_pos.map((p) => p.incoterm_location)) },
  { header: "PO lines", value: ({ linked_pos }) => formatPoLines(linked_pos) },
];

/** UTF-8 BOM so Excel opens Indonesian vendor names correctly. */
export function buildShipmentListCsv(items: ShipmentExportSource[]): string {
  const header = COLUMNS.map((c) => csvField(c.header)).join(",");
  const body = items.map((src) => COLUMNS.map((c) => csvField(c.value(src))).join(","));
  return `\uFEFF${[header, ...body].join("\r\n")}`;
}

export function shipmentListExportFilename(now = new Date()): string {
  const ymdPart = now.toISOString().slice(0, 10);
  return `import-shipments_${ymdPart}.csv`;
}
