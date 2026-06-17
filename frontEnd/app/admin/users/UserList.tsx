"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePermissionGate } from "@/hooks/use-permission-gate";
import { LoadingSkeleton } from "@/components/feedback";
import { listUsers, importUsersCsv } from "@/services/users-service";
import { isApiError } from "@/types/api";
import type { ApiSuccess } from "@/types/api";
import type { UserAdmin } from "@/types/users";
import { Card } from "@/components/cards";
import { useToast } from "@/components/providers/ToastProvider";
import { Badge } from "@/components/badges";
import { PageHeader, ActionBar, EmptyState, AccessDenied } from "@/components/navigation";
import { SearchBar, ButtonLink } from "@/components/forms";
import { Alert } from "@/components/feedback";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeaderCell,
  TablePagination,
} from "@/components/tables";
import styles from "./UserList.module.css";

const MANAGE_USERS = "MANAGE_USERS";
const DEFAULT_LIMIT = 20;

const CSV_TEMPLATE = `name,email,password,role,permissions
Jane Doe,jane@example.com,ChangeMe12!,VIEWER,
John Smith,john@example.com,ChangeMe12!,IMPORT_OFFICER,CREATE_SHIPMENT|VIEW_SHIPMENTS
`;

export function UserList() {
  const router = useRouter();
  const { accessToken, allowed, pending, denied } = usePermissionGate(MANAGE_USERS);
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

  const fetchList = useCallback(() => {
    if (!accessToken || !allowed || pending) {
      if (!pending) setLoading(false);
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
  }, [accessToken, allowed, pending, page, searchParam]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const totalPages = meta ? Math.ceil(meta.total / meta.limit) : 0;

  function handleSearchSubmit() {
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

  if (pending) {
    return (
      <section>
        <PageHeader title="User management" backHref="/admin/dashboard" backLabel="Dashboard" />
        <LoadingSkeleton lines={6} />
      </section>
    );
  }

  if (denied) {
    return (
      <AccessDenied
        title="User management"
        backHref="/admin/dashboard"
        backLabel="Dashboard"
        message="You do not have permission to manage users."
      />
    );
  }

  return (
    <section>
      <PageHeader
        title="User management"
        backHref="/admin/dashboard"
        backLabel="Dashboard"
        subtitle="Create users, assign roles and permissions, import from CSV."
      />

      <ActionBar
        search={
          <SearchBar
            value={searchInput}
            onChange={setSearchInput}
            onSubmit={handleSearchSubmit}
            placeholder="Search name or email…"
            ariaLabel="Search users"
            fluid
          />
        }
        primaryAction={
          <div className={styles.primaryActions}>
            <ButtonLink href="/admin/users/new" size="sm">
              New user
            </ButtonLink>
          </div>
        }
      />

      <Card className={styles.tableScroll}>
        {error && <Alert>{error}</Alert>}
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

        <TablePagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={meta?.total}
          itemNoun="users"
          showWhenSinglePage
        />
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
