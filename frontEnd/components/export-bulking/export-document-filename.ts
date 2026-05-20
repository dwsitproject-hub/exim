/** Safe PDF filename for export documents. */
export function exportDocumentPdfName(prefix: string, documentNo: string | null | undefined): string {
  const slug =
    (documentNo ?? "")
      .trim()
      .replace(/[/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, "_") || "draft";
  return `${prefix}-${slug}.pdf`;
}
