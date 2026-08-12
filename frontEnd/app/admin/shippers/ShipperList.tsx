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
  updateShipperLoadport,
  deleteShipperLoadport,
  listShipperPlants,
  createShipperPlant,
  deleteShipperPlant,
  listShipperPlantUnloadPorts,
  createShipperPlantUnloadPort,
  updateShipperPlantUnloadPort,
  deleteShipperPlantUnloadPort,
  type Shipper,
  type ShipperLoadport,
  type ShipperPlant,
  type ShipperPlantUnloadPort,
} from "@/services/shipper-service";
import { listJpsPorts } from "@/services/shipments-service";
import type { JpsPortOption } from "@/types/shipments";
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
import { ComboboxSelect } from "@/components/forms";
import { ShipperDocumentHeaderPanel } from "./ShipperDocumentHeaderPanel";
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
  const [npwpValue, setNpwpValue] = useState("");
  const [saving, setSaving] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadports, setLoadports] = useState<ShipperLoadport[]>([]);
  const [plants, setPlants] = useState<ShipperPlant[]>([]);
  const [unloadPortsByPlant, setUnloadPortsByPlant] = useState<
    Record<string, ShipperPlantUnloadPort[]>
  >({});
  const [lpLoading, setLpLoading] = useState(false);
  const [plantLoading, setPlantLoading] = useState(false);
  const [unloadLoading, setUnloadLoading] = useState(false);
  const [newLpName, setNewLpName] = useState("");
  const [newPlantName, setNewPlantName] = useState("");
  const [newUnloadNameByPlant, setNewUnloadNameByPlant] = useState<Record<string, string>>({});
  const [jpsPorts, setJpsPorts] = useState<JpsPortOption[]>([]);
  const [jpsPortsLoading, setJpsPortsLoading] = useState(false);
  const [linkingLpId, setLinkingLpId] = useState<string | null>(null);
  const [linkingUnloadPortId, setLinkingUnloadPortId] = useState<string | null>(null);

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

  const fetchJpsPorts = useCallback(async () => {
    if (!accessToken) return;
    setJpsPortsLoading(true);
    try {
      const res = await listJpsPorts(accessToken);
      if (!isApiError(res)) {
        setJpsPorts(res.data?.data ?? []);
      }
    } finally {
      setJpsPortsLoading(false);
    }
  }, [accessToken]);

  const jpsPortLabelOptions = useMemo(
    () => jpsPorts.map((p) => `${p.name} (${p.id})`),
    [jpsPorts],
  );

  function jpsPortLabel(portId: number | null | undefined): string {
    if (portId == null) return "";
    const hit = jpsPorts.find((p) => p.id === portId);
    return hit ? `${hit.name} (${hit.id})` : `JPS #${portId}`;
  }

  const fetchUnloadPortsForPlants = useCallback(
    async (plantRows: ShipperPlant[]) => {
      if (!accessToken || plantRows.length === 0) {
        setUnloadPortsByPlant({});
        return;
      }
      setUnloadLoading(true);
      try {
        const entries = await Promise.all(
          plantRows.map(async (plant) => {
            const res = await listShipperPlantUnloadPorts(plant.id, accessToken);
            const rows = !isApiError(res)
              ? ((res as ApiSuccess<ShipperPlantUnloadPort[]>).data ?? [])
              : [];
            return [plant.id, rows] as const;
          }),
        );
        setUnloadPortsByPlant(Object.fromEntries(entries));
      } finally {
        setUnloadLoading(false);
      }
    },
    [accessToken],
  );

  const fetchPlants = useCallback(
    async (shipperId: string) => {
      if (!accessToken) return;
      setPlantLoading(true);
      const res = await listShipperPlants(shipperId, accessToken);
      if (!isApiError(res)) {
        const rows = (res as ApiSuccess<ShipperPlant[]>).data ?? [];
        setPlants(rows);
        await fetchUnloadPortsForPlants(rows);
      } else {
        setPlants([]);
        setUnloadPortsByPlant({});
      }
      setPlantLoading(false);
    },
    [accessToken, fetchUnloadPortsForPlants],
  );

  useEffect(() => {
    if (expandedId) {
      fetchLoadports(expandedId);
      fetchPlants(expandedId);
    } else {
      setLoadports([]);
      setPlants([]);
      setUnloadPortsByPlant({});
      setNewUnloadNameByPlant({});
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
    setNpwpValue("");
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((shipper: Shipper) => {
    setEditingId(shipper.id);
    setEntityNameValue(shipper.entity_name);
    setShortNameValue(shipper.short_name);
    setNpwpValue(shipper.npwp ?? "");
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
      npwp: npwpValue.trim() || null,
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
    setExpandedId((prev) => {
      const next = prev === id ? null : id;
      if (next) void fetchJpsPorts();
      return next;
    });
    setNewLpName("");
    setNewPlantName("");
    setNewUnloadNameByPlant({});
  }

  async function handleLinkJpsPort(lpId: string, jpsPortId: number | null) {
    if (!accessToken || !expandedId) return;
    setLinkingLpId(lpId);
    try {
      const res = await updateShipperLoadport(lpId, { jps_port_id: jpsPortId }, accessToken);
      if (isApiError(res)) {
        pushToast(res.message, "error");
        return;
      }
      pushToast(jpsPortId == null ? "Jetty link cleared" : "Connected to Jetty port", "success");
      await fetchLoadports(expandedId);
    } finally {
      setLinkingLpId(null);
    }
  }

  async function handleLinkUnloadJpsPort(unloadPortId: string, plantId: string, jpsPortId: number | null) {
    if (!accessToken) return;
    setLinkingUnloadPortId(unloadPortId);
    try {
      const res = await updateShipperPlantUnloadPort(
        unloadPortId,
        { jps_port_id: jpsPortId },
        accessToken,
      );
      if (isApiError(res)) {
        pushToast(res.message, "error");
        return;
      }
      pushToast(jpsPortId == null ? "Jetty link cleared" : "Connected to Jetty port", "success");
      const listRes = await listShipperPlantUnloadPorts(plantId, accessToken);
      if (!isApiError(listRes)) {
        setUnloadPortsByPlant((prev) => ({
          ...prev,
          [plantId]: (listRes as ApiSuccess<ShipperPlantUnloadPort[]>).data ?? [],
        }));
      }
    } finally {
      setLinkingUnloadPortId(null);
    }
  }

  async function handleAddUnloadPort(plantId: string) {
    if (!accessToken) return;
    const name = (newUnloadNameByPlant[plantId] ?? "").trim();
    if (!name) return;
    const res = await createShipperPlantUnloadPort(plantId, { name }, accessToken);
    if (isApiError(res)) {
      pushToast(res.message, "error");
      return;
    }
    pushToast("Unload port added", "success");
    setNewUnloadNameByPlant((prev) => ({ ...prev, [plantId]: "" }));
    const listRes = await listShipperPlantUnloadPorts(plantId, accessToken);
    if (!isApiError(listRes)) {
      setUnloadPortsByPlant((prev) => ({
        ...prev,
        [plantId]: (listRes as ApiSuccess<ShipperPlantUnloadPort[]>).data ?? [],
      }));
    }
  }

  async function handleDeleteUnloadPort(unloadPortId: string, plantId: string) {
    if (!accessToken) return;
    const res = await deleteShipperPlantUnloadPort(unloadPortId, accessToken);
    if (isApiError(res)) {
      pushToast(res.message, "error");
      return;
    }
    pushToast("Unload port deleted", "success");
    setUnloadPortsByPlant((prev) => ({
      ...prev,
      [plantId]: (prev[plantId] ?? []).filter((p) => p.id !== unloadPortId),
    }));
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
    setUnloadPortsByPlant((prev) => {
      const next = { ...prev };
      delete next[plantId];
      return next;
    });
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
                            <div className={`${styles.loadportPanel} ${styles.plantsPanel}`}>
                              <h4 className={styles.loadportTitle}>
                                Plants &amp; unload ports (Import) — {expandedShipper?.short_name}
                              </h4>
                              <p className={styles.lpHint}>
                                Unload ports are the import destination master (port of discharge).
                                Connect a port to Jetty so Sea shipments that select it can sync to
                                berth planning.
                                {jpsPortsLoading ? " Loading Jetty ports…" : null}
                                {unloadLoading ? " Loading unload ports…" : null}
                              </p>
                              {plantLoading ? (
                                <p className={styles.lpEmpty}>Loading plants…</p>
                              ) : plants.length === 0 ? (
                                <p className={styles.lpEmpty}>No plants yet.</p>
                              ) : (
                                <ul className={styles.lpList}>
                                  {plants.map((plant) => {
                                    const unloadPorts = unloadPortsByPlant[plant.id] ?? [];
                                    return (
                                      <li key={plant.id} className={styles.plantBlock}>
                                        <div className={styles.lpMappedRow}>
                                          <span className={styles.lpName}>{plant.name}</span>
                                          <button
                                            type="button"
                                            className={styles.actionBtn}
                                            onClick={() => handleDeletePlant(plant.id)}
                                          >
                                            Delete plant
                                          </button>
                                        </div>
                                        {unloadPorts.length === 0 ? (
                                          <p className={styles.unloadEmpty}>No unload ports yet.</p>
                                        ) : (
                                          <ul className={styles.unloadList}>
                                            {unloadPorts.map((up) => (
                                              <li key={up.id} className={styles.lpItemMapped}>
                                                <div className={styles.lpMappedRow}>
                                                  <span className={styles.lpName}>{up.name}</span>
                                                  <button
                                                    type="button"
                                                    className={styles.actionBtn}
                                                    onClick={() =>
                                                      void handleDeleteUnloadPort(up.id, plant.id)
                                                    }
                                                  >
                                                    Delete
                                                  </button>
                                                </div>
                                                <div className={styles.lpJpsRow}>
                                                  <span className={styles.lpJpsLabel}>Jetty port</span>
                                                  <ComboboxSelect
                                                    aria-label={`Jetty port for ${plant.name} / ${up.name}`}
                                                    inputClassName={styles.lpJpsSelect}
                                                    options={jpsPortLabelOptions}
                                                    value={jpsPortLabel(up.jps_port_id)}
                                                    onChange={(label) => {
                                                      if (!label.trim()) {
                                                        void handleLinkUnloadJpsPort(
                                                          up.id,
                                                          plant.id,
                                                          null,
                                                        );
                                                        return;
                                                      }
                                                      const m = /\((\d+)\)\s*$/.exec(label);
                                                      if (m) {
                                                        void handleLinkUnloadJpsPort(
                                                          up.id,
                                                          plant.id,
                                                          Number(m[1]),
                                                        );
                                                      }
                                                    }}
                                                    allowEmpty
                                                    emptyLabel="— Not connected —"
                                                    placeholder="Search Jetty ports…"
                                                    disabled={
                                                      jpsPortsLoading ||
                                                      linkingUnloadPortId === up.id
                                                    }
                                                  />
                                                </div>
                                              </li>
                                            ))}
                                          </ul>
                                        )}
                                        <div className={styles.addUnloadRow}>
                                          <input
                                            type="text"
                                            className={styles.addLpInput}
                                            placeholder="New unload port…"
                                            value={newUnloadNameByPlant[plant.id] ?? ""}
                                            onChange={(e) =>
                                              setNewUnloadNameByPlant((prev) => ({
                                                ...prev,
                                                [plant.id]: e.target.value,
                                              }))
                                            }
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") {
                                                e.preventDefault();
                                                void handleAddUnloadPort(plant.id);
                                              }
                                            }}
                                          />
                                          <button
                                            type="button"
                                            className={styles.actionBtn}
                                            disabled={!(newUnloadNameByPlant[plant.id] ?? "").trim()}
                                            onClick={() => void handleAddUnloadPort(plant.id)}
                                          >
                                            + Add unload
                                          </button>
                                        </div>
                                      </li>
                                    );
                                  })}
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
                                  + Add plant
                                </button>
                              </div>
                            </div>
                            )}

                            {(canEditExport || canEditImport) && (
                            <div className={styles.loadportPanel}>
                              <h4 className={styles.loadportTitle}>
                                Load ports (Export) — {expandedShipper?.short_name}
                              </h4>
                              <p className={styles.lpHint}>
                                Export load ports. Optional Jetty link is legacy; prefer unload ports
                                under Plants for import berth planning.
                                {jpsPortsLoading ? " Loading Jetty ports…" : null}
                              </p>
                              {lpLoading ? (
                                <p className={styles.lpEmpty}>Loading load ports…</p>
                              ) : loadports.length === 0 ? (
                                <p className={styles.lpEmpty}>No load ports yet.</p>
                              ) : (
                                <ul className={styles.lpList}>
                                  {loadports.map((lp) => (
                                    <li key={lp.id} className={styles.lpItemMapped}>
                                      <div className={styles.lpMappedRow}>
                                        <span className={styles.lpName}>{lp.name}</span>
                                        {canEditExport ? (
                                          <button
                                            type="button"
                                            className={styles.actionBtn}
                                            onClick={() => handleDeleteLoadport(lp.id)}
                                          >
                                            Delete
                                          </button>
                                        ) : null}
                                      </div>
                                      <div className={styles.lpJpsRow}>
                                        <span className={styles.lpJpsLabel}>Jetty port</span>
                                        <ComboboxSelect
                                          aria-label={`Jetty port for ${lp.name}`}
                                          inputClassName={styles.lpJpsSelect}
                                          options={jpsPortLabelOptions}
                                          value={jpsPortLabel(lp.jps_port_id)}
                                          onChange={(label) => {
                                            if (!label.trim()) {
                                              void handleLinkJpsPort(lp.id, null);
                                              return;
                                            }
                                            const m = /\((\d+)\)\s*$/.exec(label);
                                            if (m) void handleLinkJpsPort(lp.id, Number(m[1]));
                                          }}
                                          allowEmpty
                                          emptyLabel="— Not connected —"
                                          placeholder="Search Jetty ports…"
                                          disabled={
                                            jpsPortsLoading ||
                                            linkingLpId === lp.id ||
                                            !(canEditExport || canEditImport)
                                          }
                                        />
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {canEditExport ? (
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
                              ) : null}
                            </div>
                            )}

                            {expandedShipper && (
                              <ShipperDocumentHeaderPanel
                                shipper={expandedShipper}
                                accessToken={accessToken ?? ""}
                                canEdit={canEditExport}
                                canEditNpwp={canEditImport || canEditExport}
                                onUpdated={fetchList}
                                pushToast={pushToast}
                              />
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
        <div className={styles.modalField}>
          <label htmlFor="shipper-npwp">NPWP (Export SI)</label>
          <input
            id="shipper-npwp"
            type="text"
            value={npwpValue}
            onChange={(e) => setNpwpValue(e.target.value)}
            placeholder="e.g. 01.234.567.8-901.000"
          />
        </div>
      </Modal>
    </section>
  );
}
