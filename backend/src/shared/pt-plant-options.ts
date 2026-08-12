/**
 * PT / plant master data — keep in sync with Master Shipper seed in
 * `091_master_shipper_entity_plants.sql` (dashboard seed only).
 */

export const PT_OPTION_LABELS = [
  "ENERGI UNGGUL PERSADA",
  "ENERGI OLEO PERSADA",
  "PRIMUS SANUS COOKING OIL INDUSTRIAL (PT. PRISCOLIN)",
  "JATI PERKASA NUSANTARA",
  "ROYAL FOODS INDONESIA",
  "PRIMA MAKMUR CAKRAWALA",
  "SUMBER PANGAN CEMERLANG",
  "RIAU SEMESTA BIOMASA",
  "SUMATERA BULKERS",
  "SUMATERA UNGGUL MAKMUR",
] as const;

export type PtOptionLabel = (typeof PT_OPTION_LABELS)[number];

export type PtPlantConfig =
  | { mode: "fixed"; plant: string }
  | { mode: "select"; plants: readonly string[] }
  | { mode: "none" };

/** @deprecated Runtime PT/plant options come from Master Shipper API. Seed helper only. */
export const PT_PLANT_MAP: Record<PtOptionLabel, PtPlantConfig> = {
  "ENERGI UNGGUL PERSADA": {
    mode: "select",
    plants: [
      "BATAM",
      "BONTANG",
      "DUMAI",
      "KUMAI",
      "LUBUK GAUNG",
      "PALEMBANG",
      "TANJUNG PURA",
    ],
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
  "RIAU SEMESTA BIOMASA": { mode: "none" },
  "SUMATERA BULKERS": { mode: "none" },
  "SUMATERA UNGGUL MAKMUR": { mode: "none" },
};

/** Deterministic PT + plant pair for seed rows (valid per Create PO rules). */
export function pickPtPlantForSeedIndex(indexZeroBased: number): { pt: string; plant: string } {
  const pt = PT_OPTION_LABELS[indexZeroBased % PT_OPTION_LABELS.length] as PtOptionLabel;
  const config = PT_PLANT_MAP[pt];
  if (config.mode === "none") {
    return { pt, plant: "" };
  }
  if (config.mode === "fixed") {
    return { pt, plant: config.plant };
  }
  const plants = config.plants;
  const plant = plants[indexZeroBased % plants.length]!;
  return { pt, plant };
}
