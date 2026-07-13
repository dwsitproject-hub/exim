import type { ShipmentDocumentListItem } from "@/types/shipments";

export type ShipmentDocumentPreviewMode = "pdf" | "image" | "unsupported";

export function getShipmentDocumentPreviewMode(doc: ShipmentDocumentListItem): ShipmentDocumentPreviewMode {
  const mime = (doc.mime_type ?? "").toLowerCase();
  const name = doc.original_file_name.toLowerCase();
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (/\.(jpe?g|png|gif|webp|bmp|svg)$/.test(name)) return "image";
  return "unsupported";
}

export function canPreviewShipmentDocument(doc: ShipmentDocumentListItem): boolean {
  return getShipmentDocumentPreviewMode(doc) !== "unsupported";
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read document"));
    reader.readAsDataURL(blob);
  });
}

/** Release preview URLs created for in-app document preview. */
export function revokeShipmentDocumentPreviewUrl(url: string | null | undefined): void {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

/**
 * Build a URL suitable for in-modal preview.
 * PDFs use a data URL so Chrome's iframe PDF viewer does not block nested blob: loads.
 */
export async function createShipmentDocumentPreviewUrl(
  blob: Blob,
  mode: ShipmentDocumentPreviewMode
): Promise<string> {
  if (mode === "pdf") {
    const typed =
      blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" });
    return readBlobAsDataUrl(typed);
  }
  return URL.createObjectURL(blob);
}
