import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resetPoItemUnitRegistryForTests } from "../../../shared/po-item-unit-registry.js";
import {
  fingerprintMappedPo,
  mapSynceraLines,
  normalizeCurrency,
  normalizeKawasan,
  normalizePlant,
  normalizePtName,
  synceraExternalId,
} from "../syncera-mapper.js";
import type { SynceraPoLine } from "../types.js";

const ytd2026: SynceraPoLine = {
  pt_code: "EU",
  pt_name: "PT Energi Unggul Persada",
  plant_code: "EU73",
  plant_name: "EUP GENERAL TJ.PURA",
  po_number: "1002004982",
  supplier_name: "WEG SOUTH EAST ASIA SDN BHD",
  delivery_location: "",
  incoterm: "",
  currency: "US$",
  kawasan_berikat: "N",
  item_description: "BLEACHING EARTH TAIKO-109",
  qty_item: 50,
  unit: "KG",
  price_per_unit: 400,
};

describe("syncera-mapper", () => {
  it("normalizes PT, plant, currency, and kawasan from live-shaped fields", () => {
    assert.equal(normalizePtName("PT Energi Unggul Persada"), "ENERGI UNGGUL PERSADA");
    assert.equal(normalizePtName("PT JATI PERKASA NUSANTARA"), "JATI PERKASA NUSANTARA");
    assert.equal(normalizePlant("EU73", "EUP GENERAL TJ.PURA"), "TANJUNG PURA");
    assert.equal(normalizePlant("EU72", "EUP GENERAL BONTANG"), "BONTANG");
    assert.equal(normalizePlant("JP22", "JPN ANIMAL FEED SIDOARJO"), "SIDOARJO");
    assert.equal(normalizeCurrency("US$"), "USD");
    assert.equal(normalizeKawasan("N"), "No");
    assert.equal(normalizeKawasan("Y"), "Yes");
  });

  it("builds a stable external_id and fingerprint", async () => {
    resetPoItemUnitRegistryForTests();
    assert.equal(synceraExternalId("eu", "1002004982"), "syncera:EU:1002004982");
    const { mapped } = await mapSynceraLines([ytd2026]);
    assert.equal(mapped.length, 1);
    const po = mapped[0]!;
    assert.equal(po.external_id, "syncera:EU:1002004982");
    assert.equal(po.pt, "ENERGI UNGGUL PERSADA");
    assert.equal(po.plant, "TANJUNG PURA");
    assert.equal(po.currency, "USD");
    assert.equal(po.kawasan_berikat, "No");
    assert.equal(po.items?.length, 1);
    const again = (await mapSynceraLines([ytd2026])).mapped[0];
    assert.equal(po.fingerprint, again?.fingerprint);
    assert.equal(
      fingerprintMappedPo({
        po_number: po.po_number,
        plant: po.plant,
        pt: po.pt,
        supplier_name: po.supplier_name,
        delivery_location: po.delivery_location,
        incoterm_location: po.incoterm_location,
        kawasan_berikat: po.kawasan_berikat,
        currency: po.currency,
        items: po.items ?? [],
      }),
      po.fingerprint
    );
  });

  it("groups two lines of the same PO into one intake", async () => {
    resetPoItemUnitRegistryForTests();
    const { mapped } = await mapSynceraLines([
      { ...ytd2026, item_description: "LINE A", qty_item: 1, unit: "KG", price_per_unit: 10 },
      { ...ytd2026, item_description: "LINE B", qty_item: 2, unit: "PC", price_per_unit: 20 },
    ]);
    assert.equal(mapped.length, 1);
    assert.equal(mapped[0]!.items?.length, 2);
    assert.deepEqual(
      mapped[0]!.items?.map((i) => i.item_description),
      ["LINE A", "LINE B"]
    );
  });

  it("auto-registers unknown Syncera units (M3, TUB)", async () => {
    resetPoItemUnitRegistryForTests();
    const gmLine: SynceraPoLine = {
      pt_code: "GM",
      pt_name: "GULF LUBES MALAYSIA SDN.B",
      plant_code: "GM21",
      plant_name: "GLM REFINERY PORT KLANG",
      po_number: "1632000379",
      supplier_name: "AIR PRODUCTS MALAYSIA SDN BHD",
      delivery_location: "",
      incoterm: "",
      currency: "MYR",
      kawasan_berikat: "N",
      item_description: "REFILL,GAS HYDROGEN-UHP 99.999%",
      qty_item: 43,
      unit: "M3",
      price_per_unit: 2280,
    };
    const { mapped } = await mapSynceraLines([
      gmLine,
      { ...gmLine, item_description: "GAS,REFILL ARGON", qty_item: 15, unit: "TUB", price_per_unit: 198 },
    ]);
    assert.equal(mapped.length, 1);
    assert.equal(mapped[0]!.items?.length, 2);
    assert.deepEqual(
      mapped[0]!.items?.map((i) => i.unit),
      ["M3", "TUB"]
    );
  });

  it("skips POs when unit format is invalid", async () => {
    resetPoItemUnitRegistryForTests();
    const { mapped, skipped } = await mapSynceraLines([{ ...ytd2026, unit: "not valid" }]);
    assert.equal(mapped.length, 0);
    assert.equal(skipped.length, 1);
  });

  it("skips invalid qty and keeps a sibling valid line", async () => {
    resetPoItemUnitRegistryForTests();
    const { mapped } = await mapSynceraLines([
      { ...ytd2026, item_description: "BAD", qty_item: 0, unit: "KG", price_per_unit: 1 },
      { ...ytd2026, item_description: "GOOD", qty_item: 3, unit: "KG", price_per_unit: 5 },
    ]);
    assert.equal(mapped.length, 1);
    assert.equal(mapped[0]!.items?.length, 1);
    assert.equal(mapped[0]!.items?.[0]?.item_description, "GOOD");
  });
});
