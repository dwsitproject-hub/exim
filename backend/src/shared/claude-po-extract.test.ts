import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeClaudeItems } from "./claude-po-extract.js";

describe("normalizeClaudeItems", () => {
  it("normalizes plural unit names to allowed codes", () => {
    const items = normalizeClaudeItems([
      {
        item_description: "Steel bolt",
        qty: 100,
        unit: "pieces",
        unit_original: "pieces",
        value: 1.5,
      },
    ]);

    assert.equal(items.length, 1);
    assert.equal(items[0]!.unit, "PCS");
    assert.equal(items[0]!.unit_original, "pieces");
  });

  it("skips rows with invalid qty or value", () => {
    const items = normalizeClaudeItems([
      { item_description: "Bad qty", qty: 0, unit: "PCS", value: 10 },
      { item_description: "Bad value", qty: 1, unit: "PCS", value: -1 },
      { item_description: "Good", qty: 2, unit: "KG", value: 0 },
    ]);

    assert.equal(items.length, 1);
    assert.equal(items[0]!.item_description, "Good");
  });
});
