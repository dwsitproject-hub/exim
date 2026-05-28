"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { getPoDetail, updatePo } from "@/services/po-service";
import { Card } from "@/components/cards";
import { PageHeader } from "@/components/navigation";
import { LoadingSkeleton } from "@/components/feedback";
import { Button, ComboboxSelect } from "@/components/forms";
import { useToast } from "@/components/providers/ToastProvider";
import {
  formatDecimal,
  formatPoUnitPrice,
  formatPriceInputWithCommas,
  roundTo2Decimals,
  roundTo3Decimals,
} from "@/lib/format-number";
import { formatPoLineQtyDisplay } from "@/lib/po-line-qty";
import { INCOTERM_OPTIONS } from "@/lib/incoterms";
import {
  PT_OPTION_LABELS,
  PO_ITEM_UNIT_OPTIONS,
  canonicalizePtLabel,
  getPlantConfigForPt,
} from "@/lib/po-create-constants";
import { parseYesNoSelectValue } from "@/lib/yes-no-field";
import { can } from "@/lib/permissions";
import { anyLinkedShipmentBlocksPoEdit, PO_EDIT_BLOCKED_BY_SHIPMENT_MESSAGE } from "@/lib/po-shipment-edit-lock";
import { isApiError } from "@/types/api";
import type { PoDetail as PoDetailType, UpdatePoPayload } from "@/types/po";
import styles from "../../new/CreatePo.module.css";

type EditPoFormState = {
  pt: string;
  po_number: string;
  plant: string;
  supplier_name: string;
  delivery_location: string;
  incoterm_location: string;
  kawasan_berikat: string;
  currency?: string;
  items: ItemFormLine[];
};

type ItemFormLine = {
  lineId?: string;
  item_description: string;
  qtyText: string;
  unit: string;
  priceText: string;
  /** Snapshot from API for persisted lines — shown as read-only reference while editing. */
  savedQty?: number | null;
  savedPrice?: number | null;
};

const CURRENCY_OPTIONS = ["USD", "IDR", "EUR", "GBP", "SGD", "JPY", "CNY", "AUD", "MYR", "THB"];
const UNIT_OPTIONS: string[] = [...PO_ITEM_UNIT_OPTIONS];
const UNIT_OPTION_SET = new Set<string>(UNIT_OPTIONS);
const DECIMAL_INPUT_PATTERN = /^\d*\.?\d*$/;

function initialItem(): ItemFormLine {
  return { lineId: undefined, item_description: "", qtyText: "", unit: "PCS", priceText: "" };
}

function parseOptionalDecimal(text: string): number | undefined {
  const t = text.replace(/,/g, "").trim();
  if (t === "" || t === ".") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** API / PG may send qty & unit price as strings — normalize for controlled inputs. */
function coerceApiNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const t = value.replace(/,/g, "").trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function detailToForm(detail: PoDetailType): EditPoFormState {
  const pt = canonicalizePtLabel(detail.pt);
  const pc = pt ? getPlantConfigForPt(pt) : null;
  let plant = detail.plant?.trim() ?? "";
  if (pc?.mode === "fixed") {
    plant = pc.plant;
  } else if (pc?.mode === "select" && plant) {
    const hit = pc.plants.find((p) => p.localeCompare(plant, undefined, { sensitivity: "accent" }) === 0);
    if (hit) plant = hit;
  }

  const rows =
    detail.items?.length > 0
      ? detail.items.map((it) => {
          const qtyN = coerceApiNumber(it.qty);
          const valueN = coerceApiNumber(it.value);
          return {
            lineId: it.id,
            item_description: it.item_description ?? "",
            qtyText: qtyN != null ? String(qtyN) : "",
            unit: it.unit?.trim() || "PCS",
            priceText: valueN != null ? formatPriceInputWithCommas(String(valueN), 3) : "",
            savedQty: qtyN,
            savedPrice: valueN,
          };
        })
      : [initialItem()];

  const yn = parseYesNoSelectValue(detail.kawasan_berikat);

  return {
    pt,
    plant,
    po_number: detail.po_number ?? "",
    supplier_name: detail.supplier_name ?? "",
    delivery_location: detail.delivery_location?.trim() ?? "",
    incoterm_location: detail.incoterm_location?.trim() ?? "",
    kawasan_berikat: yn,
    currency: detail.currency?.trim() || "USD",
    items: rows,
  };
}

export function PoEdit({ id }: { id: string }) {
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detail, setDetail] = useState<PoDetailType | null>(null);
  const [editLocked, setEditLocked] = useState(false);
  const [form, setForm] = useState<EditPoFormState | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    if (!accessToken || !id) return;
    setLoading(true);
    setLoadError(null);
    getPoDetail(id, accessToken)
      .then((res) => {
        if (isApiError(res)) {
          setLoadError(res.message);
          setDetail(null);
          setForm(null);
          return;
        }
        const d = res.data ?? null;
        setDetail(d);
        if (d) {
          setEditLocked(anyLinkedShipmentBlocksPoEdit(d.linked_shipments ?? []));
          setForm(detailToForm(d));
        } else {
          setForm(null);
        }
      })
      .catch(() => {
        setLoadError("Failed to load Purchase Order");
        setDetail(null);
        setForm(null);
      })
      .finally(() => setLoading(false));
  }, [accessToken, id]);

  useEffect(() => {
    load();
  }, [load]);

  function updateField<K extends keyof EditPoFormState>(field: K, value: string | undefined) {
    setForm((prev) => (prev ? { ...prev, [field]: value ?? "" } : prev));
  }

  function handlePtChange(pt: string) {
    const ptKey = canonicalizePtLabel(pt);
    const config = ptKey ? getPlantConfigForPt(ptKey) : null;
    setForm((prev) => {
      if (!prev) return prev;
      let plant = "";
      if (config?.mode === "fixed") plant = config.plant;
      return { ...prev, pt: ptKey || pt.trim(), plant };
    });
  }

  const ptKey = form?.pt ? canonicalizePtLabel(form.pt) : "";
  const plantConfig = ptKey ? getPlantConfigForPt(ptKey) : null;
  const ptInKnownList = form?.pt ? (PT_OPTION_LABELS as readonly string[]).includes(form.pt) : false;

  function updateItem<K extends keyof ItemFormLine>(index: number, field: K, value: ItemFormLine[K]) {
    setForm((prev) => {
      if (!prev) return prev;
      const items = [...(prev.items ?? [])];
      if (!items[index]) items[index] = initialItem();
      items[index] = { ...items[index], [field]: value };
      return { ...prev, items };
    });
  }

  function addItem() {
    setForm((prev) => (prev ? { ...prev, items: [...(prev.items ?? []), initialItem()] } : prev));
  }

  function removeItem(index: number) {
    setForm((prev) => {
      if (!prev) return prev;
      const items = [...(prev.items ?? [])];
      if (items.length <= 1) return prev;
      items.splice(index, 1);
      return { ...prev, items };
    });
  }

  function getItemLineTotal(item: ItemFormLine): number | null {
    const qty = parseOptionalDecimal(item.qtyText);
    const price = parseOptionalDecimal(item.priceText);
    if (qty == null || price == null) return null;
    const n = qty * price;
    return Number.isFinite(n) ? n : null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!accessToken || !form || editLocked) return;

    if (!form.po_number.trim()) {
      setSubmitError("PO number is required.");
      return;
    }
    if (!form.supplier_name.trim()) {
      setSubmitError("Supplier name is required.");
      return;
    }
    if (!form.pt.trim()) {
      setSubmitError("Please select PT.");
      return;
    }
    if (plantConfig?.mode === "select" && !form.plant?.trim()) {
      setSubmitError("Please select Plant.");
      return;
    }
    if (!plantConfig && form.pt.trim() && !form.plant?.trim()) {
      setSubmitError("Plant is required.");
      return;
    }
    if (!form.delivery_location?.trim()) {
      setSubmitError("Delivery location is required.");
      return;
    }
    if (form.kawasan_berikat !== "Yes" && form.kawasan_berikat !== "No") {
      setSubmitError("Please select Kawasan berikat (Yes or No).");
      return;
    }

    const completeItems = (form.items ?? []).filter((it) => {
      const desc = it.item_description?.trim() ?? "";
      const qty = parseOptionalDecimal(it.qtyText);
      const u = it.unit?.trim() ?? "";
      const price = parseOptionalDecimal(it.priceText);
      return (
        desc !== "" &&
        qty != null &&
        qty > 0 &&
        u !== "" &&
        UNIT_OPTION_SET.has(u) &&
        price != null &&
        price >= 0
      );
    });
    if (completeItems.length === 0) {
      setSubmitError(
        "Add at least one complete line item: description, quantity greater than 0, unit from the list, and price per unit."
      );
      return;
    }

    const payload: UpdatePoPayload = {
      po_number: form.po_number.trim(),
      supplier_name: form.supplier_name.trim(),
      delivery_location: form.delivery_location.trim(),
      kawasan_berikat: form.kawasan_berikat,
      pt: canonicalizePtLabel(form.pt.trim()),
      items: completeItems.map((it) => {
        const qty = parseOptionalDecimal(it.qtyText);
        const value = parseOptionalDecimal(it.priceText);
        const row: UpdatePoPayload["items"][number] = {
          item_description: it.item_description?.trim() || "",
          qty: qty != null ? roundTo2Decimals(qty) : 0,
          unit: it.unit?.trim() || "",
          value: value != null ? roundTo3Decimals(value) : 0,
        };
        if (it.lineId) row.id = it.lineId;
        return row;
      }),
    };
    if (form.plant?.trim()) payload.plant = form.plant.trim();
    if (form.incoterm_location?.trim()) payload.incoterm_location = form.incoterm_location.trim();
    if (form.currency?.trim()) payload.currency = form.currency.trim();

    setSubmitting(true);
    updatePo(id, payload, accessToken)
      .then((res) => {
        if (isApiError(res)) {
          setSubmitError(res.message);
          pushToast(res.message, "error");
          return;
        }
        pushToast("Purchase Order updated.", "success");
        router.push(`/dashboard/po/${id}`);
      })
      .finally(() => setSubmitting(false));
  }

  const allowed = can(user, "UPDATE_PO_INTAKE");
  const formDisabled = editLocked || submitting || !allowed;

  const poCurrency = form?.currency || "USD";

  if (loading) {
    return (
      <section className={styles.section}>
        <PageHeader title="Edit Purchase Order" backHref={`/dashboard/po/${id}`} backLabel="Purchase Order" />
        <LoadingSkeleton lines={6} />
      </section>
    );
  }

  if (loadError) {
    return (
      <section className={styles.section}>
        <PageHeader title="Edit Purchase Order" backHref="/dashboard/po" backLabel="Purchase Order" />
        <p className={styles.formError}>{loadError}</p>
        <Link href={`/dashboard/po/${id}`}>Back to detail</Link>
      </section>
    );
  }

  if (!allowed) {
    return (
      <section className={styles.section}>
        <PageHeader title="Edit Purchase Order" backHref={`/dashboard/po/${id}`} backLabel="Purchase Order" />
        <p className={styles.formError}>You do not have permission to edit Purchase Orders.</p>
        <Link href={`/dashboard/po/${id}`}>Back to detail</Link>
      </section>
    );
  }

  if (!form) return null;

  return (
    <section className={styles.section}>
      <PageHeader title="Edit Purchase Order" backHref={`/dashboard/po/${id}`} backLabel={detail?.po_number ?? "PO"} />

      {editLocked && <p className={styles.formError}>{PO_EDIT_BLOCKED_BY_SHIPMENT_MESSAGE}</p>}

      <form onSubmit={handleSubmit}>
        {submitError && <p className={styles.formError}>{submitError}</p>}

        <Card className={styles.cardSpacing}>
          <h2 className={styles.sectionTitle}>General</h2>
          <div className={styles.grid}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="pt">
                PT *
              </label>
              <select
                id="pt"
                className={styles.formSelect}
                value={form.pt}
                onChange={(e) => handlePtChange(e.target.value)}
                required
                disabled={formDisabled}
                aria-label="PT"
              >
                <option value="">— Select PT —</option>
                {form.pt && !ptInKnownList && (
                  <option value={form.pt}>
                    {form.pt}
                  </option>
                )}
                {PT_OPTION_LABELS.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="plant">
                Plant *
              </label>
              {!form.pt && (
                <input
                  id="plant"
                  type="text"
                  className={styles.formInput}
                  value=""
                  readOnly
                  disabled
                  placeholder="Select PT first"
                  aria-label="Plant"
                />
              )}
              {form.pt && plantConfig?.mode === "fixed" && (
                <input
                  id="plant"
                  type="text"
                  className={styles.formInput}
                  value={plantConfig.plant}
                  readOnly
                  disabled={formDisabled}
                  aria-label="Plant"
                />
              )}
              {form.pt && plantConfig?.mode === "select" && (
                <select
                  id="plant"
                  className={styles.formSelect}
                  value={form.plant ?? ""}
                  onChange={(e) => updateField("plant", e.target.value)}
                  required
                  disabled={formDisabled}
                  aria-label="Plant"
                >
                  <option value="">— Select plant —</option>
                  {form.plant &&
                    !plantConfig.plants.some(
                      (p) => p.localeCompare(form.plant ?? "", undefined, { sensitivity: "accent" }) === 0
                    ) && (
                      <option value={form.plant}>{form.plant}</option>
                    )}
                  {plantConfig.plants.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              )}
              {form.pt && !plantConfig && (
                <input
                  id="plant"
                  type="text"
                  className={styles.formInput}
                  value={form.plant ?? ""}
                  onChange={(e) => updateField("plant", e.target.value)}
                  required
                  disabled={formDisabled}
                  placeholder="Plant"
                  aria-label="Plant"
                />
              )}
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="po_number">
                PO number *
              </label>
              <input
                id="po_number"
                type="text"
                className={styles.formInput}
                value={form.po_number}
                onChange={(e) => updateField("po_number", e.target.value)}
                required
                disabled={formDisabled}
                placeholder="e.g. PO-2024-001"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="supplier_name">
                Supplier name *
              </label>
              <input
                id="supplier_name"
                type="text"
                className={styles.formInput}
                value={form.supplier_name}
                onChange={(e) => updateField("supplier_name", e.target.value)}
                required
                disabled={formDisabled}
                placeholder="Supplier name"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="delivery_location">
                Delivery location *
              </label>
              <input
                id="delivery_location"
                type="text"
                className={styles.formInput}
                value={form.delivery_location ?? ""}
                onChange={(e) => updateField("delivery_location", e.target.value)}
                required
                disabled={formDisabled}
                placeholder="Delivery location"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="incoterm_location">
                Incoterm
              </label>
              <select
                id="incoterm_location"
                className={styles.formSelect}
                value={form.incoterm_location ?? ""}
                onChange={(e) => updateField("incoterm_location", e.target.value || undefined)}
                disabled={formDisabled}
                aria-label="Incoterm"
              >
                <option value="">— Select —</option>
                {INCOTERM_OPTIONS.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="currency">
                Currency (for this PO)
              </label>
              <select
                id="currency"
                className={styles.formSelect}
                value={form.currency ?? "USD"}
                onChange={(e) => updateField("currency", e.target.value)}
                disabled={formDisabled}
                aria-label="Currency"
              >
                {CURRENCY_OPTIONS.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="kawasan_berikat">
                Kawasan berikat *
              </label>
              <select
                id="kawasan_berikat"
                className={styles.formSelect}
                value={form.kawasan_berikat ?? ""}
                onChange={(e) => updateField("kawasan_berikat", e.target.value)}
                required
                disabled={formDisabled}
                aria-label="Kawasan berikat"
              >
                <option value="">— Select —</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>
          </div>
        </Card>

        <Card className={styles.cardSpacing}>
          <h2 className={styles.sectionTitle}>
            Items
            <span className={styles.currencyBadge}>Currency: {poCurrency}</span>
          </h2>

          <div className={styles.itemsTableWrap}>
            <table className={styles.itemsTable}>
              <thead>
                <tr>
                  <th className={styles.itemsTh}>Description</th>
                  <th className={`${styles.itemsTh} ${styles.thMetricsGroup}`} colSpan={3}>
                    <div className={styles.metricsHeaderInner}>
                      <span>Order qty</span>
                      <span>Unit</span>
                      <span>Unit price ({poCurrency})</span>
                    </div>
                  </th>
                  <th className={`${styles.itemsTh} ${styles.itemsThCenter}`}>Total amount</th>
                  <th className={styles.itemsThRemove} aria-label="Remove row" />
                </tr>
              </thead>
              <tbody>
                {(form.items ?? []).map((item, index) => {
                  const total = getItemLineTotal(item);
                  return (
                    <tr key={item.lineId ?? `new-${index}`}>
                      <td className={styles.itemsTd}>
                        <textarea
                          className={styles.itemDescriptionInput}
                          value={item.item_description ?? ""}
                          onChange={(e) => updateItem(index, "item_description", e.target.value)}
                          placeholder="Item description"
                          rows={3}
                          disabled={formDisabled}
                          aria-label="Item description"
                        />
                      </td>
                      <td className={`${styles.itemsTd} ${styles.tdMetricsGroup}`} colSpan={3}>
                        <div className={styles.metricsCluster}>
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            className={styles.itemsInput}
                            value={item.qtyText}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "" || DECIMAL_INPUT_PATTERN.test(v)) {
                                updateItem(index, "qtyText", v);
                              }
                            }}
                            placeholder="0"
                            disabled={formDisabled}
                            aria-label="Qty"
                          />
                          <ComboboxSelect
                            className={styles.unitCombobox}
                            inputClassName={`${styles.itemsInput} ${styles.itemsInputDatalist}`}
                            options={UNIT_OPTIONS}
                            value={item.unit ?? ""}
                            onChange={(v) => updateItem(index, "unit", v || "PCS")}
                            allowEmpty={false}
                            placeholder="Type to search…"
                            disabled={formDisabled}
                            aria-label="Unit"
                          />
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            className={styles.itemsInput}
                            value={item.priceText}
                            onChange={(e) =>
                              updateItem(index, "priceText", formatPriceInputWithCommas(e.target.value, 3))
                            }
                            placeholder="1,234.56"
                            disabled={formDisabled}
                            aria-label="Unit price"
                          />
                        </div>
                        {item.lineId != null &&
                        (item.savedQty != null || item.savedPrice != null) &&
                        (Number.isFinite(Number(item.savedQty)) || Number.isFinite(Number(item.savedPrice))) ? (
                          <p className={styles.existingFromPoRef}>
                            From PO:{" "}
                            {item.savedQty != null && Number.isFinite(Number(item.savedQty))
                              ? formatPoLineQtyDisplay(item.savedQty)
                              : "—"}
                            {" qty · "}
                            {item.savedPrice != null && Number.isFinite(Number(item.savedPrice))
                              ? formatPoUnitPrice(item.savedPrice)
                              : "—"}
                            {` ${poCurrency}/unit`}
                          </p>
                        ) : null}
                      </td>
                      <td className={`${styles.itemsTd} ${styles.itemsTdTotal}`}>
                        {total != null ? formatDecimal(total) : "—"}
                      </td>
                      <td className={styles.itemsTdRemove}>
                        <button
                          type="button"
                          className={styles.removeRowBtn}
                          onClick={() => removeItem(index)}
                          disabled={formDisabled || (form.items ?? []).length <= 1}
                          aria-label="Remove item row"
                          title="Remove row"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button type="button" className={styles.addRowBtn} onClick={addItem} disabled={formDisabled}>
            + Add item
          </button>
        </Card>

        <div className={styles.formActions}>
          <Button type="submit" variant="primary" disabled={formDisabled}>
            {submitting ? "Saving…" : "Save changes"}
          </Button>
          <Link href={`/dashboard/po/${id}`}>
            <Button type="button" variant="secondary" disabled={submitting}>
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </section>
  );
}
