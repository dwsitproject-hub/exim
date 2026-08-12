"use client";

import { useEffect, useState } from "react";
import type { Invoice, InvoiceFieldChange, InvoiceEvent } from "@/types/export-bulking";
import { getInvoiceDiff, listInvoiceEvents } from "@/services/export-bulking-service";
import { isApiError } from "@/types/api";
import { Modal } from "@/components/overlays";
import styles from "./InvoiceWorkflow.module.css";
import detailStyles from "@/app/export/bulking/[id]/ExportBulkingDetail.module.css";

function DiffTable({ changes }: { changes: InvoiceFieldChange[] }) {
  if (changes.length === 0) {
    return <p className={styles.emptyDiff}>No field changes recorded.</p>;
  }
  return (
    <table className={styles.diffTable}>
      <thead>
        <tr>
          <th>Field</th>
          <th>Last draft save</th>
          <th>Final</th>
        </tr>
      </thead>
      <tbody>
        {changes.map((c, i) => (
          <tr key={`${c.field}-${i}`} className={styles.diffChanged}>
            <td>{c.field}</td>
            <td>{c.oldValue ?? "—"}</td>
            <td>{c.newValue ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function InvoiceFinalizeModal({
  open,
  shipmentId,
  invoice,
  accessToken,
  onClose,
  onConfirm,
  busy,
}: {
  open: boolean;
  shipmentId: string;
  invoice: Invoice;
  accessToken: string;
  onClose: () => void;
  onConfirm: (note: string) => void;
  busy?: boolean;
}) {
  const [note, setNote] = useState("");
  const [pendingChanges, setPendingChanges] = useState<InvoiceFieldChange[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !accessToken) return;
    setNote("");
    setLoading(true);
    void getInvoiceDiff(shipmentId, invoice.id, accessToken).then((res) => {
      if (!isApiError(res) && res.data?.changes) {
        setPendingChanges(res.data.changes);
      } else {
        setPendingChanges([]);
      }
      setLoading(false);
    });
  }, [open, shipmentId, invoice.id, accessToken]);

  return (
    <Modal
      open={open}
      title={`Finalize invoice — ${invoice.invoice_no?.trim() || "Draft"}`}
      onClose={onClose}
      size="wide"
      footer={
        <>
          <button type="button" className={detailStyles.btnSecondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={detailStyles.btnPrimary} onClick={() => onConfirm(note.trim())} disabled={busy}>
            {busy ? "Finalizing…" : "Confirm finalize"}
          </button>
        </>
      }
    >
      <div className={styles.finalizeSections}>
        <section>
          <p className={styles.sectionLabel}>Changes since last draft save</p>
          {loading ? <p className={styles.emptyDiff}>Loading…</p> : <DiffTable changes={pendingChanges} />}
        </section>
        <section>
          <div className={detailStyles.field}>
            <label className={detailStyles.fieldLabel}>Finalize note (optional)</label>
            <textarea
              className={`${detailStyles.fieldInput} ${detailStyles.textareaInput}`}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </section>
        <p className={styles.allocationMeta}>
          After finalizing, this invoice is locked. Use <strong>Amend</strong> to edit again (requires a reason).
        </p>
      </div>
    </Modal>
  );
}

export function InvoiceDiffModal({
  open,
  shipmentId,
  invoiceId,
  accessToken,
  title,
  onClose,
}: {
  open: boolean;
  shipmentId: string;
  invoiceId: string;
  accessToken: string;
  title: string;
  onClose: () => void;
}) {
  const [changes, setChanges] = useState<InvoiceFieldChange[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void getInvoiceDiff(shipmentId, invoiceId, accessToken).then((res) => {
      setChanges(!isApiError(res) && res.data?.changes ? res.data.changes : []);
      setLoading(false);
    });
  }, [open, shipmentId, invoiceId, accessToken]);

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      size="wide"
      footer={
        <button type="button" className={detailStyles.btnSecondary} onClick={onClose}>
          Close
        </button>
      }
    >
      {loading ? <p className={styles.emptyDiff}>Loading…</p> : <DiffTable changes={changes} />}
    </Modal>
  );
}

export function InvoiceAuditModal({
  open,
  shipmentId,
  invoiceId,
  accessToken,
  onClose,
}: {
  open: boolean;
  shipmentId: string;
  invoiceId: string;
  accessToken: string;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<InvoiceEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void listInvoiceEvents(shipmentId, invoiceId, accessToken).then((res) => {
      setEvents(!isApiError(res) && Array.isArray(res.data) ? res.data : []);
      setLoading(false);
    });
  }, [open, shipmentId, invoiceId, accessToken]);

  return (
    <Modal
      open={open}
      title="Invoice audit trail"
      onClose={onClose}
      size="wide"
      footer={
        <button type="button" className={detailStyles.btnSecondary} onClick={onClose}>
          Close
        </button>
      }
    >
      {loading ? (
        <p className={styles.emptyDiff}>Loading…</p>
      ) : events.length === 0 ? (
        <p className={styles.emptyDiff}>No audit events yet.</p>
      ) : (
        <ul className={styles.auditList}>
          {events.map((ev) => (
            <li key={ev.id} className={styles.auditItem}>
              <div className={styles.auditItemHead}>
                <span>{ev.event_type}</span>
                <span>{new Date(ev.changed_at).toLocaleString()}</span>
              </div>
              {(ev.from_status || ev.to_status) && (
                <div>
                  {ev.from_status ?? "—"} → {ev.to_status ?? "—"}
                </div>
              )}
              {ev.reason && <div>Reason: {ev.reason}</div>}
              {Array.isArray(ev.changes) && ev.changes.length > 0 && (
                <div>{ev.changes.length} field change(s)</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

export function InvoiceAmendPrompt({
  open,
  onClose,
  onConfirm,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  busy?: boolean;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  return (
    <Modal
      open={open}
      title="Amend finalized invoice"
      onClose={onClose}
      footer={
        <>
          <button type="button" className={detailStyles.btnSecondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={detailStyles.btnPrimary}
            onClick={() => onConfirm(reason.trim())}
            disabled={!reason.trim() || busy}
          >
            {busy ? "Reopening…" : "Reopen as draft"}
          </button>
        </>
      }
    >
      <p className={styles.allocationMeta}>
        This invoice will return to <strong>Draft</strong> status so you can edit it again. A reason is required for the
        audit trail.
      </p>
      <div className={detailStyles.field}>
        <label className={detailStyles.fieldLabel}>Reason</label>
        <textarea
          className={`${detailStyles.fieldInput} ${detailStyles.textareaInput}`}
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </Modal>
  );
}
