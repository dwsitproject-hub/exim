/**
 * Export Bulking — document quantity reconciliation tests.
 * Run with: npx tsx backend/src/modules/export-bulking/__tests__/quantity-reconciliation.test.ts
 */

import {
  validateSiTotalsMatchCargo,
  validateSiAllocationDoesNotExceedCargo,
  validateInvoiceTotalsMatchSi,
  validateInvoiceAllocationDoesNotExceedSi,
  sumInvoiceQtyForSi,
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
  validateSiAllocationDoesNotExceedCargo(cargo, [
    { id: "si1", lines: [{ cargo_line_id: "c1", quantity: 5000 }] },
  ]).length === 0,
  "under-allocated cargo passes draft save",
);

assert(
  validateSiAllocationDoesNotExceedCargo(cargo, [
    { id: "si1", lines: [{ cargo_line_id: "c1", quantity: 11000 }] },
  ]).length === 1,
  "over-allocated cargo fails draft save",
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
  validateInvoiceAllocationDoesNotExceedSi(si, [
    { id: "inv1", shipping_instruction_id: "si1", lines: [{ quantity: 2500 }] },
  ]).length === 0,
  "partial draft allocation under SI total passes",
);

assert(
  validateInvoiceAllocationDoesNotExceedSi(
    si,
    [
      { id: "inv1", shipping_instruction_id: "si1", lines: [{ quantity: 3500 }] },
      { id: "inv2", shipping_instruction_id: "si1", lines: [{ quantity: 2500 }] },
    ],
    { overrideInvoiceId: "inv2", overrideLines: [{ quantity: 3000 }] },
  ).length === 1,
  "allocation exceeding SI total fails",
);

assert(
  validateInvoiceTotalsMatchSi(si, [
    { id: "inv1", shipping_instruction_id: "si1", lines: [{ quantity: 1000 }] },
  ]).length === 1,
  "invoice under SI total fails",
);

assert(
  sumInvoiceQtyForSi(
    "si1",
    [{ id: "inv-new", shipping_instruction_id: null, lines: [] }],
    undefined,
    "inv-new",
    [{ quantity: 6000 }],
  ) === 6000,
  "override invoice counts draft lines before SI link is saved",
);

assert(
  validateInvoiceTotalsMatchSi(si, [{ id: "inv-new", shipping_instruction_id: null, lines: [] }], {
    overrideInvoiceId: "inv-new",
    overrideLines: [{ quantity: 6000 }],
  }).length === 0,
  "invoice with unsaved SI link passes when draft lines match SI total",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
