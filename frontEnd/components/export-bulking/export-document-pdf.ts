"use client";

/** Download a DOM subtree as a PDF (A4 portrait). */
export async function downloadElementAsPdf(element: HTMLElement, filename: string): Promise<void> {
  await waitForImages(element);

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

async function waitForImages(element: HTMLElement): Promise<void> {
  const imgs = [...element.querySelectorAll("img")];
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  );
}
