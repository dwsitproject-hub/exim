import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickHeaderFieldForAi, pickItemsForAi } from "./po-pdf-parser.js";
import type { ParsedPoItem } from "./po-pdf-parser.js";

const item = (desc: string, qty = 1): ParsedPoItem => ({
  item_description: desc,
  qty,
  unit: "PCS",
  unit_original: "PCS",
  value: 10,
});

describe("pickHeaderFieldForAi", () => {
  it("prefers Claude value when both OCR and Claude are present", () => {
    assert.equal(pickHeaderFieldForAi("WRONG-OCR", "1234567890"), "1234567890");
  });

  it("falls back to OCR when Claude returns empty", () => {
    assert.equal(pickHeaderFieldForAi("PO-100", null), "PO-100");
    assert.equal(pickHeaderFieldForAi("PO-100", "  "), "PO-100");
  });
});

describe("pickItemsForAi", () => {
  it("uses Claude items when OCR list is empty", () => {
    const claude = [item("Widget A"), item("Widget B")];
    assert.deepEqual(pickItemsForAi([], claude, "unknown"), claude);
  });

  it("uses Claude when it has more items than OCR", () => {
    const base = [item("A")];
    const claude = [item("A"), item("B"), item("C")];
    assert.deepEqual(pickItemsForAi(base, claude, "incomplete"), claude);
  });

  it("uses Claude when OCR completeness is incomplete even with fewer Claude rows", () => {
    const base = [item("junk1"), item("junk2"), item("junk3")];
    const claude = [item("Real A"), item("Real B")];
    assert.deepEqual(pickItemsForAi(base, claude, "incomplete"), claude);
  });

  it("keeps OCR when complete and Claude has fewer items", () => {
    const base = [item("A"), item("B"), item("C")];
    const claude = [item("A")];
    assert.deepEqual(pickItemsForAi(base, claude, "complete"), base);
  });
});
