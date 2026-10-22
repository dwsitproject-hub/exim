/**
 * Shared constants for Create / Edit Purchase Order.
 * PT and Plant options now come from GET /masters/pt-plant-tree (Plant list = sites).
 */

/** PO line unit codes: Excel export set + legacy UI-only units (L, M2, PAIR, DOZ, OTH). Sorted A–Z. */
export const PO_ITEM_UNIT_OPTIONS = [
  "BAG",
  "BAGS",
  "BG",
  "BOX",
  "CARTONS",
  "CASE",
  "CASES",
  "CBM",
  "CS",
  "CT",
  "CTN",
  "DOZ",
  "KGM",
  "KG",
  "KGS",
  "L",
  "LOT",
  "M",
  "M2",
  "MT",
  "NIU",
  "OTH",
  "PACK",
  "PALLET",
  "PAIR",
  "PC",
  "PCE",
  "PCESET",
  "PCEUN",
  "PCSET",
  "PCS",
  "PCUN",
  "PK",
  "PKG",
  "ROLL",
  "SET",
  "SETS",
  "TNE",
  "UN",
  "UNIT",
  "UNPCE",
  "UNPCS",
] as const;

export type PoItemUnitOption = (typeof PO_ITEM_UNIT_OPTIONS)[number];
