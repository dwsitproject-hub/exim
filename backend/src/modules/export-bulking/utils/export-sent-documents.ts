/**
 * Required sent-document checklist for export bulking (after Bill of Lading is saved).
 * Mirrors frontEnd/lib/export-sent-documents.ts (keep in sync).
 */

export const EXPORT_SENT_DOCUMENT_KEYS = [
  "bl",
  "coo",
  "phyto",
  "hc",
  "sr",
  "sustainability",
  "present_docs",
] as const;

export type ExportSentDocumentKey = (typeof EXPORT_SENT_DOCUMENT_KEYS)[number];

export const EXPORT_SENT_DOCUMENT_LABELS: Record<ExportSentDocumentKey, string> = {
  bl: "Bill of Lading (sent)",
  coo: "Certificate of Origin",
  phyto: "Phytosanitary",
  hc: "Health Certificate",
  sr: "Survey Report",
  sustainability: "Sustainability",
  present_docs: "Present Documents",
};

export type ExportSentDocumentShipment = {
  bill_of_lading_no?: string | null;
  required_sent_documents?: unknown;
  sent_bl?: string | null;
  sent_coo?: string | null;
  sent_phyto?: string | null;
  sent_hc?: string | null;
  sent_sr?: string | null;
  sent_sustainability?: string | null;
  present_docs?: string | null;
};

const SENT_FIELD_BY_KEY: Record<ExportSentDocumentKey, keyof ExportSentDocumentShipment> = {
  bl: "sent_bl",
  coo: "sent_coo",
  phyto: "sent_phyto",
  hc: "sent_hc",
  sr: "sent_sr",
  sustainability: "sent_sustainability",
  present_docs: "present_docs",
};

export function isExportSentDocumentKey(value: string): value is ExportSentDocumentKey {
  return (EXPORT_SENT_DOCUMENT_KEYS as readonly string[]).includes(value);
}

export function parseRequiredSentDocuments(raw: unknown): ExportSentDocumentKey[] {
  if (!Array.isArray(raw)) return [];
  const out: ExportSentDocumentKey[] = [];
  for (const item of raw) {
    if (typeof item === "string" && isExportSentDocumentKey(item) && !out.includes(item)) {
      out.push(item);
    }
  }
  return out;
}

export function isBillOfLadingSaved(data: ExportSentDocumentShipment): boolean {
  return Boolean(data.bill_of_lading_no?.trim());
}

export function getSentDateForKey(
  data: ExportSentDocumentShipment,
  key: ExportSentDocumentKey,
): string | null {
  const field = SENT_FIELD_BY_KEY[key];
  const value = data[field];
  return typeof value === "string" && value.trim() ? value : null;
}

export function getMissingRequiredSentDocuments(
  data: ExportSentDocumentShipment,
): ExportSentDocumentKey[] {
  if (!isBillOfLadingSaved(data)) return [];
  const required = parseRequiredSentDocuments(data.required_sent_documents);
  return required.filter((key) => !getSentDateForKey(data, key));
}

export function getMissingRequiredSentDocumentLabels(data: ExportSentDocumentShipment): string[] {
  return getMissingRequiredSentDocuments(data).map((k) => EXPORT_SENT_DOCUMENT_LABELS[k]);
}

export function sentFieldForKey(key: ExportSentDocumentKey): keyof ExportSentDocumentShipment {
  return SENT_FIELD_BY_KEY[key];
}
