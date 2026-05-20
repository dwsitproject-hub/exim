"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useToast } from "@/components/providers/ToastProvider";
import { isApiError } from "@/types/api";
import type { ApiSuccess } from "@/types/api";
import type {
  CargoLine,
  CargoLineUpsertPayload,
  ExportBulkingListItem,
  Invoice,
  ShippingInstruction,
} from "@/types/export-bulking";
import type { ExportBulkingListView } from "@/lib/export-bulking-backlog";
import {
  createInvoice,
  createShippingInstruction,
  deleteCargoLine,
  deleteInvoice,
  deleteShippingInstruction,
  listCargoLines,
  listInvoices,
  listShippingInstructions,
  updateInvoice,
  upsertCargoLines,
} from "@/services/export-bulking-service";
import styles from "./ExportBulkingList.module.css";

export interface BulkingExpandDocsData {
  sis: ShippingInstruction[];
  invoices: Invoice[];
  cargoLines: CargoLine[];
}

export async function fetchBulkingExpandDocs(
  shipmentId: string,
  accessToken: string,
): Promise<BulkingExpandDocsData> {
  const [siRes, invRes, cargoRes] = await Promise.all([
    listShippingInstructions(shipmentId, accessToken),
    listInvoices(shipmentId, accessToken),
    listCargoLines(shipmentId, accessToken),
  ]);
  return {
    sis: !isApiError(siRes) ? ((siRes as ApiSuccess<ShippingInstruction[]>).data ?? []) : [],
    invoices: !isApiError(invRes) ? ((invRes as ApiSuccess<Invoice[]>).data ?? []) : [],
    cargoLines: !isApiError(cargoRes) ? ((cargoRes as ApiSuccess<CargoLine[]>).data ?? []) : [],
  };
}

interface CargoDraft {
  cargo_name: string;
  quantity: string;
  item_description: string;
  destination_port: string;
}

function cargoLineToDraft(c: CargoLine): CargoDraft {
  return {
    cargo_name: c.cargo_name ?? "",
    quantity: c.quantity != null ? String(c.quantity) : "",
    item_description: c.item_description ?? "",
    destination_port: c.destination_port ?? "",
  };
}

function buildCargoUpsertPayload(
  cargoLines: CargoLine[],
  edit: { id: string; draft: CargoDraft } | { draft: CargoDraft } | null,
): CargoLineUpsertPayload[] {
  const rows: Array<{ id?: string; draft: CargoDraft }> = cargoLines.map((c) => ({
    id: c.id,
    draft: cargoLineToDraft(c),
  }));

  if (edit && "id" in edit) {
    const idx = rows.findIndex((r) => r.id === edit.id);
    if (idx >= 0) rows[idx] = { id: edit.id, draft: edit.draft };
  } else if (edit) {
    rows.push({ draft: edit.draft });
  }

  return rows.map((r, idx) => ({
    ...(r.id ? { id: r.id } : {}),
    line_order: idx + 1,
    cargo_name: r.draft.cargo_name.trim() || "Untitled",
    quantity: r.draft.quantity.trim() ? Number(r.draft.quantity) : null,
    unit: null,
    item_description: r.draft.item_description.trim() || null,
    destination_port: r.draft.destination_port.trim() || null,
  }));
}

function CargoLineManager({
  shipmentId,
  accessToken,
  cargoLines,
  totalQuantity,
  canEdit,
  onRefresh,
}: {
  shipmentId: string;
  accessToken: string;
  cargoLines: CargoLine[];
  totalQuantity?: number | null;
  canEdit: boolean;
  onRefresh: () => Promise<void>;
}) {
  const { pushToast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<CargoDraft | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isEditing = Boolean(editingId || adding);

  function startEdit(line: CargoLine) {
    setEditingId(line.id);
    setAdding(false);
    setDraft(cargoLineToDraft(line));
    setConfirmDeleteId(null);
  }

  function startAdd() {
    setAdding(true);
    setEditingId(null);
    const seedQty =
      cargoLines.length === 0 && totalQuantity != null && totalQuantity > 0
        ? String(Math.round(Number(totalQuantity)))
        : "";
    setDraft({
      cargo_name: cargoLines.length === 0 ? "Cargo 1" : "",
      quantity: seedQty,
      item_description: "",
      destination_port: "",
    });
    setConfirmDeleteId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setAdding(false);
    setDraft(null);
  }

  async function saveDraft() {
    if (!draft) return;
    setBusy(true);
    const editPayload =
      editingId != null ? { id: editingId, draft } : adding ? { draft } : null;
    const payload = buildCargoUpsertPayload(cargoLines, editPayload);
    const res = await upsertCargoLines(shipmentId, payload, accessToken);
    if (isApiError(res)) pushToast(res.message, "error");
    else {
      await onRefresh();
      cancelEdit();
    }
    setBusy(false);
  }

  async function handleDelete(id: string) {
    setBusy(true);
    const res = await deleteCargoLine(shipmentId, id, accessToken);
    if (isApiError(res)) pushToast(res.message, "error");
    else await onRefresh();
    setConfirmDeleteId(null);
    setBusy(false);
  }

  if (cargoLines.length === 0 && !isEditing) {
    return (
      <div className={styles.cargoEmpty}>
        <span>No cargo lines yet.</span>
        {canEdit && (
          <button type="button" className={styles.docAddBtn} onClick={startAdd}>
            + Add cargo line
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={styles.cargoTable}>
      <div className={styles.cargoHeader}>
        <span>Cargo name</span>
        <span>Qty</span>
        <span>Description</span>
        <span>Dest</span>
        <span aria-hidden />
      </div>
      {cargoLines.map((line) => {
        if (editingId === line.id && draft) {
          return (
            <CargoEditBlock
              key={line.id}
              draft={draft}
              setDraft={setDraft}
              onSave={() => void saveDraft()}
              onCancel={cancelEdit}
              busy={busy}
              saveLabel="Save"
            />
          );
        }
        if (confirmDeleteId === line.id) {
          return (
            <div key={line.id} className={styles.cargoRowConfirm}>
              <span className={styles.cargoConfirmMsg}>
                Delete cargo &ldquo;{line.cargo_name?.trim() || "Untitled"}&rdquo;?
              </span>
              <button
                type="button"
                className={styles.cargoSaveBtn}
                onClick={() => void handleDelete(line.id)}
                disabled={busy}
              >
                Yes
              </button>
              <button
                type="button"
                className={styles.cargoCancelBtn}
                onClick={() => setConfirmDeleteId(null)}
                disabled={busy}
              >
                No
              </button>
            </div>
          );
        }
        return (
          <div key={line.id} className={styles.cargoRow}>
            <span className={styles.cargoColName} title={line.cargo_name}>
              {line.cargo_name?.trim() || <em className={styles.cellEmpty}>unnamed</em>}
            </span>
            <span className={styles.cargoColQty}>
              {line.quantity != null ? line.quantity : "—"}
            </span>
            <span className={styles.cargoColDesc} title={line.item_description ?? undefined}>
              {line.item_description?.trim() || "—"}
            </span>
            <span className={styles.cargoColDest} title={line.destination_port ?? undefined}>
              {line.destination_port?.trim() || "—"}
            </span>
            {canEdit && (
              <span className={styles.cargoColActions}>
                <button
                  type="button"
                  className={styles.cargoEditBtn}
                  onClick={() => startEdit(line)}
                  aria-label={`Edit ${line.cargo_name || "cargo line"}`}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className={styles.cargoDeleteBtn}
                  onClick={() => setConfirmDeleteId(line.id)}
                  aria-label={`Delete ${line.cargo_name || "cargo line"}`}
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              </span>
            )}
          </div>
        );
      })}
      {adding && draft && (
        <CargoEditBlock
          key="new-cargo"
          draft={draft}
          setDraft={setDraft}
          onSave={() => void saveDraft()}
          onCancel={cancelEdit}
          busy={busy}
          saveLabel="Add"
        />
      )}
      {canEdit && !isEditing && (
        <div className={styles.cargoAddRow}>
          <button type="button" className={styles.docAddBtn} onClick={startAdd}>
            + Add cargo line
          </button>
        </div>
      )}
    </div>
  );
}

function CargoEditBlock({
  draft,
  setDraft,
  onSave,
  onCancel,
  busy,
  saveLabel,
}: {
  draft: CargoDraft;
  setDraft: (d: CargoDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  saveLabel: string;
}) {
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  return (
    <div className={styles.cargoEditBlock}>
      <div className={styles.cargoFieldsRow}>
        <input
          ref={nameRef}
          className={`${styles.cargoInput} ${styles.cargoInputGrow}`}
          placeholder="Cargo name"
          value={draft.cargo_name}
          disabled={busy}
          onChange={(e) => setDraft({ ...draft, cargo_name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSave();
            }
            if (e.key === "Escape") onCancel();
          }}
          aria-label="Cargo name"
        />
        <input
          className={styles.cargoInput}
          placeholder="Qty"
          type="number"
          step="any"
          value={draft.quantity}
          disabled={busy}
          onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
          aria-label="Quantity"
        />
        <input
          className={`${styles.cargoInput} ${styles.cargoInputWide}`}
          placeholder="Description"
          value={draft.item_description}
          disabled={busy}
          onChange={(e) => setDraft({ ...draft, item_description: e.target.value })}
          aria-label="Description"
        />
        <input
          className={styles.cargoInput}
          placeholder="Dest port"
          value={draft.destination_port}
          disabled={busy}
          onChange={(e) => setDraft({ ...draft, destination_port: e.target.value })}
          aria-label="Destination port"
        />
      </div>
      <div className={styles.cargoActionsBar}>
        <button type="button" className={styles.cargoSaveBtn} onClick={onSave} disabled={busy}>
          {saveLabel}
        </button>
        <button type="button" className={styles.cargoCancelBtn} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function BulkingExpandDocsPanel({
  row,
  accessToken,
  data,
  loading,
  canViewDocs,
  canEditCargo,
  listView = "all",
  onRefresh,
}: {
  row: ExportBulkingListItem;
  accessToken: string;
  data: BulkingExpandDocsData | null;
  loading: boolean;
  canViewDocs: boolean;
  canEditCargo: boolean;
  listView?: ExportBulkingListView;
  onRefresh: () => Promise<void>;
}) {
  const cargoLines = data?.cargoLines ?? [];
  const sis = data?.sis ?? [];
  const invoices = data?.invoices ?? [];

  const showCargo = listView === "all" || listView === "operations";
  const showDocs = (listView === "all" || listView === "documentation") && canViewDocs;

  let panelClass = styles.expandedPanel;
  if (listView === "documentation" && showDocs) {
    panelClass = styles.expandedPanelDocsOnly;
  } else if (listView === "operations" || !canViewDocs) {
    panelClass = `${styles.expandedPanel} ${styles.expandedPanelNoDocs}`;
  } else if (!showDocs) {
    panelClass = `${styles.expandedPanel} ${styles.expandedPanelNoDocs}`;
  }

  return (
    <div className={panelClass}>
      {showCargo && (
      <div className={`${styles.expandSection} ${showDocs ? styles.expandSectionCargo : ""}`}>
        <div className={styles.expandSectionTitle}>Cargo</div>
        {loading ? (
          <span className={styles.expandLoading}>Loading…</span>
        ) : (
          <CargoLineManager
            shipmentId={row.id}
            accessToken={accessToken}
            cargoLines={cargoLines}
            totalQuantity={row.total_quantity}
            canEdit={canEditCargo}
            onRefresh={onRefresh}
          />
        )}
      </div>
      )}
      {showDocs && (
      <div className={styles.expandSection}>
        <div className={styles.expandSectionTitle}>Documents</div>
        {loading ? (
          <span className={styles.expandLoading}>Loading…</span>
        ) : (
          <>
            <DocNumberRow
              label="SI No"
              records={sis.map((s) => ({
                id: s.id,
                value: s.si_number ?? "",
                cargoLineId: s.lines?.[0]?.cargo_line_id ?? null,
              }))}
              cargoLines={cargoLines}
              onCreate={async (cargoLineId) => {
                await createShippingInstruction(row.id, { cargo_line_id: cargoLineId ?? undefined }, accessToken);
                await onRefresh();
              }}
              onDelete={async (id) => {
                await deleteShippingInstruction(row.id, id, accessToken);
                await onRefresh();
              }}
            />
            <SiInvoiceHierarchyPanel
              shipmentId={row.id}
              accessToken={accessToken}
              sis={sis}
              invoices={invoices}
              cargoLines={cargoLines}
              onRefresh={onRefresh}
            />
          </>
        )}
      </div>
      )}
      {listView === "documentation" && !canViewDocs && (
        <p className={styles.queueSummary}>You do not have permission to view export documentation.</p>
      )}
      <div className={styles.expandActions}>
        <Link
          href={listView === "documentation" ? `/export/bulking/${row.id}?focus=documents` : `/export/bulking/${row.id}`}
          className={styles.expandDetailLink}
        >
          Open full detail →
        </Link>
      </div>
    </div>
  );
}

function invoiceLinesToPatchBody(inv: Invoice): Record<string, unknown>[] {
  return (inv.lines ?? []).map((line, idx) => ({
    cargo_line_id: line.cargo_line_id,
    item_no: line.item_no ?? idx + 1,
    description_of_goods: line.description_of_goods,
    contract_no: line.contract_no,
    so_no: line.so_no,
    quantity: line.quantity,
    unit_price: line.unit_price,
    total_amount: line.total_amount,
  }));
}

function distinctInvoiceSoNos(inv: Invoice): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const line of inv.lines ?? []) {
    const s = line.so_no?.trim();
    if (s && !seen.has(s)) {
      seen.add(s);
      list.push(s);
    }
  }
  return list;
}

function SiInvoiceHierarchyPanel({
  shipmentId,
  accessToken,
  sis,
  invoices,
  cargoLines,
  onRefresh,
}: {
  shipmentId: string;
  accessToken: string;
  sis: ShippingInstruction[];
  invoices: Invoice[];
  cargoLines: CargoLine[];
  onRefresh: () => Promise<void>;
}) {
  const unassigned = invoices.filter((inv) => !inv.shipping_instruction_id);

  return (
    <div className={styles.docHierarchy}>
      <span className={styles.expandFieldLabel}>Invoices (grouped under SI)</span>
      <p className={styles.docHierarchyHint}>
        <strong>SI → Invoice → SO:</strong> Each SI can carry many invoices. Invoices are listed here under their SI (or
        under &ldquo;Unassigned&rdquo;). <strong>Sales order (SO)</strong> numbers sit on invoice lines; use{" "}
        <strong>+ SO</strong> when one invoice references several orders.
      </p>

      {sis.map((si) => {
        const under = invoices.filter((inv) => inv.shipping_instruction_id === si.id);
        const label = si.si_number?.trim() ?? `SI ${si.id.slice(0, 8)}…`;
        return (
          <InvoiceGroupUnderSiBlock
            key={si.id}
            shipmentId={shipmentId}
            accessToken={accessToken}
            heading={`Under SI: ${label}`}
            shippingInstructionId={si.id}
            invoices={under}
            cargoLines={cargoLines}
            onRefresh={onRefresh}
          />
        );
      })}

      {sis.length === 0 && invoices.length === 0 && (
        <p className={styles.expandLoading}>Add shipping instructions above, then add invoices under each SI.</p>
      )}

      {unassigned.length > 0 && (
        <InvoiceGroupUnderSiBlock
          shipmentId={shipmentId}
          accessToken={accessToken}
          heading="Unassigned invoices"
          shippingInstructionId={null}
          invoices={unassigned}
          cargoLines={cargoLines}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}

function InvoiceGroupUnderSiBlock({
  shipmentId,
  accessToken,
  heading,
  shippingInstructionId,
  invoices,
  cargoLines,
  onRefresh,
}: {
  shipmentId: string;
  accessToken: string;
  heading: string;
  shippingInstructionId: string | null;
  invoices: Invoice[];
  cargoLines: CargoLine[];
  onRefresh: () => Promise<void>;
}) {
  const { pushToast } = useToast();
  const [adding, setAdding] = useState(false);
  const [newCargoId, setNewCargoId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    setBusy(true);
    const payload: Record<string, unknown> = {
      ...(shippingInstructionId ? { shipping_instruction_id: shippingInstructionId } : {}),
      ...(newCargoId ? { cargo_line_id: newCargoId } : {}),
    };
    const res = await createInvoice(shipmentId, payload, accessToken);
    if (isApiError(res)) pushToast(res.message, "error");
    else await onRefresh();
    setNewCargoId(null);
    setAdding(false);
    setBusy(false);
  }

  return (
    <div className={styles.docSiGroup}>
      <div className={styles.docSiGroupHeading}>{heading}</div>
      <div className={styles.docInvoiceList}>
        {invoices.map((inv) => (
          <InvoiceExpandBlock
            key={inv.id}
            shipmentId={shipmentId}
            inv={inv}
            cargoLines={cargoLines}
            accessToken={accessToken}
            onRefresh={onRefresh}
          />
        ))}
        {adding ? (
          <div className={styles.docChipAdding}>
            <div className={styles.docChipAddingRow}>
              {cargoLines.length > 0 && (
                <select
                  className={styles.docChipCargoSelect}
                  value={newCargoId ?? ""}
                  onChange={(e) => setNewCargoId(e.target.value || null)}
                  aria-label="Optional cargo link for new invoice (first line)"
                >
                  <option value="">No cargo link</option>
                  {cargoLines.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.cargo_name || `Cargo ${c.line_order}`}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className={styles.docChipAddingActions}>
              <button type="button" className={styles.cargoSaveBtn} onClick={() => void handleCreate()} disabled={busy}>
                Add invoice
              </button>
              <button
                type="button"
                className={styles.cargoCancelBtn}
                onClick={() => {
                  setAdding(false);
                  setNewCargoId(null);
                }}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={styles.docAddBtn} onClick={() => setAdding(true)}>
            + Add invoice
          </button>
        )}
      </div>
    </div>
  );
}

function InvoiceExpandBlock({
  shipmentId,
  inv,
  cargoLines,
  accessToken,
  onRefresh,
}: {
  shipmentId: string;
  inv: Invoice;
  cargoLines: CargoLine[];
  accessToken: string;
  onRefresh: () => Promise<void>;
}) {
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [addingSo, setAddingSo] = useState(false);
  const [newSo, setNewSo] = useState("");
  const newSoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingSo && newSoRef.current) newSoRef.current.focus();
  }, [addingSo]);

  function cargoLabel(cid: string | null): string | null {
    if (!cid) return null;
    return cargoLines.find((c) => c.id === cid)?.cargo_name ?? cid.slice(0, 8);
  }

  async function persistLines(next: Record<string, unknown>[]) {
    setBusy(true);
    const res = await updateInvoice(shipmentId, inv.id, { lines: next }, accessToken);
    if (isApiError(res)) pushToast(res.message, "error");
    else await onRefresh();
    setBusy(false);
  }

  async function handleDeleteInvoice() {
    setBusy(true);
    const res = await deleteInvoice(shipmentId, inv.id, accessToken);
    if (isApiError(res)) pushToast(res.message, "error");
    else await onRefresh();
    setBusy(false);
    setConfirmDel(false);
  }

  async function handleAddSo() {
    const t = newSo.trim();
    if (!t) return;
    const base = invoiceLinesToPatchBody(inv);
    const maxNo = (inv.lines ?? []).reduce((m, ln) => Math.max(m, ln.item_no ?? 0), 0);
    base.push({
      cargo_line_id: null,
      item_no: maxNo + 1,
      description_of_goods: null,
      contract_no: null,
      so_no: t,
      quantity: null,
      unit_price: null,
      total_amount: null,
    });
    await persistLines(base);
    setNewSo("");
    setAddingSo(false);
  }

  async function handleStripSo(soLabel: string) {
    const next = invoiceLinesToPatchBody(inv).map((ln) =>
      ((ln.so_no as string)?.trim() === soLabel ? { ...ln, so_no: null } : ln),
    );
    await persistLines(next);
  }

  const linkCargoId = inv.lines?.[0]?.cargo_line_id ?? null;
  const sos = distinctInvoiceSoNos(inv);

  return (
    <div className={styles.docInvoiceNest}>
      <div className={styles.docInvoiceHead}>
        {confirmDel ? (
          <span className={styles.docChipConfirm}>
            <span>Delete invoice &ldquo;{inv.invoice_no ?? "(untitled)"}&rdquo;?</span>
            <button type="button" className={styles.docChipConfirmYes} onClick={() => handleDeleteInvoice()} disabled={busy}>
              Yes
            </button>
            <button type="button" className={styles.docChipConfirmNo} onClick={() => setConfirmDel(false)} disabled={busy}>
              No
            </button>
          </span>
        ) : (
          <span className={styles.docChip}>
            <span className={styles.docInvoiceNestLabel}>Inv</span>
            {linkCargoId && (
              <span className={styles.docChipCargo} title="Cargo link (first invoice line)">
                ↗{cargoLabel(linkCargoId)}
              </span>
            )}
            <span className={styles.docChipLabel} title="System-assigned invoice number">
              {inv.invoice_no?.trim() || <em className={styles.cellEmpty}>unnamed</em>}
            </span>
            <button
              type="button"
              className={styles.docChipDelete}
              onClick={() => setConfirmDel(true)}
              aria-label="Delete invoice"
              disabled={busy}
            >
              <X size={10} strokeWidth={2.5} />
            </button>
          </span>
        )}
      </div>
      {!confirmDel && (
        <div className={styles.docInvoiceSoBlock}>
          <span className={styles.docInvoiceSoPrefix}>Sales orders</span>
          <div className={styles.docSoChipRow}>
            {sos.map((so) => (
              <span key={so} className={styles.docSoChip}>
                <span>{so}</span>
                <button
                  type="button"
                  className={styles.docSoChipRemove}
                  onClick={() => handleStripSo(so)}
                  disabled={busy}
                  aria-label={`Remove SO ${so}`}
                >
                  ×
                </button>
              </span>
            ))}
            {addingSo ? (
              <span className={styles.docSoAddWrap}>
                <input
                  ref={newSoRef}
                  className={styles.docSoAddInput}
                  value={newSo}
                  placeholder="SO no."
                  disabled={busy}
                  onChange={(e) => setNewSo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddSo();
                    }
                    if (e.key === "Escape") {
                      setAddingSo(false);
                      setNewSo("");
                    }
                  }}
                />
                <button type="button" className={styles.cargoSaveBtn} onClick={() => handleAddSo()} disabled={busy}>
                  Add
                </button>
                <button
                  type="button"
                  className={styles.cargoCancelBtn}
                  onClick={() => {
                    setAddingSo(false);
                    setNewSo("");
                  }}
                  disabled={busy}
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" className={styles.docAddSoBtn} onClick={() => setAddingSo(true)} disabled={busy}>
                + SO
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DocNumberRow({
  label,
  records,
  cargoLines,
  onCreate,
  onDelete,
}: {
  label: string;
  records: { id: string; value: string; cargoLineId: string | null }[];
  cargoLines: CargoLine[];
  onCreate: (cargoLineId: string | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [newCargoId, setNewCargoId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    setBusy(true);
    try {
      await onCreate(newCargoId);
    } finally {
      setNewCargoId(null);
      setAdding(false);
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    try {
      await onDelete(id);
    } finally {
      setConfirmDeleteId(null);
      setBusy(false);
    }
  }

  function cargoLabel(id: string | null) {
    if (!id) return null;
    const line = cargoLines.find((c) => c.id === id);
    return line?.cargo_name ?? id.slice(0, 8);
  }

  return (
    <div className={styles.docNumberRow}>
      <span className={styles.expandFieldLabel}>{label}</span>
      <div className={styles.docNumberList}>
        {records.map((rec) =>
          confirmDeleteId === rec.id ? (
            <span key={rec.id} className={styles.docChipConfirm}>
              <span>Delete &ldquo;{rec.value || "(empty)"}&rdquo;?</span>
              <button type="button" className={styles.docChipConfirmYes} onClick={() => handleDelete(rec.id)} disabled={busy}>
                Yes
              </button>
              <button type="button" className={styles.docChipConfirmNo} onClick={() => setConfirmDeleteId(null)} disabled={busy}>
                No
              </button>
            </span>
          ) : (
            <span key={rec.id} className={styles.docChip} title={rec.cargoLineId ? `Linked to: ${cargoLabel(rec.cargoLineId)}` : undefined}>
              {rec.cargoLineId && <span className={styles.docChipCargo}>↗{cargoLabel(rec.cargoLineId)}</span>}
              <span className={styles.docChipLabel}>{rec.value || <em className={styles.cellEmpty}>unnamed</em>}</span>
              <button
                type="button"
                className={styles.docChipDelete}
                onClick={() => setConfirmDeleteId(rec.id)}
                aria-label={`Delete ${label} ${rec.value}`}
              >
                <X size={10} strokeWidth={2.5} />
              </button>
            </span>
          ),
        )}
        {adding ? (
          <div className={styles.docChipAdding}>
            <div className={styles.docChipAddingRow}>
              {cargoLines.length > 0 && (
                <select
                  className={styles.docChipCargoSelect}
                  value={newCargoId ?? ""}
                  onChange={(e) => setNewCargoId(e.target.value || null)}
                  aria-label={`Optional cargo link for new ${label}`}
                >
                  <option value="">No cargo link</option>
                  {cargoLines.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.cargo_name || `Cargo ${c.line_order}`}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className={styles.docChipAddingActions}>
              <button type="button" className={styles.cargoSaveBtn} onClick={() => void handleCreate()} disabled={busy}>
                Add SI
              </button>
              <button
                type="button"
                className={styles.cargoCancelBtn}
                onClick={() => {
                  setAdding(false);
                  setNewCargoId(null);
                }}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={styles.docAddBtn} onClick={() => setAdding(true)}>
            + Add SI
          </button>
        )}
      </div>
    </div>
  );
}
