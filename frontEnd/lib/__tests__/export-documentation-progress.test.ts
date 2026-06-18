/**
 * Run with: npx tsx frontEnd/lib/__tests__/export-documentation-progress.test.ts
 */

import { buildDocumentationProgress } from "../export-documentation-progress.js";
import type { ExportBulkingShipmentDetail } from "../../types/export-bulking.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

function baseDetail(
  overrides: Partial<ExportBulkingShipmentDetail> = {},
): ExportBulkingShipmentDetail {
  return {
    id: "ship-1",
    shipment_no: "EXB-202601-0001",
    current_status: "LOADING",
    shipping_instructions: [],
    invoices: [],
    packing_lists: [],
    cargo_lines: [],
    required_sent_documents: [],
    bill_of_lading_no: null,
    sent_bl: null,
    sent_coo: null,
    sent_phyto: null,
    sent_hc: null,
    sent_sr: null,
    sent_sustainability: null,
    present_docs: null,
    ...overrides,
  } as ExportBulkingShipmentDetail;
}

const noBl = buildDocumentationProgress(baseDetail());
const sentDocsItem = noBl.steps
  .find((s) => s.key === "finalDocs")
  ?.items.find((i) => i.id === "sent_docs");
assert(sentDocsItem?.done === false, "sent_docs not done without BL");

const blOnly = buildDocumentationProgress(
  baseDetail({ bill_of_lading_no: "BL-001", required_sent_documents: [] }),
);
const sentDocsBlOnly = blOnly.steps
  .find((s) => s.key === "finalDocs")
  ?.items.find((i) => i.id === "sent_docs");
assert(sentDocsBlOnly?.done === true, "sent_docs done when BL saved and none required");

const presentDocs = buildDocumentationProgress(
  baseDetail({
    bill_of_lading_no: "BL-001",
    required_sent_documents: ["present_docs"],
    present_docs: "2026-06-01",
  }),
);
const sentDocsPresent = presentDocs.steps
  .find((s) => s.key === "finalDocs")
  ?.items.find((i) => i.id === "sent_docs");
assert(sentDocsPresent?.done === true, "sent_docs done when present_docs is required and filled");

const missingPresent = buildDocumentationProgress(
  baseDetail({
    bill_of_lading_no: "BL-001",
    required_sent_documents: ["present_docs"],
    present_docs: null,
  }),
);
const sentDocsMissing = missingPresent.steps
  .find((s) => s.key === "finalDocs")
  ?.items.find((i) => i.id === "sent_docs");
assert(sentDocsMissing?.done === false, "sent_docs not done when present_docs required but empty");

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
