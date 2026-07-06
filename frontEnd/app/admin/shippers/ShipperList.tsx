"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canManageImportMasters, canManageExportMasters, canAccessShipperMasterAdmin } from "@/lib/permissions";
import {
  listShippers,
  createShipper,
  updateShipper,
  deleteShipper,
  listShipperLoadports,
  createShipperLoadport,
  deleteShipperLoadport,
  listShipperPlants,
  createShipperPlant,
  deleteShipperPlant,
  type Shipper,
  type ShipperLoadport,
  type ShipperPlant,
} from "@/services/shipper-service";
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
import styles from "./ShipperList.module.css";

export function ShipperList() {
  const { user, accessToken } = useAuth();
  const [items, setItems] = useState<Shipper[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const { pushToast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [entityNameValue, setEntityNameValue] = useState("");
  const [shortNameValue, setShortNameValue] = useState("");
  const [saving, setSaving] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadports, setLoadports] = useState<ShipperLoadport[]>([]);
  const [plants, setPlants] = useState<ShipperPlant[]>([]);
  const [lpLoading, setLpLoading] = useState(false);
  const [plantLoading, setPlantLoading] = useState(false);
  const [newLpName, setNewLpName] = useState("");
  const [newPlantName, setNewPlantName] = useState("");

  const allowed = canAccessShipperMasterAdmin(user);
  const canEditImport = canManageImportMasters(user);
  const canEditExport = canManageExportMasters(user);

  const fetchList = useCallback(() => {
    if (!accessToken || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    listShippers(accessToken)
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
  }, [accessToken, allowed]);

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

  const fetchPlants = useCallback(
    async (shipperId: string) => {
      if (!accessToken) return;
      setPlantLoading(true);
      const res = await listShipperPlants(shipperId, accessToken);
      if (!isApiError(res)) {
        setPlants((res as ApiSuccess<ShipperPlant[]>).data ?? []);
      }
      setPlantLoading(false);
    },
    [accessToken],
  );

  useEffect(() => {
    if (expandedId) {
      fetchLoadports(expandedId);
      fetchPlants(expandedId);
    } else {
      setLoadports([]);
      setPlants([]);
    }
  }, [expandedId, fetchLoadports, fetchPlants]);

  const displayedItems = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const filtered = query
      ? items.filter(
          (shipper) =>
            shipper.short_name.toLowerCase().includes(query) ||
            shipper.entity_name.toLowerCase().includes(query),
        )
      : items;

    return [...filtered].sort((a, b) => {
      const cmp = a.short_name.localeCompare(b.short_name, undefined, { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [items, filter, sortDir]);

  const expandedShipper = useMemo(
    () => (expandedId ? items.find((s) => s.id === expandedId) ?? null : null),
    [expandedId, items],
  );

  function toggleSort() {
    setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
  }

  const openCreate = useCallback(() => {
    setEditingId(null);
    setEntityNameValue("");
    setShortNameValue("");
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((shipper: Shipper) => {
    setEditingId(shipper.id);
    setEntityNameValue(shipper.entity_name);
    setShortNameValue(shipper.short_name);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  const canSave = entityNameValue.trim() !== "" && shortNameValue.trim() !== "";

  async function handleSave() {
    if (!accessToken || !canSave) return;
    setSaving(true);
    const body = {
      entity_name: entityNameValue.trim(),
      short_name: shortNameValue.trim(),
    };
    const res = editingId
      ? await updateShipper(editingId, body, accessToken)
      : await createShipper(body, accessToken);
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
    setNewPlantName("");
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

  async function handleAddPlant() {
    if (!accessToken || !expandedId || !newPlantName.trim()) return;
    const res = await createShipperPlant(expandedId, { name: newPlantName.trim() }, accessToken);
    if (isApiError(res)) {
      pushToast(res.message, "error");
      return;
    }
    pushToast("Plant added", "success");
    setNewPlantName("");
    fetchPlants(expandedId);
  }

  async function handleDeletePlant(plantId: string) {
    if (!accessToken || !expandedId) return;
    const res = await deleteShipperPlant(plantId, accessToken);
    if (isApiError(res)) {
      pushToast(res.message, "error");
      return;
    }
    pushToast("Plant deleted", "success");
    fetchPlants(expandedId);
  }

  if (!allowed) {
    return (
      <AccessDenied
        title="Shipper"
        backHref="/admin/dashboard"
        backLabel="Dashboard"
        message="You do not have permission to manage shippers."
      />
    );
  }

  return (
    <section className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Shipper</h1>
          <p className={styles.pageSubtitle}>
            Import PT / Plant and Export Shipper / Load port share this master.
          </p>
        </div>
        {canEditImport && (
          <button type="button" className={styles.addBtn} onClick={openCreate}>
            Add Shipper
          </button>
        )}
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
                    Short name
                    <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>
                  </button>
                </TableHeaderCell>
                <TableHeaderCell>Entity name</TableHeaderCell>
                <TableHeaderCell className={styles.actionsHeader}>Actions</TableHeaderCell>
              </TableRow>
              <TableRow className={styles.filterRow}>
                <TableHeaderCell colSpan={3} className={styles.filterCell}>
                  <input
                    type="text"
                    className={styles.filterInput}
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter by short name or entity name"
                    aria-label="Filter shippers"
                  />
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {displayedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className={styles.emptyState}>
                    {filter.trim()
                      ? "No shippers match your filter."
                      : "No shippers yet. Add your first shipper."}
                  </TableCell>
                </TableRow>
              ) : (
                displayedItems.map((shipper) => (
                  <Fragment key={shipper.id}>
                    <TableRow>
                      <TableCell className={styles.nameCell} onClick={() => toggleExpand(shipper.id)}>
                        <span className={styles.expandIcon} aria-hidden>
                          {expandedId === shipper.id ? "▾" : "▸"}
                        </span>
                        {shipper.short_name}
                      </TableCell>
                      <TableCell>{shipper.entity_name}</TableCell>
                      <TableCell className={styles.actionsCell}>
                        {canEditImport && (
                          <button
                            type="button"
                            className={styles.actionBtn}
                            onClick={() => openEdit(shipper)}
                          >
                            Edit
                          </button>
                        )}
                        {canEditImport && (
                          <button
                            type="button"
                            className={styles.actionBtn}
                            onClick={() => handleDeleteShipper(shipper.id)}
                          >
                            Delete
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                    {expandedId === shipper.id && (
                      <TableRow className={styles.expandedRow}>
                        <TableCell colSpan={3}>
                          <div className={styles.expandedPanels}>
                            {canEditImport && (
                            <div className={styles.loadportPanel}>
                              <h4 className={styles.loadportTitle}>
                                Plants (Import) — {expandedShipper?.short_name}
                              </h4>
                              {plantLoading ? (
                                <p className={styles.lpEmpty}>Loading plants…</p>
                              ) : plants.length === 0 ? (
                                <p className={styles.lpEmpty}>No plants yet.</p>
                              ) : (
                                <ul className={styles.lpList}>
                                  {plants.map((plant) => (
                                    <li key={plant.id} className={styles.lpItem}>
                                      <span className={styles.lpName}>{plant.name}</span>
                                      <button
                                        type="button"
                                        className={styles.actionBtn}
                                        onClick={() => handleDeletePlant(plant.id)}
                                      >
                                        Delete
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <div className={styles.addLpRow}>
                                <input
                                  type="text"
                                  className={styles.addLpInput}
                                  placeholder="New plant name…"
                                  value={newPlantName}
                                  onChange={(e) => setNewPlantName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      handleAddPlant();
                                    }
                                  }}
                                />
                                <button
                                  type="button"
                                  className={styles.actionBtn}
                                  disabled={!newPlantName.trim()}
                                  onClick={handleAddPlant}
                                >
                                  + Add
                                </button>
                              </div>
                            </div>
                            )}

                            {canEditExport && (
                            <div className={styles.loadportPanel}>
                              <h4 className={styles.loadportTitle}>
                                Load ports (Export) — {expandedShipper?.short_name}
                              </h4>
                              {lpLoading ? (
                                <p className={styles.lpEmpty}>Loading load ports…</p>
                              ) : loadports.length === 0 ? (
                                <p className={styles.lpEmpty}>No load ports yet.</p>
                              ) : (
                                <ul className={styles.lpList}>
                                  {loadports.map((lp) => (
                                    <li key={lp.id} className={styles.lpItem}>
                                      <span className={styles.lpName}>{lp.name}</span>
                                      <button
                                        type="button"
                                        className={styles.actionBtn}
                                        onClick={() => handleDeleteLoadport(lp.id)}
                                      >
                                        Delete
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <div className={styles.addLpRow}>
                                <input
                                  type="text"
                                  className={styles.addLpInput}
                                  placeholder="New load port name…"
                                  value={newLpName}
                                  onChange={(e) => setNewLpName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      handleAddLoadport();
                                    }
                                  }}
                                />
                                <button
                                  type="button"
                                  className={styles.actionBtn}
                                  disabled={!newLpName.trim()}
                                  onClick={handleAddLoadport}
                                >
                                  + Add
                                </button>
                              </div>
                            </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <Modal
        open={modalOpen}
        title={editingId ? "Edit Shipper" : "Add Shipper"}
        onClose={closeModal}
        footer={
          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelBtn} onClick={closeModal}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.saveBtn}
              disabled={saving || !canSave}
              onClick={handleSave}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        }
      >
        <div className={styles.modalField}>
          <label htmlFor="shipper-entity-name">Entity name</label>
          <input
            id="shipper-entity-name"
            type="text"
            value={entityNameValue}
            onChange={(e) => setEntityNameValue(e.target.value)}
            placeholder="e.g. PT Adaro Energy Tbk"
            autoFocus
          />
        </div>
        <div className={styles.modalField}>
          <label htmlFor="shipper-short-name">Entity short name</label>
          <input
            id="shipper-short-name"
            type="text"
            value={shortNameValue}
            onChange={(e) => setShortNameValue(e.target.value)}
            placeholder="e.g. EUP — used as Import PT and Export Shipper"
          />
        </div>
      </Modal>
    </section>
  );
}
