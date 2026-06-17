/**
 * Required upload document slots for export bulking documentation.
 * Keep in sync with frontEnd/lib/export-bulking-document-types.ts
 */

export const EXPORT_BULKING_UPLOAD_DOCUMENT_TYPES = [
  "bl",
  "coo",
  "surveyor_report",
  "f3d",
  "npe_peb",
  "pe",
  "billing",
  "bukti_bayar",
  "phyto_hc",
] as const;

export type ExportBulkingUploadDocumentType = (typeof EXPORT_BULKING_UPLOAD_DOCUMENT_TYPES)[number];

export const EXPORT_BULKING_UPLOAD_DOCUMENT_LABELS: Record<ExportBulkingUploadDocumentType, string> = {
  bl: "Bill of Lading",
  coo: "COO",
  surveyor_report: "Surveyor Report",
  f3d: "F3D",
  npe_peb: "NPE & PEB",
  pe: "PE",
  billing: "Billing",
  bukti_bayar: "Bukti Bayar",
  phyto_hc: "Phyto & HC",
};

export function isExportBulkingUploadDocumentType(value: string): value is ExportBulkingUploadDocumentType {
  return (EXPORT_BULKING_UPLOAD_DOCUMENT_TYPES as readonly string[]).includes(value);
}
