/**
 * Run with: npx tsx backend/src/modules/export-bulking/__tests__/export-sent-documents.test.ts
 */

import {
  getMissingRequiredSentDocuments,
  isBillOfLadingSaved,
  parseRequiredSentDocuments,
} from "../utils/export-sent-documents.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

assert(parseRequiredSentDocuments(["bl", "coo", "invalid"]).join(",") === "bl,coo", "parse filters invalid keys");
assert(!isBillOfLadingSaved({ bill_of_lading_no: null }), "B/L not saved without number");
assert(isBillOfLadingSaved({ bill_of_lading_no: "BL-001" }), "B/L saved with number");

const missing = getMissingRequiredSentDocuments({
  bill_of_lading_no: "BL-001",
  required_sent_documents: ["bl", "coo"],
  sent_bl: null,
  sent_coo: "2024-06-01T00:00:00Z",
});
assert(missing.length === 1 && missing[0] === "bl", "missing only unset required docs");

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
