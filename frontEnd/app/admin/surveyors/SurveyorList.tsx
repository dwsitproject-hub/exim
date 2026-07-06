"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canManageExportMasterList } from "@/lib/permissions";
import {
  listSurveyors,
  createSurveyor,
  updateSurveyor,
  deleteSurveyor,
  type Surveyor,
} from "@/services/surveyor-service";
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
import styles from "./SurveyorList.module.css";

const MANAGE_SURVEYORS = "MANAGE_SURVEYORS";

export function SurveyorList() {
  const { user, accessToken } = useAuth();
  const [items, setItems] = useState<Surveyor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const { pushToast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameValue, setNameValue] = useState("");
  const [saving, setSaving] = useState(false);

  const allowed = canManageExportMasterList(user, MANAGE_SURVEYORS);

  const fetchList = useCallback(() => {
    if (!accessToken || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    listSurveyors(accessToken)
      .then((res) => {
        if (isApiError(res)) {
          setError(res.message);
          return;
        }
        const success = res as ApiSuccess<Surveyor[]>;
        setItems(success.data ?? []);
      })
      .catch(() => setError("Failed to load surveyors"))
      .finally(() => setLoading(false));
  }, [accessToken, allowed]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const displayedItems = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const filtered = query
      ? items.filter((surveyor) => surveyor.name.toLowerCase().includes(query))
      : items;

    return [...filtered].sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [items, filter, sortDir]);

  function toggleSort() {
    setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
  }

  const openCreate = useCallback(() => {
    setEditingId(null);
    setNameValue("");
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((surveyor: Surveyor) => {
    setEditingId(surveyor.id);
    setNameValue(surveyor.name);
    setModalOpen(true);
  }, []);

  async function handleSave() {
    if (!accessToken || !nameValue.trim()) return;
    setSaving(true);
    const res = editingId
      ? await updateSurveyor(editingId, { name: nameValue.trim() }, accessToken)
      : await createSurveyor({ name: nameValue.trim() }, accessToken);
    setSaving(false);
    if (isApiError(res)) {
      pushToast(res.message, "error");
      return;
    }
    pushToast(editingId ? "Surveyor updated" : "Surveyor created", "success");
    setModalOpen(false);
    fetchList();
  }

  async function handleDeleteSurveyor(id: string) {
    if (!accessToken) return;
    const res = await deleteSurveyor(id, accessToken);
    if (isApiError(res)) {
      pushToast(res.message, "error");
      return;
    }
    pushToast("Surveyor deleted", "success");
    fetchList();
  }

  if (!allowed) {
    return (
      <AccessDenied
        title="Surveyor"
        backHref="/admin/dashboard"
        backLabel="Dashboard"
        message="You do not have permission to manage surveyors."
      />
    );
  }

  return (
    <section className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Surveyor</h1>
        <button type="button" className={styles.addBtn} onClick={openCreate}>
          Add Surveyor
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
                    aria-label={`Sort surveyors ${sortDir === "asc" ? "ascending" : "descending"}`}
                  >
                    Surveyor
                    <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>
                  </button>
                </TableHeaderCell>
                <TableHeaderCell className={styles.actionsHeader}>Actions</TableHeaderCell>
              </TableRow>
              <TableRow className={styles.filterRow}>
                <TableHeaderCell colSpan={2} className={styles.filterCell}>
                  <input
                    type="text"
                    className={styles.filterInput}
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter Surveyor"
                    aria-label="Filter Surveyor"
                  />
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {displayedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className={styles.emptyState}>
                    {filter.trim()
                      ? "No surveyors match your filter."
                      : "No surveyors yet. Add your first surveyor."}
                  </TableCell>
                </TableRow>
              ) : (
                displayedItems.map((surveyor) => (
                  <TableRow key={surveyor.id}>
                    <TableCell>{surveyor.name}</TableCell>
                    <TableCell className={styles.actionsCell}>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => openEdit(surveyor)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => handleDeleteSurveyor(surveyor.id)}
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
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit Surveyor" : "Add Surveyor"}
        footer={
          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelBtn} onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.saveBtn}
              onClick={handleSave}
              disabled={saving || !nameValue.trim()}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        }
      >
        <div className={styles.modalField}>
          <label htmlFor="surveyor-name">Surveyor name</label>
          <input
            id="surveyor-name"
            type="text"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            autoFocus
          />
        </div>
      </Modal>
    </section>
  );
}
