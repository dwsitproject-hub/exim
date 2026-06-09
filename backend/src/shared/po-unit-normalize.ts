/**
 * PO line unit normalization — shared by OCR parser and Claude extract.
 */

import { PO_ITEM_UNIT_OPTION_SET } from "./po-item-units.js";

const UNIT_NORMALIZE: Record<string, string> = {
  piece: "PCS", pieces: "PCS", pce: "PCE", pc: "PC",
  pcs: "PCS", pcset: "PCSET", pcun: "PCUN",
  set: "SET", sets: "SETS",
  kg: "KG", kgs: "KGS", kgm: "KGM",
  kilogram: "KG", kilograms: "KG",
  mt: "MT", ton: "MT", tons: "MT", tonne: "MT", tonnes: "MT",
  m: "M", meter: "M", meters: "M", metre: "M", metres: "M",
  m2: "M2", sqm: "M2",
  l: "L", liter: "L", litre: "L", liters: "L", litres: "L",
  box: "BOX", boxes: "BOX",
  bag: "BAG", bags: "BAGS",
  roll: "ROLL", rolls: "ROLL",
  carton: "CARTONS", cartons: "CARTONS", ctn: "CTN",
  ct: "CT", cs: "CS",
  pallet: "PALLET", pallets: "PALLET",
  lot: "LOT", lots: "LOT",
  unit: "UNIT", units: "UNIT", un: "UNIT",
  pack: "PACK", pkg: "PKG", pk: "PK",
  cbm: "CBM", doz: "DOZ", niu: "NIU", oth: "OTH",
};

export function normalizeUnit(raw: string): { unit: string; mapped: boolean } {
  const upper = raw.trim().toUpperCase();
  if (PO_ITEM_UNIT_OPTION_SET.has(upper)) return { unit: upper, mapped: false };
  const normalized = UNIT_NORMALIZE[raw.trim().toLowerCase()];
  if (normalized) return { unit: normalized, mapped: true };
  return { unit: "OTH", mapped: true };
}
