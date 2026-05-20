"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { can } from "@/lib/permissions";
import { listUsers, importUsersCsv } from "@/services/users-service";
import { isApiError } from "@/types/api";
import type { ApiSuccess } from "@/types/api";
import type { UserAdmin } from "@/types/users";
import { Card } from "@/components/cards";
import { useToast } from "@/components/providers/ToastProvider";
import { Badge } from "@/components/badges";
import { PageHeader, ActionBar, EmptyState } from "@/components/navigation";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeaderCell,
} from "@/components/tables";
import styles from "./UserList.module.css";

const MANAGE_USERS = "MANAGE_USERS";
const DEFAULT_LIMIT = 20;

const CSV_TEMPLATE = `name,email,password,role,permissions
Jane Doe,jane@example.com,ChangeMe12!,VIEWER,
John Smith,john@example.com,ChangeMe12!,EXIM_OFFICER,CREATE_SHIPMENT|VIEW_SHIPMENTS
`;

export function UserList() {
  const router = useRouter();
  const { user, accessToken } = useAuth();
  const [items, setItems] = useState<UserAdmin[]>([]);
  const [meta, setMeta] = useState<{ page: number; limit: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [searchParam, setSearchParam] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const { pushToast } = useToast();

  const allowed = can(user, MANAGE_USERS);

  const fetchList = useCallback(() => {
    if (!accessToken || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    listUsers({ page, limit: DEFAULT_LIMIT, search: searchParam.trim() || undefined }, accessToken)
      .then((res) => {
        if (isApiError(res)) {
          setError(res.message);
          return;
        }
        const success = res as ApiSuccess<UserAdmin[]>;
        setItems(success.data ?? []);
        const m = success.meta as { page: number; limit: number; total: number } | undefined;
        if (m) setMeta(m);
      })
      .catch(() => setError("Failed to load users"))
      .finally(() => setLoading(false));
  }, [accessToken, allowed, page, searchParam]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const totalPages = meta ? Math.ceil(meta.total / meta.limit) : 0;

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearchParam(searchInput);
    setPage(1);
  }

  function handleRowClick(id: string) {
    router.push(`/admin/users/${id}`);
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !accessToken) return;
    setImportBusy(true);
    setImportMessage(null);
    const res = await importUsersCsv(file, accessToken);
    setImportBusy(false);
    if (isApiError(res)) {
      setImportMessage(res.message);
      pushToast(res.message, "error");
      return;
    }
    const { created, errors } = res.data;
    setImportMessage(`Created ${created} user(s).${errors.length ? ` ${errors.length} row(s) skipped.` : ""}`);
    pushToast(
      errors.length ? `Imported with warnings: ${created} created, ${errors.length} skipped.` : `Imported ${created} user(s).`,
      errors.length ? "info" : "success"
    );
    fetchList();
  }

  if (!allowed) {
    return (
      <section>
        <PageHeader title="User management" backHref="/import/dashboard" backLabel="Dashboard" />
        <p className={styles.denied}>You do not have permission to manage users.</p>
      </section>
    );
  }

  return (
    <section>
      <PageHeader
        title="User management"
        backHref="/import/dashboard"
        backLabel="Dashboard"
        subtitle="Create users, assign roles and permissions, import from CSV."
      />

      <ActionBar
        search={
          <form onSubmit={handleSearchSubmit} className={styles.searchForm}>
            <input
              type="search"
              placeholder="Search name or email…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className={styles.searchInput}
              aria-label="Search users"
            />
            <button type="submit" className={styles.searchSubmit}>
              Search
            </button>
          </form>
        }
        primaryAction={
          <div className={styles.primaryActions}>
            <Link href="/admin/users/new" className={styles.createBtn}>
              New user
            </Link>
          </div>
        }
      />

      <Card>
        {error && <p role="alert">{error}</p>}
        {loading ? (
          <p className="utilLoadingFallback">Loading…</p>
        ) : items.length === 0 ? (
          <EmptyState title="No users" description="Try another search or create a user." />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Email</TableHeaderCell>
                <TableHeaderCell>Role</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((u) => (
                <TableRow
                  key={u.id}
                  onClick={() => handleRowClick(u.id)}
                  className={!u.is_active ? styles.rowInactive : undefined}
                >
                  <TableCell>{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Badge variant="neutral">{u.role}</Badge>
                  </TableCell>
                  <TableCell>
                    {u.is_active ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="neutral">Inactive</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {meta && totalPages > 1 && (
          <div className={styles.primaryActions} style={{ marginTop: 16 }}>
            <button
              type="button"
              className={styles.searchSubmit}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span style={{ alignSelf: "center", fontSize: 14 }}>
              Page {meta.page} of {totalPages}
            </span>
            <button
              type="button"
              className={styles.searchSubmit}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        )}
      </Card>

      <div className={styles.importPanel}>
        <h2 className={styles.importTitle}>Import from CSV</h2>
        <p className={styles.importHint}>
          Required columns: <strong>name</strong>, <strong>email</strong>, <strong>password</strong>, <strong>role</strong>.
          Optional <strong>permissions</strong>: extra API permissions as{" "}
          <code>KEY|KEY</code> (pipe-separated).
        </p>
        <div className={styles.importRow}>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={onImportFile}
            disabled={importBusy}
            aria-label="Choose CSV file to import"
          />
          <a
            className={styles.templateLink}
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`}
            download="users-import-template.csv"
          >
            Download template
          </a>
        </div>
        {importMessage && <p className={styles.importResult}>{importMessage}</p>}
      </div>
    </section>
  );
}
