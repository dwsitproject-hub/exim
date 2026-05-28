/**
 * Canonical labels for shipments.product_classification (align with frontend lib/product-classification).
 */

const LEGACY_TO_CURRENT: Record<string, string> = {
  Chemical: "Chemical",
  Checmical: "Chemical",
  Packaging: "Package",
  /** CSV / informal spellings → same label as `frontEnd` PRODUCT_CLASSIFICATION_OPTIONS */
  Sparepart: "Spare Parts",
  "Spare part": "Spare Parts",
  "Spare parts": "Spare Parts",
  Spareparts: "Spare Parts",
};

/** Normalize stored value for API JSON (list/detail). */
export function normalizeProductClassificationForApi(value: string | null | undefined): string | null {
  if (value == null) return null;
  const v = value.trim();
  if (!v) return null;
  return LEGACY_TO_CURRENT[v] ?? v;
}

/** DB values that match a UI filter (canonical Chemical / Package include legacy spellings). */
export function classificationFilterSqlVariants(filterCanonical: string): string[] {
  const t = filterCanonical.trim();
  if (t === "Chemical") return ["Chemical", "Checmical"];
  if (t === "Package") return ["Package", "Packaging"];
  if (t === "") return [];
  return [t];
}
