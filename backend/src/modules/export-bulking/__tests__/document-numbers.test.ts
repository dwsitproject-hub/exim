/**
 * Run with: npx tsx backend/src/modules/export-bulking/__tests__/document-numbers.test.ts
 */

import assert from "node:assert/strict";
import {
  formatInvoiceDocumentNumber,
  formatPlDocumentNumber,
  formatSiDocumentNumber,
  parseExportDocumentSerial,
} from "../utils/document-numbers.js";

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

function testParseSiNumber() {
  const num = formatSiDocumentNumber(2026, 7, 6);
  assert.deepEqual(parseExportDocumentSerial(num), { year: 2026, serial: 6 });
  pass("parses SI number");
}

function testParseInvoiceNumber() {
  const num = formatInvoiceDocumentNumber(2026, 7, 12);
  assert.deepEqual(parseExportDocumentSerial(num), { year: 2026, serial: 12 });
  pass("parses invoice number");
}

function testParsePackingListNumber() {
  const num = formatPlDocumentNumber(2026, 7, 3);
  assert.deepEqual(parseExportDocumentSerial(num), { year: 2026, serial: 3 });
  pass("parses packing list number");
}

function testParseRejectsInvalid() {
  assert.equal(parseExportDocumentSerial(""), null);
  assert.equal(parseExportDocumentSerial("CUSTOM-001"), null);
  assert.equal(parseExportDocumentSerial("SI/EUP/2026/VII/"), null);
  pass("rejects invalid numbers");
}

function main() {
  console.log("Export Bulking — document number parsing\n");
  try {
    testParseSiNumber();
    testParseInvoiceNumber();
    testParsePackingListNumber();
    testParseRejectsInvalid();
  } catch (err) {
    fail("unexpected throw", err);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
