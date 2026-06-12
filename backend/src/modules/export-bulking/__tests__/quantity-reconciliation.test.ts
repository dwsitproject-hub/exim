/**
 * Export Bulking — document quantity reconciliation tests.
 * Run with: npx tsx backend/src/modules/export-bulking/__tests__/quantity-reconciliation.test.ts
 */

import {
  validateSiTotalsMatchCargo,
  validateInvoiceTotalsMatchSi,
  sumSiQtyForCargo,
  siTotalQuantity,
} from "../utils/quantity-reconciliation.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

const cargo = [{ id: "c1", cargo_name: "Cargo 1", quantity: 10000 }];

console.log("Export Bulking — Quantity reconciliation tests\n");

assert(
  validateSiTotalsMatchCargo(cargo, [
    { id: "si1", lines: [{ cargo_line_id: "c1", quantity: 6000 }] },
    { id: "si2", lines: [{ cargo_line_id: "c1", quantity: 4000 }] },
  ]).length === 0,
  "split SIs matching cargo total pass",
);

assert(
  validateSiTotalsMatchCargo(cargo, [
    { id: "si1", lines: [{ cargo_line_id: "c1", quantity: 5000 }] },
  ]).length === 1,
  "under-allocated cargo fails",
);

assert(
  sumSiQtyForCargo("c1", [{ id: "si1", lines: [{ cargo_line_id: "c1", quantity: 2500 }] }], "si1", [
    { cargo_line_id: "c1", quantity: 3000 },
  ]) === 3000,
  "override SI lines used in cargo sum",
);

const si = { id: "si1", lines: [{ cargo_line_id: "c1", quantity: 6000 }] };
assert(siTotalQuantity(si) === 6000, "SI total quantity");

assert(
  validateInvoiceTotalsMatchSi(si, [
    { id: "inv1", shipping_instruction_id: "si1", lines: [{ quantity: 3500 }] },
    { id: "inv2", shipping_instruction_id: "si1", lines: [{ quantity: 2500 }] },
  ]).length === 0,
  "invoices matching SI total pass",
);

assert(
  validateInvoiceTotalsMatchSi(si, [
    { id: "inv1", shipping_instruction_id: "si1", lines: [{ quantity: 1000 }] },
  ]).length === 1,
  "invoice under SI total fails",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
