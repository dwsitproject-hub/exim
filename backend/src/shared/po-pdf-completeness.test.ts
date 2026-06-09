import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeItemCompleteness, completenessWarning } from "./po-pdf-completeness.js";

describe("analyzeItemCompleteness", () => {
  it("detects incomplete item list from line number gaps", () => {
    const text = [
      "001 VALVE ASSEMBLY  10 PCS  100.00",
      "003 FILTER ELEMENT  5 PCS  50.00",
      "005 GASKET SET      2 PCS  25.00",
    ].join("\n");

    const result = analyzeItemCompleteness(text, 1);
    assert.equal(result.item_completeness, "incomplete");
    assert.equal(result.expected_item_count, 5);
    assert.ok(result.missing_line_numbers.includes(2));
    assert.ok(result.missing_line_numbers.includes(4));
  });

  it("returns unknown when no line numbers are found", () => {
    const result = analyzeItemCompleteness("Purchase Order\nSupplier: ACME", 2);
    assert.equal(result.item_completeness, "unknown");
    assert.equal(result.expected_item_count, null);
  });
});

describe("completenessWarning", () => {
  it("emits a warning when parsed count is below expected", () => {
    const analysis = analyzeItemCompleteness("001 ITEM\n005 ITEM", 1);
    const warning = completenessWarning(analysis, 1);
    assert.ok(warning?.includes("suggest"));
  });
});
