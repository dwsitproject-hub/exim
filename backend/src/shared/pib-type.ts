/**
 * PIB type normalization — keep in sync with frontEnd/lib/pib-type-label.ts (isPibTypeBc23).
 */

const PIB_TYPE_CANONICAL: Record<string, string> = {
  "PIB 2.3": "BC 2.3",
  "PIB 2.0": "BC 2.0",
  "BC 2.3": "BC 2.3",
  "BC 2.0": "BC 2.0",
  "BC 23": "BC 2.3",
  "BC 20": "BC 2.0",
  "Consignee Note": "Consignment Note",
  "Consignment Note": "Consignment Note",
};

/** PIB BC 2.3: BM / PPN / PPH not required for customs clearance validation. */
export function isPibTypeBc23(stored: string | null | undefined): boolean {
  const v = stored != null ? String(stored).trim() : "";
  if (!v) return false;
  const canonical = PIB_TYPE_CANONICAL[v] ?? v;
  return canonical === "BC 2.3";
}

/** Consignment Note (incl. legacy "Consignee Note"): customs docs differ from BC filings. */
export function isPibTypeConsignmentNote(stored: string | null | undefined): boolean {
  const v = stored != null ? String(stored).trim() : "";
  if (!v) return false;
  const canonical = PIB_TYPE_CANONICAL[v] ?? v;
  return canonical === "Consignment Note";
}

/** PIB BC 2.0 (incl. legacy "BC 20"): arrival customs docs include Billing and BPN. */
export function isPibTypeBc20(stored: string | null | undefined): boolean {
  const v = stored != null ? String(stored).trim() : "";
  if (!v) return false;
  const canonical = PIB_TYPE_CANONICAL[v] ?? v;
  return canonical === "BC 2.0";
}

/**
 * BC variant folder segment (Plant__{this}). Consignment Note → BC 2.0 per filing rules.
 * Unknown non-empty values are sanitized; empty → Unknown_PIB.
 */
export function pibTypeStorageFolderName(stored: string | null | undefined): string {
  const v = stored != null ? String(stored).trim() : "";
  if (!v) return "Unknown_PIB";
  const canonical = PIB_TYPE_CANONICAL[v] ?? v;
  if (canonical === "Consignment Note") return "BC 2.0";
  if (canonical === "BC 2.0" || canonical === "BC 2.3") return canonical;
  return canonical.replace(/[/\\:*?"<>|\s]+/g, "_").replace(/_+/g, "_").slice(0, 80) || "Other_PIB";
}
