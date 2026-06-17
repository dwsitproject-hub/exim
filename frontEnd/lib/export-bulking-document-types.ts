/**
 * Required upload document slots for export bulking documentation sidebar.
 * Keep in sync with backend export-bulking-document-types.ts
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

export const EXPORT_BULKING_DOC_FILE_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function isAcceptedExportBulkingDocFile(file: File): boolean {
  const n = file.name.toLowerCase();
  if (n.endsWith(".pdf") || n.endsWith(".doc") || n.endsWith(".docx") || n.endsWith(".xls") || n.endsWith(".xlsx")) {
    return true;
  }
  return (file.type ?? "").toLowerCase().startsWith("image/");
}
