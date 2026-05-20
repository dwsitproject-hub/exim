"use client";

/** Download a DOM subtree as a PDF (A4 portrait). */
export async function downloadElementAsPdf(element: HTMLElement, filename: string): Promise<void> {
  const html2pdf = (await import("html2pdf.js")).default;
  const safeName = filename.trim().endsWith(".pdf") ? filename.trim() : `${filename.trim()}.pdf`;

  await html2pdf()
    .set({
      margin: [12, 12, 12, 12],
      filename: safeName,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    } as Record<string, unknown>)
    .from(element)
    .save();
}
