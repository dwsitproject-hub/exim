/**
 * Run with: npx tsx backend/src/modules/shipments/__tests__/shipment-document-other.test.ts
 */

import {
  isAllowedShipmentDocumentType,
} from "../constants/shipment-document-types.js";
import { buildShipmentDocumentDirectoryPrefix } from "../utils/shipment-document-storage-path.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

assert(isAllowedShipmentDocumentType("OTHER"), "OTHER is allowed document type");

const shipment = {
  shipment_no: "SHP-001",
  etd: null,
  eta: new Date("2026-06-01T00:00:00Z"),
  created_at: new Date("2026-01-01T00:00:00Z"),
  pib_type: "BC 2.0",
  vendor_name: "Acme",
} as Parameters<typeof buildShipmentDocumentDirectoryPrefix>[0];

const ctx = {
  pt: "PT EUP",
  plant: "Plant A",
  supplierName: "Acme",
  poNumbers: ["PO-123"],
};

const otherPath = buildShipmentDocumentDirectoryPrefix(shipment, ctx, "OTHER");
const blPath = buildShipmentDocumentDirectoryPrefix(shipment, ctx, "BL");
assert(otherPath.endsWith("/Other"), "OTHER files filed under Other subfolder");
assert(otherPath.startsWith(blPath), "OTHER subfolder is under standard import path");
assert(!blPath.includes("/Other"), "BL path has no Other segment");

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
