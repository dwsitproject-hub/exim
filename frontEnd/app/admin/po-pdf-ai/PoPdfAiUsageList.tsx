"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { can } from "@/lib/permissions";
import { listPoPdfAiRequests } from "@/services/po-service";
import { isApiError } from "@/types/api";
import type { ApiSuccess } from "@/types/api";
import type { PoPdfAiRequestItem } from "@/types/po";
import { Card } from "@/components/cards";
import { LoadingSkeleton } from "@/components/feedback";
import { PageHeader, EmptyState } from "@/components/navigation";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeaderCell,
} from "@/components/tables";
import styles from "./PoPdfAiUsageList.module.css";

const VIEW_PO_PDF_AI_USAGE = "VIEW_PO_PDF_AI_USAGE";
const DEFAULT_LIMIT = 20;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function confidenceLabel(v: string | null): string {
  if (!v) return "—";
  return v;
}

function ConfidenceChange({
  before,
  after,
}: {
  before: PoPdfAiRequestItem["confidence_before"];
  after: PoPdfAiRequestItem["confidence_after"];
}) {
  if (!before && !after) return <>—</>;
  return (
    <span>
      <span className={styles.confidence}>{confidenceLabel(before)}</span>
      <span className={styles.confidenceArrow}>→</span>
      <span className={styles.confidence}>{confidenceLabel(after)}</span>
    </span>
  );
}

export function PoPdfAiUsageList() {
  const { user, accessToken } = useAuth();
  const allowed = can(user, VIEW_PO_PDF_AI_USAGE);
  const [items, setItems] = useState<PoPdfAiRequestItem[]>([]);
  const [meta, setMeta] = useState<{ page: number; limit: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const fetchList = useCallback(() => {
    if (!accessToken || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    listPoPdfAiRequests(accessToken, { page, limit: DEFAULT_LIMIT })
      .then((res) => {
        if (isApiError(res)) {
          setError(res.message);
          return;
        }
        const success = res as ApiSuccess<PoPdfAiRequestItem[]>;
        setItems(success.data ?? []);
        const m = success.meta as { page: number; limit: number; total: number } | undefined;
        if (m) setMeta(m);
        setError(null);
      })
      .catch(() => setError("Failed to load PO PDF AI usage"))
      .finally(() => setLoading(false));
  }, [accessToken, allowed, page]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  if (!allowed) {
    return (
      <section>
        <PageHeader title="PO PDF AI usage" backHref="/admin/dashboard" backLabel="Admin" />
        <p className={styles.denied}>You do not have permission to view this page.</p>
      </section>
    );
  }

  const totalPages = meta ? Math.ceil(meta.total / meta.limit) : 0;

  return (
    <section className={styles.poPdfAiUsageList}>
      <PageHeader
        title="PO PDF AI usage"
        subtitle="Users who requested Rescan with AI on PO PDF uploads, with confidence before and after."
        backHref="/admin/dashboard"
        backLabel="Admin"
      />

      {loading ? (
        <LoadingSkeleton lines={6} className={styles.loading} />
      ) : error ? (
        <p className={styles.error}>{error}</p>
      ) : items.length === 0 ? (
        <EmptyState title="No AI rescans yet" description="Rescan with AI events will appear here." />
      ) : (
        <Card>
          <p className={styles.meta}>
            {meta ? `${meta.total} request${meta.total === 1 ? "" : "s"} total` : null}
          </p>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>When</TableHeaderCell>
                <TableHeaderCell>User</TableHeaderCell>
                <TableHeaderCell>File / PO</TableHeaderCell>
                <TableHeaderCell>Items</TableHeaderCell>
                <TableHeaderCell>Confidence</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{formatDate(row.created_at)}</TableCell>
                  <TableCell>
                    <div>{row.user_name}</div>
                    <div className={styles.meta}>{row.user_email}</div>
                  </TableCell>
                  <TableCell>
                    {row.original_filename && (
                      <div className={styles.filename} title={row.original_filename}>
                        {row.original_filename}
                      </div>
                    )}
                    <div className={styles.meta}>{row.po_number ?? "PO not detected"}</div>
                  </TableCell>
                  <TableCell>
                    {row.items_before} → {row.items_after}
                  </TableCell>
                  <TableCell>
                    <ConfidenceChange before={row.confidence_before} after={row.confidence_after} />
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        row.status === "success" ? styles.statusSuccess : styles.statusFailed
                      }
                    >
                      {row.status === "success" ? "Success" : "Failed"}
                    </span>
                    {row.error_message && (
                      <div className={styles.errorCell} title={row.error_message}>
                        {row.error_message}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                type="button"
                className={styles.pageBtn}
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className={styles.pageInfo}>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className={styles.pageBtn}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </Card>
      )}
    </section>
  );
}
