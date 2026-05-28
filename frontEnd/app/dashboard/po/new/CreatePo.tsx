"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { createTestPo } from "@/services/po-service";
import { Card } from "@/components/cards";
import { PageHeader } from "@/components/navigation";
import { Button, ComboboxSelect } from "@/components/forms";
import { useToast } from "@/components/providers/ToastProvider";
import { formatPriceInputWithCommas, roundTo2Decimals, roundTo3Decimals } from "@/lib/format-number";
import { INCOTERM_OPTIONS } from "@/lib/incoterms";
import { PT_OPTION_LABELS, PO_ITEM_UNIT_OPTIONS, getPlantConfigForPt } from "@/lib/po-create-constants";
import { isApiError } from "@/types/api";
import type { CreateTestPoPayload } from "@/types/po";
import styles from "./CreatePo.module.css";

type CreatePoFormState = Omit<CreateTestPoPayload, "external_id" | "items"> & {
  pt: string;
  currency?: string;
  items: ItemFormLine[];
};

/** One line item in the form; qty/price as strings so decimals can be typed (e.g. 1.25). */
type ItemFormLine = {
  item_description: string;
  qtyText: string;
  unit: string;
  priceText: string;
};

const CURRENCY_OPTIONS = ["USD", "IDR", "EUR", "GBP", "SGD", "JPY", "CNY", "AUD", "MYR", "THB"];

const NBSP = "\u00a0";
const UNIT_OPTIONS: string[] = PO_ITEM_UNIT_OPTIONS.filter(
  (u) => u.trim() !== "" && !u.includes(NBSP)
);
const UNIT_OPTION_SET = new Set<string>(UNIT_OPTIONS);

/** Allow partial decimal input while typing (qty only — no thousands separator). */
const DECIMAL_INPUT_PATTERN = /^\d*\.?\d*$/;

const initialItem = (): ItemFormLine => ({
  item_description: "",
  qtyText: "",
  unit: "",
  priceText: "",
});

/** Total line display: en-US thousands + 2 decimals (e.g. 12,221,111.00). */
function formatTotalAmountDisplay(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseOptionalDecimal(text: string): number | undefined {
  const t = text.replace(/,/g, "").trim();
  if (t === "" || t === ".") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function RequiredMark() {
  return (
    <span className={styles.labelRequired} aria-hidden>
      *
    </span>
  );
}

export function CreatePo() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { pushToast } = useToast();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<CreatePoFormState>({
    pt: "",
    po_number: "",
    plant: "",
    supplier_name: "",
    delivery_location: "",
    incoterm_location: "",
    kawasan_berikat: "",
    currency: "USD",
    items: [initialItem()],
  });

  function updateField<K extends keyof CreatePoFormState>(field: K, value: string | undefined) {
    setForm((prev) => ({ ...prev, [field]: value ?? "" }));
  }

  function handlePtChange(pt: string) {
    const config = getPlantConfigForPt(pt);
    setForm((prev) => {
      let plant = "";
      if (config?.mode === "fixed") plant = config.plant;
      return { ...prev, pt, plant };
    });
  }

  const plantConfig = form.pt ? getPlantConfigForPt(form.pt) : null;

  function updateItem<K extends keyof ItemFormLine>(index: number, field: K, value: ItemFormLine[K]) {
    setForm((prev) => {
      const items = [...(prev.items ?? [])];
      if (!items[index]) items[index] = initialItem();
      items[index] = { ...items[index], [field]: value };
      return { ...prev, items };
    });
  }

  const itemCount = form.items?.length ?? 0;
  const prevItemLen = useRef<number | null>(null);

  function addItem() {
    setForm((prev) => ({
      ...prev,
      items: [...(prev.items ?? []), initialItem()],
    }));
  }

  useEffect(() => {
    const len = form.items?.length ?? 0;
    if (prevItemLen.current !== null && len > prevItemLen.current) {
      const idx = len - 1;
      requestAnimationFrame(() => {
        document.getElementById(`po-item-desc-${idx}`)?.focus();
      });
    }
    prevItemLen.current = len;
  }, [form.items?.length]);

  function removeItem(index: number) {
    setForm((prev) => {
      const items = [...(prev.items ?? [])];
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
    if (!accessToken) return;

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

    const payload: CreateTestPoPayload = {
      external_id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      po_number: form.po_number.trim(),
      supplier_name: form.supplier_name.trim(),
      delivery_location: form.delivery_location.trim(),
      kawasan_berikat: form.kawasan_berikat,
      pt: form.pt.trim(),
    };
    if (form.plant?.trim()) payload.plant = form.plant.trim();
    if (form.incoterm_location?.trim()) payload.incoterm_location = form.incoterm_location.trim();
    if (form.currency?.trim()) payload.currency = form.currency.trim();

    payload.items = completeItems.map((it) => {
      const qty = parseOptionalDecimal(it.qtyText);
      const value = parseOptionalDecimal(it.priceText);
      return {
        item_description: it.item_description?.trim() || undefined,
        qty: qty != null ? roundTo2Decimals(qty) : undefined,
        unit: it.unit?.trim() || undefined,
        value: value != null ? roundTo3Decimals(value) : undefined,
      };
    });

    setSubmitting(true);
    createTestPo(payload, accessToken)
      .then((res) => {
        if (isApiError(res)) {
          setSubmitError(res.message);
          pushToast(res.message, "error");
          return;
        }
        pushToast("Purchase Order created.", "success");
        const data = res.data as { id?: string };
        if (data?.id) router.push(`/dashboard/po/${data.id}`);
        else router.push("/dashboard/po");
      })
      .finally(() => setSubmitting(false));
  }

  const poCurrency = form.currency || "USD";
  const showRemoveColumn = itemCount > 1;

  return (
    <section className={styles.section}>
      <PageHeader title="Create Purchase Order" backHref="/dashboard/po" backLabel="Purchase Order" />

      <form onSubmit={handleSubmit} className={styles.form}>
        {submitError && <p className={styles.formError}>{submitError}</p>}

        <Card className={styles.cardSpacing}>
          <h2 className={styles.sectionTitle}>General</h2>
          <div className={styles.grid}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="pt">
                PT <RequiredMark />
              </label>
              <select
                id="pt"
                className={styles.formSelect}
                value={form.pt}
                onChange={(e) => handlePtChange(e.target.value)}
                required
                aria-label="PT"
              >
                <option value="">— Select PT —</option>
                {PT_OPTION_LABELS.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="plant">
                Plant <RequiredMark />
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
                  title="Select PT first"
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
                  aria-label="Plant"
                >
                  <option value="">— Select plant —</option>
                  {plantConfig.plants.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="po_number">
                PO number <RequiredMark />
              </label>
              <input
                id="po_number"
                type="text"
                className={styles.formInput}
                value={form.po_number}
                onChange={(e) => updateField("po_number", e.target.value)}
                required
                placeholder="e.g. PO-2024-001"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="supplier_name">
                Supplier name <RequiredMark />
              </label>
              <input
                id="supplier_name"
                type="text"
                className={styles.formInput}
                value={form.supplier_name}
                onChange={(e) => updateField("supplier_name", e.target.value)}
                required
                autoComplete="off"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="delivery_location">
                Delivery location <RequiredMark />
              </label>
              <input
                id="delivery_location"
                type="text"
                className={styles.formInput}
                value={form.delivery_location ?? ""}
                onChange={(e) => updateField("delivery_location", e.target.value)}
                required
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
                Kawasan berikat <RequiredMark />
              </label>
              <select
                id="kawasan_berikat"
                className={styles.formSelect}
                value={form.kawasan_berikat ?? ""}
                onChange={(e) => updateField("kawasan_berikat", e.target.value)}
                required
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
            {itemCount === 0 ? (
              <div className={styles.itemsEmptyState} role="status">
                <p className={styles.itemsEmptyTitle}>Please add at least one item to proceed</p>
                <p className={styles.itemsEmptyHint}>Use &quot;+ Add item&quot; below to start a line.</p>
              </div>
            ) : (
              <table className={styles.itemsTable}>
                <thead>
                  <tr>
                    <th className={styles.itemsTh}>Description</th>
                    <th className={`${styles.itemsTh} ${styles.thMetricsGroup}`} colSpan={3}>
                      <div className={styles.metricsHeaderInner}>
                        <span>Qty</span>
                        <span>Unit</span>
                        <span>Price per unit ({poCurrency})</span>
                      </div>
                    </th>
                    <th className={`${styles.itemsTh} ${styles.itemsThTotal}`}>
                      Total amount ({poCurrency})
                    </th>
                    {showRemoveColumn && (
                      <th className={styles.itemsThRemove} aria-label="Remove row" />
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(form.items ?? []).map((item, index) => {
                    const total = getItemLineTotal(item);
                    const totalDisplay = total != null ? formatTotalAmountDisplay(total) : "";
                    const totalTitle = total != null ? totalDisplay : undefined;
                    return (
                      <tr key={index}>
                        <td className={styles.itemsTd}>
                          <textarea
                            id={`po-item-desc-${index}`}
                            className={styles.itemDescriptionInput}
                            value={item.item_description ?? ""}
                            onChange={(e) => updateItem(index, "item_description", e.target.value)}
                            rows={2}
                            aria-label="Item description"
                          />
                        </td>
                        <td className={`${styles.itemsTd} ${styles.tdMetricsGroup}`} colSpan={3}>
                          <div className={styles.metricsCluster}>
                            <input
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              className={`${styles.itemsInput} ${styles.itemsInputQty}`}
                              value={item.qtyText}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === "" || DECIMAL_INPUT_PATTERN.test(v)) {
                                  updateItem(index, "qtyText", v);
                                }
                              }}
                              aria-label="Qty"
                            />
                            <ComboboxSelect
                              className={styles.unitCombobox}
                              inputClassName={`${styles.itemsInput} ${styles.itemsInputDatalist} ${styles.itemsInputUnit}`}
                              options={UNIT_OPTIONS}
                              value={item.unit ?? ""}
                              onChange={(v) => updateItem(index, "unit", v)}
                              allowEmpty
                              emptyLabel="—"
                              placeholder=""
                              aria-label="Unit"
                            />
                            <input
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              className={`${styles.itemsInput} ${styles.itemsInputPrice}`}
                              value={item.priceText}
                              onChange={(e) =>
                                updateItem(index, "priceText", formatPriceInputWithCommas(e.target.value, 3))
                              }
                              aria-label="Price per unit"
                            />
                          </div>
                        </td>
                        <td className={`${styles.itemsTd} ${styles.itemsTdTotal}`}>
                          <input
                            type="text"
                            readOnly
                            tabIndex={-1}
                            className={styles.totalAmountReadonly}
                            value={totalDisplay || "—"}
                            title={totalTitle}
                            aria-label={`Total amount ${poCurrency}${totalTitle ? `: ${totalTitle}` : ""}`}
                          />
                        </td>
                        {showRemoveColumn && (
                          <td className={styles.itemsTdRemove}>
                            <button
                              type="button"
                              className={styles.removeRowBtn}
                              onClick={() => removeItem(index)}
                              aria-label="Remove item row"
                              title="Remove row"
                            >
                              Remove
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <button type="button" className={styles.addRowBtn} onClick={addItem}>
            + Add item
          </button>
        </Card>

        <div className={styles.stickyFormActions}>
          <div className={styles.stickyFormActionsInner}>
            <Link href="/dashboard/po" className={styles.cancelOutline}>
              Cancel
            </Link>
            <Button type="submit" variant="primary" disabled={submitting} className={styles.createPrimary}>
              {submitting ? "Creating…" : "Create Purchase Order"}
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}
