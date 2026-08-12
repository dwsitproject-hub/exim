"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canManageExportMasterList } from "@/lib/permissions";
import {
  listCommodities,
  createCommodity,
  updateCommodity,
  deleteCommodity,
  COMMODITY_TYPES,
  type Commodity,
  type CommodityType,
} from "@/services/commodity-service";
import { isApiError } from "@/types/api";
import type { ApiSuccess } from "@/types/api";
import { useToast } from "@/components/providers/ToastProvider";
import { AccessDenied } from "@/components/navigation";
import { Alert } from "@/components/feedback";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeaderCell,
} from "@/components/tables";
import { Modal } from "@/components/overlays/Modal";
import styles from "./CommodityList.module.css";

const MANAGE_COMMODITIES = "MANAGE_COMMODITIES";

type CommodityForm = {
  short_name: string;
  name: string;
  commodity_type: CommodityType;
};

const EMPTY_FORM: CommodityForm = {
  short_name: "",
  name: "",
  commodity_type: "Solid",
};

function formFromCommodity(commodity: Commodity): CommodityForm {
  return {
    short_name: commodity.short_name,
    name: commodity.name,
    commodity_type: commodity.commodity_type,
  };
}

function isFormValid(form: CommodityForm): boolean {
  return form.short_name.trim().length > 0 && form.name.trim().length > 0;
}

export function CommodityList() {
  const { user, accessToken } = useAuth();
  const [items, setItems] = useState<Commodity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const { pushToast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CommodityForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const allowed = canManageExportMasterList(user, MANAGE_COMMODITIES);

  const fetchList = useCallback(() => {
    if (!accessToken || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    listCommodities(accessToken)
      .then((res) => {
        if (isApiError(res)) {
          setError(res.message);
          return;
        }
        const success = res as ApiSuccess<Commodity[]>;
        setItems(success.data ?? []);
      })
      .catch(() => setError("Failed to load commodities"))
      .finally(() => setLoading(false));
  }, [accessToken, allowed]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const displayedItems = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const filtered = query
      ? items.filter(
          (commodity) =>
            commodity.short_name.toLowerCase().includes(query) ||
            commodity.name.toLowerCase().includes(query) ||
            commodity.commodity_type.toLowerCase().includes(query),
        )
      : items;

    return [...filtered].sort((a, b) => {
      const cmp = a.short_name.localeCompare(b.short_name, undefined, { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [items, filter, sortDir]);

  function toggleSort() {
    setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
  }

  const closeModal = useCallback(() => setModalOpen(false), []);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((commodity: Commodity) => {
    setEditingId(commodity.id);
    setForm(formFromCommodity(commodity));
    setModalOpen(true);
  }, []);

  async function handleSave() {
    if (!accessToken || !isFormValid(form)) return;
    const payload = {
      short_name: form.short_name.trim(),
      name: form.name.trim(),
      commodity_type: form.commodity_type,
    };
    setSaving(true);
    const res = editingId
      ? await updateCommodity(editingId, payload, accessToken)
      : await createCommodity(payload, accessToken);
    setSaving(false);
    if (isApiError(res)) {
      pushToast(res.message, "error");
      return;
    }
    pushToast(editingId ? "Commodity updated" : "Commodity created", "success");
    setModalOpen(false);
    fetchList();
  }

  async function handleDeleteCommodity(id: string) {
    if (!accessToken) return;
    const res = await deleteCommodity(id, accessToken);
    if (isApiError(res)) {
      pushToast(res.message, "error");
      return;
    }
    pushToast("Commodity deleted", "success");
    fetchList();
  }

  if (!allowed) {
    return (
      <AccessDenied
        title="Commodity"
        backHref="/admin/dashboard"
        backLabel="Dashboard"
        message="You do not have permission to manage commodities."
      />
    );
  }

  return (
    <section className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Commodity</h1>
        <button type="button" className={styles.addBtn} onClick={openCreate}>
          Add Commodity
        </button>
      </div>

      <div className={styles.listCard}>
        {error && (
          <div style={{ padding: "16px 20px 0" }}>
            <Alert>{error}</Alert>
          </div>
        )}

        {loading ? (
          <p className={styles.emptyState}>Loading…</p>
        ) : (
          <Table wrapperClassName={styles.tableWrapper}>
            <TableHead>
              <TableRow>
                <TableHeaderCell>
                  <button
                    type="button"
                    className={styles.sortBtn}
                    onClick={toggleSort}
                    aria-label={`Sort by short name ${sortDir === "asc" ? "ascending" : "descending"}`}
                  >
                    Short Commodity Name
                    <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>
                  </button>
                </TableHeaderCell>
                <TableHeaderCell>Commodity Name</TableHeaderCell>
                <TableHeaderCell>Type</TableHeaderCell>
                <TableHeaderCell className={styles.actionsHeader}>Actions</TableHeaderCell>
              </TableRow>
              <TableRow className={styles.filterRow}>
                <TableHeaderCell colSpan={4} className={styles.filterCell}>
                  <input
                    type="text"
                    className={styles.filterInput}
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter Commodity"
                    aria-label="Filter Commodity"
                  />
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {displayedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className={styles.emptyState}>
                    {filter.trim()
                      ? "No commodities match your filter."
                      : "No commodities yet. Add your first commodity."}
                  </TableCell>
                </TableRow>
              ) : (
                displayedItems.map((commodity) => (
                  <TableRow key={commodity.id}>
                    <TableCell>{commodity.short_name}</TableCell>
                    <TableCell className={styles.nameCell}>{commodity.name}</TableCell>
                    <TableCell className={styles.typeCell}>{commodity.commodity_type}</TableCell>
                    <TableCell className={styles.actionsCell}>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => openEdit(commodity)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => handleDeleteCommodity(commodity.id)}
                      >
                        Delete
                      </button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingId ? "Edit Commodity" : "Add Commodity"}
        footer={
          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelBtn} onClick={closeModal}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.saveBtn}
              onClick={handleSave}
              disabled={saving || !isFormValid(form)}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        }
      >
        <div className={styles.modalField}>
          <label htmlFor="commodity-short-name">Short Commodity Name</label>
          <input
            id="commodity-short-name"
            type="text"
            value={form.short_name}
            onChange={(e) => setForm((prev) => ({ ...prev, short_name: e.target.value }))}
          />
        </div>
        <div className={styles.modalField}>
          <label htmlFor="commodity-name">Commodity Name</label>
          <input
            id="commodity-name"
            type="text"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          />
        </div>
        <div className={styles.modalField}>
          <label htmlFor="commodity-type">Type</label>
          <select
            id="commodity-type"
            value={form.commodity_type}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, commodity_type: e.target.value as CommodityType }))
            }
          >
            {COMMODITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </Modal>
    </section>
  );
}
