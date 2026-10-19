import { canonicalizePtLabel } from "@/lib/pt-plant-tree";

/** Dashboard display labels for known PT names (stored values unchanged). */
const PT_DASHBOARD_SHORT_LABELS: Record<string, string> = {
  "ENERGI UNGGUL PERSADA": "EUP",
  "ENERGI OLEO PERSADA": "EOP",
  "PRIMUS SANUS COOKING OIL INDUSTRIAL (PT. PRISCOLIN)": "Priscolin",
  "JATI PERKASA NUSANTARA": "JPN",
  "ROYAL FOODS INDONESIA": "RFI",
  "PRIMA MAKMUR CAKRAWALA": "PMC",
  "SUMBER PANGAN CEMERLANG": "SPC",
  "RIAU SEMESTA BIOMASA": "RSB",
  "SUMATERA BULKERS": "SB",
  "SUMATERA UNGGUL MAKMUR": "SUM",
};

const PT_PLANT_SEPARATOR = " – ";

/** Short dashboard label for a PT value; falls back to trimmed input when unknown. */
export function displayPtShortName(pt: string | null | undefined): string {
  const canonical = canonicalizePtLabel(pt, Object.keys(PT_DASHBOARD_SHORT_LABELS));
  if (canonical === "") return "—";
  return PT_DASHBOARD_SHORT_LABELS[canonical] ?? canonical;
}

/** Shorten PT portion of `PT – Plant` strings used in analytics tables. */
export function displayPtPlantLabel(ptPlant: string | null | undefined): string {
  const raw = (ptPlant ?? "").trim();
  if (raw === "") return "—";

  const sepIdx = raw.indexOf(PT_PLANT_SEPARATOR);
  if (sepIdx === -1) return displayPtShortName(raw);

  const pt = raw.slice(0, sepIdx).trim();
  const plant = raw.slice(sepIdx + PT_PLANT_SEPARATOR.length).trim();
  const shortPt = displayPtShortName(pt);
  if (plant === "" || plant === "—") return shortPt;
  return `${shortPt}${PT_PLANT_SEPARATOR}${plant}`;
}
