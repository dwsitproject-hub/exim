/**
 * Run with: npx tsx --test backend/src/modules/shipments/__tests__/shipment-list-csv.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildShipmentListCsv, shipmentListExportFilename } from "../utils/shipment-list-csv.js";
import type { ShipmentRow } from "../dto/index.js";

const shipment: ShipmentRow = {
  id: "s1",
  shipment_no: "26-1001",
  vendor_code: "V1",
  vendor_name: 'CSB "PRECISION"',
  forwarder_code: null,
  forwarder_name: "Acme",
  warehouse_code: null,
  warehouse_name: "Jl. Example",
  incoterm: "EXW",
  shipment_method: "Sea",
  origin_port_code: null,
  origin_port_name: "Singapore",
  origin_port_country: "Singapore",
  destination_port_code: null,
  destination_port_name: "Jakarta",
  destination_port_country: "Indonesia",
  etd: new Date("2026-04-01T00:00:00.000Z"),
  eta: new Date("2026-04-10T00:00:00.000Z"),
  atd: null,
  ata: null,
  depo: false,
  depo_location: null,
  current_status: "INITIATE_SHIPPING_DOCUMENT",
  closed_at: null,
  close_reason: null,
  remarks: "Handle with care",
  created_at: new Date("2026-03-01T00:00:00.000Z"),
  updated_at: new Date("2026-03-02T00:00:00.000Z"),
  pib_type: "PIB 2.0",
  no_request_pib: "REQ-1",
  ppjk_mkl: "PPJK Co",
  nopen: "N-1",
  nopen_date: new Date("2026-04-11T00:00:00.000Z"),
  ship_by: "FCL",
  bl_awb: "BL-99",
  insurance_no: "INS-1",
  insurance_amount: 1000,
  coo: "COO-1",
  incoterm_amount: 250,
  incoterm_currency: "USD",
  cbm: null,
  net_weight_mt: 12.5,
  gross_weight_mt: 13,
  bm: 10,
  ppn_amount: 20,
  pph_amount: 5,
  kawasan_berikat: "Yes",
  surveyor: "No",
  product_classification: "Chemical",
  unit_20ft: true,
  unit_40ft: false,
  unit_package: false,
  unit_20_iso_tank: false,
  unit_40_hc: false,
  unit_20_fr: false,
  unit_40_fr: false,
  container_count_20ft: 2,
  container_count_40ft: null,
  package_count: null,
  container_count_20_iso_tank: null,
  container_count_40_hc: null,
  container_count_20_fr: null,
  container_count_40_fr: null,
  deleted_at: null,
  deleted_by: null,
};

test("buildShipmentListCsv includes detail fields and escapes quotes", () => {
  const csv = buildShipmentListCsv([
    {
      shipment,
      linked_pos: [
        {
          intake_id: "i1",
          po_number: "1002038788",
          pt: "EUP",
          plant: "TANJUNG PURA",
          taken_by_name: "Kella Charles",
          currency: "USD",
          intake_status: "CLAIMED",
          supplier_name: "CSB",
          invoice_no: "INV-1",
          currency_rate: 16000,
          items: [
            {
              item_description: "Solvent",
              qty_po: 10,
              delivery_qty: 8,
              unit: "KG",
              bm_percentage: 5,
              ppn_percentage: 11,
              pph_percentage: 2.5,
            },
          ],
        },
        {
          intake_id: "i2",
          po_number: "1002038789",
          pt: "EUP",
          plant: "TANJUNG PURA",
          taken_by_name: "Kella Charles",
          currency: "USD",
          intake_status: "CLAIMED",
          items: [],
        },
      ],
    },
  ]);

  assert.ok(csv.startsWith("\uFEFF"), "CSV starts with UTF-8 BOM");
  assert.ok(csv.includes("Shipment number"), "CSV includes detail headers");
  assert.ok(csv.includes("PIB Doc No"), "CSV includes PIB Doc No");
  assert.ok(csv.includes("Initiate Shipping Document"), "Status is human-readable");
  assert.ok(csv.includes("1002038788; 1002038789"), "PO numbers are joined");
  assert.ok(csv.includes('"CSB ""PRECISION"""'), "Quotes in vendor names are escaped");
  assert.ok(csv.includes("BC 2.0"), "PIB type uses canonical label");
  assert.ok(csv.includes("Handle with care"), "Remarks are included");
  assert.ok(csv.includes("Solvent"), "PO line description is included");
  assert.ok(csv.includes("35"), "PDRI is BM+PPN+PPH");
});

test("shipmentListExportFilename uses UTC date", () => {
  assert.equal(shipmentListExportFilename(new Date("2026-08-14T00:00:00.000Z")), "import-shipments_2026-08-14.csv");
});
