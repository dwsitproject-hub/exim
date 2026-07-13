/**
 * Run with: npx tsx frontEnd/lib/__tests__/export-sap-lines.test.ts
 */

import assert from "node:assert/strict";
import {
  isSapDataComplete,
  resolveShipmentSpr,
} from "../export-sap-lines.js";
import type { ExportBulkingShipmentDetail } from "@/types/export-bulking";

let passed = 0;
let failed = 0;

function pass(label: string) {
  passed++;
  console.log(`  PASS: ${label}`);
}

function fail(label: string, err: unknown) {
  failed++;
  console.error(`  FAIL: ${label}`, err);
}

function baseShipment(overrides: Partial<ExportBulkingShipmentDetail> = {}): ExportBulkingShipmentDetail {
  return {
    id: "s1",
    shipment_no: "EXB-001",
    current_status: "SHIPMENT_PLANNING",
    spr: null,
    sap_lines: [],
    invoices: [
      {
        id: "inv1",
        shipment_id: "s1",
        lines: [{ id: "l1", invoice_id: "inv1", so_no: "SO-100" }],
      },
    ],
    ...overrides,
  } as unknown as ExportBulkingShipmentDetail;
}

function testResolveShipmentSprFromShipment() {
  const spr = resolveShipmentSpr({
    spr: " SPR-001 ",
    sap_lines: [{ id: "1", shipment_id: "s1", so_no: "SO-100", line_order: 1, quantity_spb: null, spb: null, delivery_order_pgi: null, spr: "LEGACY" }],
  });
  assert.equal(spr, "SPR-001");
  pass("prefers shipment-level SPR");
}

function testResolveShipmentSprLegacyFallback() {
  const spr = resolveShipmentSpr({
    spr: null,
    sap_lines: [{ id: "1", shipment_id: "s1", so_no: "SO-100", line_order: 1, quantity_spb: null, spb: null, delivery_order_pgi: null, spr: "LEGACY-SPR" }],
  });
  assert.equal(spr, "LEGACY-SPR");
  pass("falls back to legacy line SPR");
}

function testIsSapDataCompleteRequiresShipmentSpr() {
  const incomplete = baseShipment({
    spr: null,
    sap_lines: [
      {
        id: "1",
        shipment_id: "s1",
        so_no: "SO-100",
        line_order: 1,
        quantity_spb: 10,
        spb: "SPB-1",
        delivery_order_pgi: "DO-1",
        spr: null,
      },
    ],
  });
  assert.equal(isSapDataComplete(incomplete), false);

  const complete = baseShipment({
    spr: "SPR-ONE",
    sap_lines: [
      {
        id: "1",
        shipment_id: "s1",
        so_no: "SO-100",
        line_order: 1,
        quantity_spb: 10,
        spb: "SPB-1",
        delivery_order_pgi: "DO-1",
        spr: null,
      },
    ],
  });
  assert.equal(isSapDataComplete(complete), true);
  pass("requires one shipment SPR for completeness");
}

function main() {
  console.log("Export SAP lines — SPR per shipment\n");
  try {
    testResolveShipmentSprFromShipment();
    testResolveShipmentSprLegacyFallback();
    testIsSapDataCompleteRequiresShipmentSpr();
  } catch (err) {
    fail("unexpected throw", err);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
