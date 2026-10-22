import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAmendmentItems, buildUpdateDto } from "../syncera-amend.js";
import { anyLinkedShipmentBlocksPoEdit } from "../../../modules/po-intake/utils/po-intake-shipment-lock.js";
import type { PoIntakeItemRow } from "../../../modules/po-intake/dto/index.js";

function row(partial: Partial<PoIntakeItemRow> & { id: string; line_number: number }): PoIntakeItemRow {
  return {
    import_purchase_order_id: "intake-1",
    item_description: null,
    qty: null,
    unit: null,
    value: null,
    created_at: new Date(),
    ...partial,
  };
}

describe("syncera-amend line matching", () => {
  const existing: PoIntakeItemRow[] = [
    row({
      id: "a",
      line_number: 1,
      item_description: "BLEACHING EARTH TAIKO-109",
      qty: 50,
      unit: "KG",
      value: 400,
    }),
    row({
      id: "b",
      line_number: 2,
      item_description: "Spare part",
      qty: 1,
      unit: "SET",
      value: 100,
    }),
  ];

  it("matches existing lines by description+unit and updates qty/price", () => {
    const items = buildAmendmentItems(
      [
        { item_description: "bleaching earth taiko-109", qty: 60, unit: "kg", value: 410 },
        { item_description: "Spare part", qty: 1, unit: "SET", value: 100 },
      ],
      existing
    );
    assert.equal(items[0]!.id, "a");
    assert.equal(items[0]!.qty, 60);
    assert.equal(items[0]!.value, 410);
    assert.equal(items[1]!.id, "b");
  });

  it("inserts a new line when the key is unknown", () => {
    const items = buildAmendmentItems(
      [
        { item_description: "BLEACHING EARTH TAIKO-109", qty: 50, unit: "KG", value: 400 },
        { item_description: "Spare part", qty: 1, unit: "SET", value: 100 },
        { item_description: "NEW LINE", qty: 2, unit: "PC", value: 9 },
      ],
      existing
    );
    assert.equal(items.length, 3);
    assert.equal(items[2]!.id, undefined);
    assert.equal(items[2]!.item_description, "NEW LINE");
  });

  it("omits removed lines so updateIntake can delete them", () => {
    const items = buildAmendmentItems(
      [{ item_description: "BLEACHING EARTH TAIKO-109", qty: 50, unit: "KG", value: 400 }],
      existing
    );
    assert.equal(items.length, 1);
    assert.equal(items[0]!.id, "a");
    assert.ok(!items.some((it) => it.id === "b"));
  });

  it("consumes duplicate keys in line_number order", () => {
    const dupExisting = [
      row({ id: "first", line_number: 1, item_description: "BAG", qty: 1, unit: "PC", value: 1 }),
      row({ id: "second", line_number: 2, item_description: "BAG", qty: 2, unit: "PC", value: 2 }),
    ];
    const items = buildAmendmentItems(
      [
        { item_description: "BAG", qty: 10, unit: "PC", value: 3 },
        { item_description: "BAG", qty: 20, unit: "PC", value: 4 },
      ],
      dupExisting
    );
    assert.equal(items[0]!.id, "first");
    assert.equal(items[0]!.qty, 10);
    assert.equal(items[1]!.id, "second");
    assert.equal(items[1]!.qty, 20);
  });

  it("builds a header DTO from the mapped PO", () => {
    const dto = buildUpdateDto(
      {
        external_id: "syncera:EU:1",
        po_number: "1002004982",
        plant: "TANJUNG PURA",
        pt: "ENERGI UNGGUL PERSADA",
        supplier_name: "WEG SOUTH EAST ASIA SDN BHD",
        currency: "USD",
        items: [{ item_description: "BLEACHING EARTH TAIKO-109", qty: 50, unit: "KG", value: 400 }],
      },
      existing
    );
    assert.equal(dto.po_number, "1002004982");
    assert.equal(dto.plant, "TANJUNG PURA");
    assert.equal(dto.items[0]!.id, "a");
  });
});

describe("shipment lock for amendments", () => {
  it("blocks Ready Pickup and later", () => {
    assert.equal(anyLinkedShipmentBlocksPoEdit([{ current_status: "INITIATE_SHIPPING_DOCUMENT" }]), false);
    assert.equal(anyLinkedShipmentBlocksPoEdit([{ current_status: "READY_PICKUP" }]), true);
    assert.equal(anyLinkedShipmentBlocksPoEdit([{ current_status: "DELIVERED" }]), true);
  });
});
