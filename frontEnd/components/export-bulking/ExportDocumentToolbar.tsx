"use client";

import { useState, type RefObject } from "react";
import { downloadElementAsPdf } from "./export-document-pdf";
import styles from "./ExportDocumentToolbar.module.css";

export function ExportDocumentToolbar({
  pageRef,
  filename,
  printLabel = "Print",
  downloadLabel = "Download PDF",
  noPrintClassName = "export-doc-noPrint",
}: {
  pageRef: RefObject<HTMLElement | null>;
  filename: string;
  printLabel?: string;
  downloadLabel?: string;
  /** Extra class for print hide (e.g. si-print-noPrint). */
  noPrintClassName?: string;
}) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    const el = pageRef.current;
    if (!el) return;
    setDownloading(true);
    try {
      await downloadElementAsPdf(el, filename);
    } catch {
      window.alert("Could not generate PDF. Try Print and save as PDF instead.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className={`${styles.toolRow} ${noPrintClassName}`}>
      <button type="button" className={styles.btn} onClick={() => window.print()}>
        {printLabel}
      </button>
      <button type="button" className={styles.btnPrimary} onClick={handleDownload} disabled={downloading}>
        {downloading ? "Generating PDF…" : downloadLabel}
      </button>
    </div>
  );
}
