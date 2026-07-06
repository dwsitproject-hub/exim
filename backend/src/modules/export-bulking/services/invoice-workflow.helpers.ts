/**
 * Invoice workflow helpers — audit trail and snapshot persistence.
 */

import type { ExportBulkingRepository } from "../repositories/export-bulking.repository.js";
import type { InvoiceDto } from "../dto/index.js";
import {
  buildInvoiceSnapshot,
  computeInvoiceDiff,
  type InvoiceFieldChange,
  type InvoiceSnapshot,
} from "../utils/invoice-snapshot.js";

export type InvoiceRecord = Record<string, unknown> & {
  id?: string;
  status?: string;
  draft_snapshot?: InvoiceSnapshot | null;
};

export function invoiceRecordToSnapshot(inv: InvoiceRecord): InvoiceSnapshot {
  return buildInvoiceSnapshot({
    invoice_no: inv.invoice_no,
    invoice_date: inv.invoice_date,
    messrs: inv.messrs,
    vessel_voyage_snapshot: inv.vessel_voyage_snapshot,
    loadport_snapshot: inv.loadport_snapshot,
    destination_snapshot: inv.destination_snapshot,
    marks: inv.marks,
    shipping_instruction_id: inv.shipping_instruction_id,
    lines: (inv.lines as Array<Record<string, unknown>> | undefined) ?? [],
  });
}

export async function recordInvoiceSaveAudit(
  repo: ExportBulkingRepository,
  input: {
    before: InvoiceRecord;
    after: InvoiceRecord;
    userId?: string | null;
    reason?: string | null;
  },
): Promise<InvoiceFieldChange[]> {
  const beforeSnap =
    (input.before.draft_snapshot as InvoiceSnapshot | null | undefined) ??
    invoiceRecordToSnapshot(input.before);
  const afterSnap = invoiceRecordToSnapshot(input.after);
  const changes = computeInvoiceDiff(beforeSnap, afterSnap);

  await repo.persistInvoiceDraftSnapshot(String(input.after.id), afterSnap);

  if (changes.length > 0 || input.reason) {
    await repo.insertInvoiceEvent({
      invoiceId: String(input.after.id),
      eventType: "SAVED",
      fromStatus: String(input.before.status ?? "DRAFT"),
      toStatus: String(input.after.status ?? "DRAFT"),
      changes,
      reason: input.reason ?? null,
      changedBy: input.userId ?? null,
    });
  }

  return changes;
}

export function parseSplitQuantities(
  siTotal: number,
  mode: "equal" | "quantities",
  count?: number,
  quantities?: number[],
): number[] {
  if (mode === "quantities") {
    const qs = (quantities ?? []).map((q) => Number(q)).filter((q) => !Number.isNaN(q) && q > 0);
    if (qs.length === 0) {
      throw new Error("At least one positive quantity is required");
    }
    return qs;
  }
  const n = Math.max(2, Math.min(20, Math.floor(Number(count) || 2)));
  if (siTotal <= 0) {
    return Array.from({ length: n }, () => 0);
  }
  const base = Math.floor((siTotal / n) * 10000) / 10000;
  const parts = Array.from({ length: n }, () => base);
  const allocated = base * n;
  const remainder = Math.round((siTotal - allocated) * 10000) / 10000;
  if (parts.length > 0) {
    parts[parts.length - 1] = Math.round((parts[parts.length - 1] + remainder) * 10000) / 10000;
  }
  return parts;
}

export type { InvoiceFieldChange, InvoiceSnapshot };
