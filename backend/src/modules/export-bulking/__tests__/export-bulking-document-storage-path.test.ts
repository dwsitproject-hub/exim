/**
 * Run with: npx tsx backend/src/modules/export-bulking/__tests__/export-bulking-document-storage-path.test.ts
 */

import { buildExportBulkingDocumentDirectoryPrefix } from "../utils/export-bulking-document-storage-path.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

const prefix = buildExportBulkingDocumentDirectoryPrefix({
  shipment_no: "EB-2024-001",
  created_at: new Date("2024-03-15T00:00:00Z"),
  eta: "2024-06-01",
  document_type: "INVOICE",
});

assert(prefix.startsWith("Export/bulking/"), "path starts with Export/bulking/");
assert(prefix.includes("/2024/EB-2024-001/INVOICE"), "path includes year, shipment, and document type");

const etaYear = buildExportBulkingDocumentDirectoryPrefix({
  shipment_no: "EB-99",
  created_at: new Date("2023-01-01T00:00:00Z"),
  eta: "2025-12-31",
  document_type: "BL",
});
assert(etaYear.startsWith("Export/bulking/2025/"), "year comes from ETA when present");

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
