/** Legacy / alternate `pib_type` values → canonical option values (BC 2.3, BC 2.0, Consignment Note). */

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

export function displayPibTypeLabel(stored: string | null | undefined): string {
  const v = stored != null && String(stored).trim() !== "" ? String(stored).trim() : "";
  if (!v) return "—";
  return PIB_TYPE_CANONICAL[v] ?? v;
}

/** Normalize DB value for controlled `<select>` (same keys as display). */
export function normalizePibTypeForEdit(stored: string | null | undefined): string {
  const v = stored != null ? String(stored).trim() : "";
  if (!v) return "";
  return PIB_TYPE_CANONICAL[v] ?? v;
}

/** PIB BC 2.3: in-app BM / PPN / PPH / PDRI are not calculated (treated as zero). */
export function isPibTypeBc23(stored: string | null | undefined): boolean {
  const v = stored != null ? String(stored).trim() : "";
  if (!v) return false;
  const canonical = PIB_TYPE_CANONICAL[v] ?? v;
  return canonical === "BC 2.3";
}

/** Consignment Note (incl. legacy "Consignee Note"): customs document rules differ from BC. */
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
