"use client";

import { useRef } from "react";
import type { ExportBulkingShipmentDetail, Invoice, InvoiceLine } from "@/types/export-bulking";
import { formatMoneyDisplay, formatQuantityDisplay } from "@/lib/format-numbers";
import { ExportDocumentToolbar } from "./ExportDocumentToolbar";
import { EXPORT_DOCUMENT_LETTERHEAD } from "./export-document-letterhead";
import { exportDocumentPdfName } from "./export-document-filename";
import styles from "./InvoiceDocument.module.css";

function dash(s: string | null | undefined): string {
  const t = s?.trim();
  return t ? t : "—";
}

function upperDoc(s: string | null | undefined): string {
  const t = s?.trim();
  return t ? t.toUpperCase() : "—";
}

function formatInvoiceDate(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d
    .toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    .toUpperCase();
}

function vesselLine(shipment: ExportBulkingShipmentDetail, snapshot: string | null | undefined): string {
  const snap = snapshot?.trim();
  if (snap) return upperDoc(snap);
  const vessel = shipment.vessel_name?.trim() ?? "";
  const voyage = shipment.voyage_number?.trim() ?? "";
  if (vessel && voyage) return `${vessel} V.${voyage}`.toUpperCase();
  return upperDoc(vessel || voyage || null);
}

function lineUnit(line: InvoiceLine, shipment: ExportBulkingShipmentDetail): string {
  if (line.cargo_line_id) {
    const cargo = shipment.cargo_lines.find((c) => c.id === line.cargo_line_id);
    const u = cargo?.unit?.trim();
    if (u) return u.toUpperCase();
  }
  return "MT";
}

function lineDescription(line: InvoiceLine, shipment: ExportBulkingShipmentDetail): string {
  if (line.description_of_goods?.trim()) return line.description_of_goods.trim();
  if (line.cargo_line_id) {
    const cargo = shipment.cargo_lines.find((c) => c.id === line.cargo_line_id);
    const d = cargo?.item_description?.trim();
    if (d) return d;
  }
  return "—";
}

function deliveryLine(shipment: ExportBulkingShipmentDetail): string | null {
  const inc = shipment.incoterms?.trim();
  const port = shipment.loadport_name?.trim();
  if (!inc) return null;
  if (port) return `DELIVERY : ${inc.toUpperCase()} PORT ${port.toUpperCase()}`;
  return `DELIVERY : ${inc.toUpperCase()}`;
}

function lineTotal(line: InvoiceLine): number | null {
  if (line.total_amount != null && !Number.isNaN(Number(line.total_amount))) {
    return Number(line.total_amount);
  }
  const q = line.quantity != null ? Number(line.quantity) : null;
  const p = line.unit_price != null ? Number(line.unit_price) : null;
  if (q == null || p == null || Number.isNaN(q) || Number.isNaN(p)) return null;
  return q * p;
}

export function InvoiceDocument({
  shipment,
  invoice,
  downloadFilename,
}: {
  shipment: ExportBulkingShipmentDetail;
  invoice: Invoice;
  downloadFilename?: string;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const pdfFilename =
    downloadFilename ?? exportDocumentPdfName("Invoice", invoice.invoice_no);
  const marks = dash(invoice.marks) === "—" ? "Without Mark" : dash(invoice.marks);
  const lines = invoice.lines ?? [];
  const primaryUnit = lines[0] ? lineUnit(lines[0], shipment) : "MT";

  const totalQty = lines.reduce((sum, l) => {
    const q = l.quantity != null ? Number(l.quantity) : 0;
    return sum + (Number.isNaN(q) ? 0 : q);
  }, 0);

  const totalAmount = lines.reduce((sum, l) => {
    const t = lineTotal(l);
    return sum + (t ?? 0);
  }, 0);

  const hasTotals = lines.length > 0 && totalQty > 0;
  const delivery = deliveryLine(shipment);

  return (
    <div className="invoice-print-root">
      <ExportDocumentToolbar
        pageRef={pageRef}
        filename={pdfFilename}
        printLabel="Print invoice"
        noPrintClassName="invoice-print-noPrint"
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

      <h2 className={styles.docTitle}>Invoice</h2>

      <div className={styles.metaRow}>
        <div>
          <div className={styles.metaLabel}>Messrs</div>
          <p className={styles.messrsValue}>{dash(invoice.messrs)}</p>
        </div>
        <div className={styles.invoiceMetaRight}>
          <p className={styles.invoiceMetaLine}>
            <strong>Invoice No</strong> : {dash(invoice.invoice_no)}
          </p>
          <p className={styles.invoiceMetaLine}>
            <strong>Date</strong> : {formatInvoiceDate(invoice.invoice_date)}
          </p>
        </div>
      </div>

      <section className={styles.shippingBlock} aria-label="Shipping details">
        <p className={styles.shippingLine}>
          <strong>Vessel</strong>
          {vesselLine(shipment, invoice.vessel_voyage_snapshot)}
        </p>
        <p className={styles.shippingLine}>
          <strong>Shipment from</strong>
          {upperDoc(invoice.loadport_snapshot ?? shipment.loadport_name)}
        </p>
        <p className={styles.shippingLine}>
          <strong>Destination</strong>
          {upperDoc(invoice.destination_snapshot)}
        </p>
      </section>

      <table className={styles.itemsTable}>
        <thead>
          <tr>
            <th className={styles.colMarks}>Marks</th>
            <th className={styles.colItem}>Item</th>
            <th className={styles.colDesc}>Description of goods</th>
            <th className={styles.colQty}>Quantity ({primaryUnit})</th>
            <th className={styles.colPrice}>Unit price (USD/{primaryUnit})</th>
            <th className={styles.colTotal}>Total amount (USD)</th>
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td colSpan={6}>—</td>
            </tr>
          ) : (
            lines.map((line, idx) => (
              <tr key={line.id || `line-${idx}`}>
                <td>{idx === 0 ? marks : ""}</td>
                <td className={styles.colItem}>{line.item_no ?? idx + 1}</td>
                <td>
                  <p className={styles.descMain}>{lineDescription(line, shipment)}</p>
                  {line.contract_no?.trim() ? (
                    <p className={styles.descSub}>
                      <span>CONTRACT NO :</span> {line.contract_no.trim()}
                    </p>
                  ) : null}
                  {line.so_no?.trim() ? (
                    <p className={styles.descSub}>
                      <span>SO :</span> {line.so_no.trim()}
                    </p>
                  ) : null}
                </td>
                <td className={styles.numCell}>
                  {line.quantity != null && !Number.isNaN(Number(line.quantity))
                    ? formatQuantityDisplay(Number(line.quantity))
                    : "—"}
                </td>
                <td className={styles.numCell}>
                  {line.unit_price != null && !Number.isNaN(Number(line.unit_price))
                    ? formatMoneyDisplay(Number(line.unit_price))
                    : "—"}
                </td>
                <td className={styles.numCell}>
                  {(() => {
                    const total = lineTotal(line);
                    return total != null ? formatMoneyDisplay(total) : "—";
                  })()}
                </td>
              </tr>
            ))
          )}
          {delivery ? (
            <tr className={styles.deliveryRow}>
              <td />
              <td />
              <td>
                <p className={styles.descSub} style={{ margin: 0 }}>
                  {delivery}
                </p>
              </td>
              <td />
              <td />
              <td />
            </tr>
          ) : null}
          {hasTotals ? (
            <tr className={styles.summaryRow}>
              <td />
              <td />
              <td />
              <td className={styles.numCell}>{formatQuantityDisplay(totalQty)}</td>
              <td />
              <td className={styles.numCell}>{formatMoneyDisplay(totalAmount)}</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <footer className={styles.footer}>
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
