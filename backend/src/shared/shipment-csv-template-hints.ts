/**
 * Lines appended to downloadable shipment CSV templates (prefix `#` — ignored on import after header).
 */

export const SHIPMENT_CSV_TEMPLATE_HINT_LINES: readonly string[] = [
  "# --- Reference: delete all lines starting with # before upload (optional) ---",
  "# Vendor / supplier, Incoterm, PT, Plant, Currency: omitted from this template — taken from the linked PO (PO number or Intake ID) automatically. Optional columns with those headers still override PO values if present.",
  "# Ship via (Sea / Air) (dropdown): AIR | SEA",
  "# Incoterm: EXW | FCA | FOB | CIF | DAP | DDP (EXW/FCA/FOB enable transporter bidding in the app)",
  "# Product classification type (dropdown): Chemical | Package | Spare Parts (also accepts Sparepart / Spare parts in CSV)",
  "# PIB type (examples): BC 2.0 | BC 2.3 | Consignment Note | Lartas",
  "# Freight currency (optional): USD | IDR (default IDR when omitted)",
];

export const PO_CSV_TEMPLATE_HINT_LINES: readonly string[] = [
  "# --- Reference: delete all lines starting with # before upload (optional) ---",
  "# kawasan_berikat (dropdown): Yes | No",
  "# currency (examples): IDR | USD",
];
