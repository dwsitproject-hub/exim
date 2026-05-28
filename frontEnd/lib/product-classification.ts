/**
 * Product classification labels (shipment). Single source for display, filters, and legacy DB values.
 */

export const PRODUCT_CLASSIFICATION_OPTIONS = ["Chemical", "Package", "Spare Parts"] as const;

/** Map stored / historical labels to the current canonical label. */
const LEGACY_TO_CURRENT: Record<string, string> = {
  Chemical: "Chemical",
  Checmical: "Chemical",
  Packaging: "Package",
  "Spare Parts": "Spare Parts",
  Sparepart: "Spare Parts",
  "Spare part": "Spare Parts",
  "Spare parts": "Spare Parts",
  Spareparts: "Spare Parts",
};

/** Canonical display string for API/DB value (fixes historical "Checmical" typo). */
export function displayProductClassification(value: string | null | undefined): string {
  const v = value != null ? String(value).trim() : "";
  if (!v) return "—";
  return LEGACY_TO_CURRENT[v] ?? v;
}

/** Value for edit controls (empty string if unset). */
export function normalizeProductClassificationForEdit(value: string | null | undefined): string {
  const v = value != null ? String(value).trim() : "";
  if (!v) return "";
  return LEGACY_TO_CURRENT[v] ?? v;
}

/** Document-slot rule: treat legacy typo as Chemical. */
export function isChemicalProductClassification(value: string | null | undefined): boolean {
  const v = value != null ? String(value).trim() : "";
  if (!v) return false;
  const canon = LEGACY_TO_CURRENT[v] ?? v;
  return canon === "Chemical";
}
