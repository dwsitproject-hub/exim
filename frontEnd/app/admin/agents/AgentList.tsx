"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canManageExportMasterList } from "@/lib/permissions";
import {
  listAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  type Agent,
} from "@/services/agent-service";
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
import styles from "./AgentList.module.css";

const MANAGE_AGENTS = "MANAGE_AGENTS";

export function AgentList() {
  const { user, accessToken } = useAuth();
  const [items, setItems] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const { pushToast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameValue, setNameValue] = useState("");
  const [saving, setSaving] = useState(false);

  const allowed = canManageExportMasterList(user, MANAGE_AGENTS);

  const fetchList = useCallback(() => {
    if (!accessToken || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    listAgents(accessToken)
      .then((res) => {
        if (isApiError(res)) {
          setError(res.message);
          return;
        }
        const success = res as ApiSuccess<Agent[]>;
        setItems(success.data ?? []);
      })
      .catch(() => setError("Failed to load agents"))
      .finally(() => setLoading(false));
  }, [accessToken, allowed]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const displayedItems = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const filtered = query
      ? items.filter((agent) => agent.name.toLowerCase().includes(query))
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

  const openEdit = useCallback((agent: Agent) => {
    setEditingId(agent.id);
    setNameValue(agent.name);
    setModalOpen(true);
  }, []);

  async function handleSave() {
    if (!accessToken || !nameValue.trim()) return;
    setSaving(true);
    const res = editingId
      ? await updateAgent(editingId, { name: nameValue.trim() }, accessToken)
      : await createAgent({ name: nameValue.trim() }, accessToken);
    setSaving(false);
    if (isApiError(res)) {
      pushToast(res.message, "error");
      return;
    }
    pushToast(editingId ? "Agent updated" : "Agent created", "success");
    setModalOpen(false);
    fetchList();
  }

  async function handleDeleteAgent(id: string) {
    if (!accessToken) return;
    const res = await deleteAgent(id, accessToken);
    if (isApiError(res)) {
      pushToast(res.message, "error");
      return;
    }
    pushToast("Agent deleted", "success");
    fetchList();
  }

  if (!allowed) {
    return (
      <AccessDenied
        title="Agent"
        backHref="/admin/dashboard"
        backLabel="Dashboard"
        message="You do not have permission to manage agents."
      />
    );
  }

  return (
    <section className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Agent</h1>
        <button type="button" className={styles.addBtn} onClick={openCreate}>
          Add Agent
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
                    aria-label={`Sort agents ${sortDir === "asc" ? "ascending" : "descending"}`}
                  >
                    Agent
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
                    placeholder="Filter Agent"
                    aria-label="Filter Agent"
                  />
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {displayedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className={styles.emptyState}>
                    {filter.trim() ? "No agents match your filter." : "No agents yet. Add your first agent."}
                  </TableCell>
                </TableRow>
              ) : (
                displayedItems.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell>{agent.name}</TableCell>
                    <TableCell className={styles.actionsCell}>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => openEdit(agent)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => handleDeleteAgent(agent.id)}
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
        title={editingId ? "Edit Agent" : "Add Agent"}
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
          <label htmlFor="agent-name">Agent name</label>
          <input
            id="agent-name"
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
