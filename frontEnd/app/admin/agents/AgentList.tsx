"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { can } from "@/lib/permissions";
import {
  listAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  type Agent,
} from "@/services/agent-service";
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
import styles from "../shippers/ShipperList.module.css";

const MANAGE_AGENTS = "MANAGE_AGENTS";

export function AgentList() {
  const { user, accessToken } = useAuth();
  const [items, setItems] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchParam, setSearchParam] = useState("");
  const { pushToast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameValue, setNameValue] = useState("");
  const [saving, setSaving] = useState(false);

  const allowed = can(user, MANAGE_AGENTS);

  const fetchList = useCallback(() => {
    if (!accessToken || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    listAgents(accessToken, searchParam.trim() || undefined)
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
  }, [accessToken, allowed, searchParam]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearchParam(searchInput);
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
      <section>
        <PageHeader title="Master Agent" backHref="/" backLabel="Home" />
        <p className={styles.denied}>You do not have permission to manage agents.</p>
      </section>
    );
  }

  return (
    <section>
      <PageHeader
        title="Master Agent"
        backHref="/"
        backLabel="Home"
        subtitle="Manage forwarding agents used in export bulking Commercial Terms."
      />

      <ActionBar
        search={
          <form onSubmit={handleSearchSubmit} className={styles.searchForm}>
            <input
              type="search"
              placeholder="Search agents…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className={styles.searchInput}
              aria-label="Search agents"
            />
            <button type="submit" className={styles.searchSubmit}>
              Search
            </button>
          </form>
        }
        primaryAction={
          <button type="button" className={styles.createBtn} onClick={openCreate}>
            New agent
          </button>
        }
      />

      <Card>
        {error && <p role="alert">{error}</p>}
        {loading ? (
          <p className="utilLoadingFallback">Loading…</p>
        ) : items.length === 0 ? (
          <EmptyState title="No agents" description="Create your first agent." />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Agent Name</TableHeaderCell>
                <TableHeaderCell style={{ width: 160, textAlign: "right" }}>Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((agent) => (
                <TableRow key={agent.id}>
                  <TableCell>{agent.name}</TableCell>
                  <TableCell style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      className={styles.saveBtn}
                      style={{ marginRight: 8 }}
                      onClick={() => openEdit(agent)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      onClick={() => handleDeleteAgent(agent.id)}
                    >
                      Delete
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit agent" : "New agent"}
      >
        <label className={styles.modalLabel} htmlFor="agent-name">
          Agent name
        </label>
        <input
          id="agent-name"
          className={styles.modalInput}
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          autoFocus
        />
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
      </Modal>
    </section>
  );
}
