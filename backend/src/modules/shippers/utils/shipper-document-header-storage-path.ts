/** Storage directory prefix for shipper document header images. */
export function buildShipperDocumentHeaderDirectoryPrefix(shortName: string): string {
  const safe = shortName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "shipper";
  return `masters/shippers/${safe}/document-header`;
}
