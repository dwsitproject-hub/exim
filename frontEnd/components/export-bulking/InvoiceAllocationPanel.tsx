"use client";

import { useMemo } from "react";
import type { ExportBulkingShipmentDetail, ShippingInstruction } from "@/types/export-bulking";
import { siInvoiceSummary, invoiceStatusLabel, shippingInstructionDisplayLabel } from "@/lib/export-bulking-quantity";
import { formatNumberDisplay } from "@/lib/format-numbers";
import styles from "./InvoiceWorkflow.module.css";
import detailStyles from "@/app/export/bulking/[id]/ExportBulkingDetail.module.css";

function statusBadgeClass(status: string | undefined): string {
  return status === "FINAL"
    ? `${detailStyles.docStatusBadge} ${styles.statusFinal}`
    : `${detailStyles.docStatusBadge} ${styles.statusDraft}`;
}

export function InvoiceAllocationPanel({
  si,
  shipment,
  onAddInvoice,
  adding,
}: {
  si: ShippingInstruction;
  shipment: ExportBulkingShipmentDetail;
  onAddInvoice: () => void;
  adding?: boolean;
}) {
  const linkedInvoices = useMemo(
    () => shipment.invoices.filter((inv) => inv.shipping_instruction_id === si.id),
    [shipment.invoices, si.id],
  );

  const summary = useMemo(
    () => siInvoiceSummary(si, shipment.invoices),
    [si, shipment.invoices],
  );

  const pct =
    summary.siTotal > 0 ? Math.min(100, Math.round((summary.invoiced / summary.siTotal) * 100)) : 0;
  const siLabel = shippingInstructionDisplayLabel(si);

  return (
    <div className={styles.allocationPanel}>
      <div className={styles.allocationHeader}>
        <h4 className={styles.allocationTitle}>Invoice allocation — {siLabel}</h4>
        <p className={styles.allocationMeta}>
          Shipping instruction total: {formatNumberDisplay(summary.siTotal)} MT · Invoiced:{" "}
          {formatNumberDisplay(summary.invoiced)} MT · Remaining:{" "}
          {formatNumberDisplay(summary.remaining)} MT
        </p>
      </div>
      <div className={styles.progressBar} aria-hidden>
        <div
          className={`${styles.progressFill} ${summary.matched ? styles.progressFillComplete : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {linkedInvoices.length > 0 && (
        <div className={styles.invoiceMiniList}>
          {linkedInvoices.map((inv) => {
            const qty = (inv.lines ?? []).reduce((s, l) => s + Number(l.quantity ?? 0), 0);
            return (
              <div key={inv.id} className={styles.invoiceMiniRow}>
                <span>{inv.invoice_no?.trim() || "(untitled)"}</span>
                <span>{formatNumberDisplay(qty)} MT</span>
                <span className={statusBadgeClass(inv.status)}>{invoiceStatusLabel(inv.status)}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className={styles.allocationActions}>
        <button type="button" className={detailStyles.btnSecondary} onClick={onAddInvoice} disabled={adding}>
          {adding ? "Creating…" : "+ Add invoice"}
        </button>
      </div>
    </div>
  );
}

export function InvoiceStatusBadge({ status }: { status: string | undefined }) {
  return <span className={statusBadgeClass(status)}>{invoiceStatusLabel(status)}</span>;
}
