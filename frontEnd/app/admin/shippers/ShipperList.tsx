"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { can } from "@/lib/permissions";
import {
  listShippers,
  createShipper,
  updateShipper,
  deleteShipper,
  listShipperLoadports,
  createShipperLoadport,
  deleteShipperLoadport,
  type Shipper,
  type ShipperLoadport,
} from "@/services/shipper-service";
import { isApiError } from "@/types/api";
import type { ApiSuccess } from "@/types/api";
import { Card } from "@/components/cards";
import { useToast } from "@/components/providers/ToastProvider";
import { PageHeader, ActionBar, EmptyState } from "@/components/navigation";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeaderCell,
} from "@/components/tables";
import { Modal } from "@/components/overlays/Modal";
import styles from "./ShipperList.module.css";

const MANAGE_SHIPPERS = "MANAGE_SHIPPERS";

export function ShipperList() {
  const { user, accessToken } = useAuth();
  const [items, setItems] = useState<Shipper[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchParam, setSearchParam] = useState("");
  const { pushToast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameValue, setNameValue] = useState("");
  const [saving, setSaving] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadports, setLoadports] = useState<ShipperLoadport[]>([]);
  const [lpLoading, setLpLoading] = useState(false);
  const [newLpName, setNewLpName] = useState("");

  const allowed = can(user, MANAGE_SHIPPERS);

  const fetchList = useCallback(() => {
    if (!accessToken || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    listShippers(accessToken, searchParam.trim() || undefined)
      .then((res) => {
        if (isApiError(res)) {
          setError(res.message);
          return;
        }
        const success = res as ApiSuccess<Shipper[]>;
        setItems(success.data ?? []);
      })
      .catch(() => setError("Failed to load shippers"))
      .finally(() => setLoading(false));
  }, [accessToken, allowed, searchParam]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const fetchLoadports = useCallback(
    async (shipperId: string) => {
      if (!accessToken) return;
      setLpLoading(true);
      const res = await listShipperLoadports(shipperId, accessToken);
      if (!isApiError(res)) {
        setLoadports((res as ApiSuccess<ShipperLoadport[]>).data ?? []);
      }
      setLpLoading(false);
    },
    [accessToken],
  );

  useEffect(() => {
    if (expandedId) {
      fetchLoadports(expandedId);
    } else {
      setLoadports([]);
    }
  }, [expandedId, fetchLoadports]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearchParam(searchInput);
  }

  const openCreate = useCallback(() => {
    setEditingId(null);
    setNameValue("");
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((s: Shipper) => {
    setEditingId(s.id);
    setNameValue(s.name);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  async function handleSave() {
    if (!accessToken || !nameValue.trim()) return;
    setSaving(true);
    const res = editingId
      ? await updateShipper(editingId, { name: nameValue.trim() }, accessToken)
      : await createShipper({ name: nameValue.trim() }, accessToken);
    setSaving(false);
    if (isApiError(res)) {
      pushToast(res.message, "error");
      return;
    }
    pushToast(editingId ? "Shipper updated" : "Shipper created", "success");
    setModalOpen(false);
    fetchList();
  }

  async function handleDeleteShipper(id: string) {
    if (!accessToken) return;
    const res = await deleteShipper(id, accessToken);
    if (isApiError(res)) {
      pushToast(res.message, "error");
      return;
    }
    pushToast("Shipper deleted", "success");
    if (expandedId === id) setExpandedId(null);
    fetchList();
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
    setNewLpName("");
  }

  async function handleAddLoadport() {
    if (!accessToken || !expandedId || !newLpName.trim()) return;
    const res = await createShipperLoadport(expandedId, { name: newLpName.trim() }, accessToken);
    if (isApiError(res)) {
      pushToast(res.message, "error");
      return;
    }
    pushToast("Load port added", "success");
    setNewLpName("");
    fetchLoadports(expandedId);
  }

  async function handleDeleteLoadport(lpId: string) {
    if (!accessToken || !expandedId) return;
    const res = await deleteShipperLoadport(lpId, accessToken);
    if (isApiError(res)) {
      pushToast(res.message, "error");
      return;
    }
    pushToast("Load port deleted", "success");
    fetchLoadports(expandedId);
  }

  if (!allowed) {
    return (
      <section>
        <PageHeader title="Master Shipper" backHref="/admin/dashboard" backLabel="Dashboard" />
        <p className={styles.denied}>You do not have permission to manage shippers.</p>
      </section>
    );
  }

  return (
    <section>
      <PageHeader
        title="Master Shipper"
        backHref="/admin/dashboard"
        backLabel="Dashboard"
        subtitle="Manage shippers and their load ports."
      />

      <ActionBar
        search={
          <form onSubmit={handleSearchSubmit} className={styles.searchForm}>
            <input
              type="search"
              placeholder="Search shippers…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className={styles.searchInput}
              aria-label="Search shippers"
            />
            <button type="submit" className={styles.searchSubmit}>
              Search
            </button>
          </form>
        }
        primaryAction={
          <button type="button" className={styles.createBtn} onClick={openCreate}>
            New shipper
          </button>
        }
      />

      <Card>
        {error && <p role="alert">{error}</p>}
        {loading ? (
          <p className="utilLoadingFallback">Loading…</p>
        ) : items.length === 0 ? (
          <EmptyState title="No shippers" description="Create your first shipper." />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Shipper Name</TableHeaderCell>
                <TableHeaderCell style={{ width: 160, textAlign: "right" }}>Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((s) => (
                <>
                  <TableRow key={s.id}>
                    <TableCell
                      onClick={() => toggleExpand(s.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <span>{expandedId === s.id ? "▾" : "▸"} {s.name}</span>
                    </TableCell>
                    <TableCell style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className={styles.saveBtn}
                        style={{ marginRight: 8 }}
                        onClick={() => openEdit(s)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={styles.deleteBtn}
                        onClick={() => handleDeleteShipper(s.id)}
                      >
                        Delete
                      </button>
                    </TableCell>
                  </TableRow>
                  {expandedId === s.id && (
                    <TableRow key={`${s.id}-lp`} className={styles.expandedRow}>
                      <TableCell colSpan={2}>
                        <div className={styles.loadportPanel}>
                          <div className={styles.loadportHeader}>
                            <h4 className={styles.loadportTitle}>Load Ports for {s.name}</h4>
                          </div>
                          {lpLoading ? (
                            <p className="utilLoadingFallback">Loading…</p>
                          ) : (
                            <>
                              {loadports.length === 0 ? (
                                <p className={styles.lpEmpty}>No load ports yet.</p>
                              ) : (
                                <ul className={styles.lpList}>
                                  {loadports.map((lp) => (
                                    <li key={lp.id} className={styles.lpItem}>
                                      <span className={styles.lpName}>{lp.name}</span>
                                      <button
                                        type="button"
                                        className={styles.lpDeleteBtn}
                                        onClick={() => handleDeleteLoadport(lp.id)}
                                      >
                                        Delete
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                                <input
                                  type="text"
                                  placeholder="New load port name…"
                                  value={newLpName}
                                  onChange={(e) => setNewLpName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      handleAddLoadport();
                                    }
                                  }}
                                  style={{
                                    flex: 1,
                                    padding: "6px 12px",
                                    fontSize: 14,
                                    border: "1px solid #e0e0e0",
                                    borderRadius: 6,
                                  }}
                                />
                                <button
                                  type="button"
                                  className={styles.addLpBtn}
                                  disabled={!newLpName.trim()}
                                  onClick={handleAddLoadport}
                                >
                                  + Add
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Modal
        open={modalOpen}
        title={editingId ? "Edit Shipper" : "New Shipper"}
        onClose={closeModal}
        footer={
          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelBtn} onClick={closeModal}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.saveBtn}
              disabled={saving || !nameValue.trim()}
              onClick={handleSave}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        }
      >
        <div className={styles.modalField}>
          <label htmlFor="shipper-name">Shipper Name</label>
          <input
            id="shipper-name"
            type="text"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            placeholder="e.g. PT Adaro Energy"
            autoFocus
          />
        </div>
      </Modal>
    </section>
  );
}
