"use client";

import { useRef } from "react";
import { ExportDocumentToolbar } from "./ExportDocumentToolbar";
import { EXPORT_DOCUMENT_LETTERHEAD } from "./export-document-letterhead";
import { exportDocumentPdfName } from "./export-document-filename";
import styles from "./PackingListDocument.module.css";

export type PackingListDocumentPreview = {
  packing_list_number: string | null;
  vessel: string;
  commodity: string;
  quantity: string;
  port_of_loading: string;
  destination: string;
  packing: string;
  issued_date: string;
};

function dash(s: string | null | undefined): string {
  const t = s?.trim();
  return t ? t : "—";
}

export function PackingListDocument({
  data,
  downloadFilename,
}: {
  data: PackingListDocumentPreview;
  downloadFilename?: string;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const pdfFilename =
    downloadFilename ?? exportDocumentPdfName("Packing-List", data.packing_list_number);

  return (
    <div className="pl-print-root">
      <ExportDocumentToolbar
        pageRef={pageRef}
        filename={pdfFilename}
        printLabel="Print packing list"
        noPrintClassName="pl-print-noPrint"
      />
      <div ref={pageRef} className={styles.printScope}>
        <header>
          <h1 className={styles.companyName}>{EXPORT_DOCUMENT_LETTERHEAD.name}</h1>
          {EXPORT_DOCUMENT_LETTERHEAD.lines.map((line) => (
            <p key={line} className={styles.companyAddr}>
              {line}
            </p>
          ))}
          <hr className={styles.rule} />
        </header>

        <div className={styles.titleBlock}>
          <h2 className={styles.title}>Packing list</h2>
          <p className={styles.docNumber}>{dash(data.packing_list_number)}</p>
        </div>

        <section className={styles.bodyGrid} aria-label="Packing list details">
          <div className={styles.label}>Name of vessel</div>
          <div className={styles.value}>{dash(data.vessel)}</div>

          <div className={styles.label}>Commodity</div>
          <div className={styles.value}>{dash(data.commodity)}</div>

          <div className={styles.label}>Quantity</div>
          <div className={styles.value}>{dash(data.quantity)}</div>

          <div className={styles.label}>Port of loading</div>
          <div className={styles.value}>{dash(data.port_of_loading)}</div>

          <div className={styles.label}>Destination</div>
          <div className={styles.value}>{dash(data.destination)}</div>

          <hr className={styles.ruleGrey} />

          <div className={styles.label}>Packing</div>
          <div className={styles.value}>{dash(data.packing)}</div>
        </section>

        <footer className={styles.footer}>
          <div className={styles.footerDate}>{dash(data.issued_date)}</div>
          <div>Yours faithfully,</div>
          <div className={styles.signatureReserved} aria-hidden="true" />
          <div className={styles.footerCompany}>
            {EXPORT_DOCUMENT_LETTERHEAD.name.replace(/\./g, "").toUpperCase()}
          </div>
        </footer>
      </div>
    </div>
  );
}
