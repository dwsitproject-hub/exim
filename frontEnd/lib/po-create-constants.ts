/**
 * PT (company) and Plant options for Create Purchase Order.
 * Plant is either a single fixed value or a dropdown per PT.
 *
 * Keep in sync with `backend/src/shared/pt-plant-options.ts` (dashboard seed / server checks).
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

export const PT_OPTION_LABELS = [
  "ENERGI UNGGUL PERSADA",
  "ENERGI OLEO PERSADA",
  "PRIMUS SANUS COOKING OIL INDUSTRIAL (PT. PRISCOLIN)",
  "JATI PERKASA NUSANTARA",
  "ROYAL FOODS INDONESIA",
  "PRIMA MAKMUR CAKRAWALA",
  "SUMBER PANGAN CEMERLANG",
] as const;

export type PtOptionLabel = (typeof PT_OPTION_LABELS)[number];

export type PtPlantConfig =
  | { mode: "fixed"; plant: string }
  | { mode: "select"; plants: readonly string[] };

export const PT_PLANT_MAP: Record<PtOptionLabel, PtPlantConfig> = {
  "ENERGI UNGGUL PERSADA": {
    mode: "select",
    plants: ["BATAM", "BONTANG", "LUBUK GAUNG", "KIJING / TJ PURA"],
  },
  "ENERGI OLEO PERSADA": { mode: "fixed", plant: "MORAWA" },
  "PRIMUS SANUS COOKING OIL INDUSTRIAL (PT. PRISCOLIN)": {
    mode: "select",
    plants: ["KARAWANG", "BEKASI"],
  },
  "JATI PERKASA NUSANTARA": { mode: "select", plants: ["SIDOARJO", "GRESIK"] },
  "ROYAL FOODS INDONESIA": { mode: "fixed", plant: "BEKASI" },
  "PRIMA MAKMUR CAKRAWALA": { mode: "fixed", plant: "LUBUK GAUNG" },
  "SUMBER PANGAN CEMERLANG": { mode: "fixed", plant: "LUBUK GAUNG" },
};

/** Lowercase PT → canonical label from `PT_OPTION_LABELS` (for API/import casing drift). */
const PT_LABEL_BY_LOWER = new Map(PT_OPTION_LABELS.map((l) => [l.toLowerCase(), l]));

/**
 * Map stored PT from API/import to the canonical option label when a case-insensitive match exists.
 * Otherwise returns trimmed input (may not appear in `PT_PLANT_MAP`).
 */
export function canonicalizePtLabel(stored: string | null | undefined): string {
  const t = (stored ?? "").trim();
  if (t === "") return "";
  return PT_LABEL_BY_LOWER.get(t.toLowerCase()) ?? t;
}

export function getPlantConfigForPt(pt: string): PtPlantConfig | null {
  if (!pt || !(pt in PT_PLANT_MAP)) return null;
  return PT_PLANT_MAP[pt as PtOptionLabel];
}

/** Distinct plant codes across all PT options (for analytics filters). */
export function getAllPlantsSorted(): string[] {
  const set = new Set<string>();
  for (const cfg of Object.values(PT_PLANT_MAP)) {
    if (cfg.mode === "fixed") set.add(cfg.plant);
    else cfg.plants.forEach((p) => set.add(p));
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}
