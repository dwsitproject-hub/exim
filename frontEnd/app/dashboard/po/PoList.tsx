"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useTableColumnVisibility, type TableColumnDef } from "@/hooks/use-table-column-visibility";
import { listPo, getPoListFilterOptions } from "@/services/po-service";
import { Card } from "@/components/cards";
import { LoadingSkeleton } from "@/components/feedback";
import { Badge } from "@/components/badges";
import { PageHeader, ActionBar, EmptyState } from "@/components/navigation";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeaderCell,
  TableColumnPicker,
  TableColumnFilterPicker,
} from "@/components/tables";
import { intakeStatusToBadgeVariant, formatStatusLabel } from "@/lib/status-badge";
import { formatPoStatusLabel } from "@/lib/po-status-label";
import { isApiError } from "@/types/api";
import { can } from "@/lib/permissions";
import { MANAGERIAL_LIST_FILTERS } from "@/lib/managerial-deep-link";
import type { ListPoQuery, PoListFilterOptions, PoListItem } from "@/types/po";
import type { ApiSuccess } from "@/types/api";
import { RefreshIcon } from "@/components/icons/RefreshIcon";
import { X } from "lucide-react";
import styles from "./PoList.module.css";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

const PO_LIST_TABLE_COLUMNS_KEY = "eos.dash.poList.tableColumns.v3";

/** All scalar PO detail fields (lines / linked shipments are not columns). */
const PO_TABLE_COLUMNS: TableColumnDef[] = [
  { id: "po_number", label: "PO number", locked: true },
  { id: "external_id", label: "External ID" },
  { id: "pt", label: "PT" },
  { id: "plant", label: "Plant" },
  { id: "supplier", label: "Supplier" },
  { id: "delivery_location", label: "Delivery location" },
  { id: "incoterm_location", label: "Incoterms" },
  { id: "kawasan_berikat", label: "Kawasan berikat" },
  { id: "currency", label: "Currency" },
  { id: "intake_status", label: "PO status" },
  { id: "taken_by_user_id", label: "Taken by (user ID)", defaultVisible: false },
  { id: "taken_by_name", label: "Taken by" },
  { id: "taken_at", label: "Taken at" },
  { id: "created_at", label: "Created at" },
  { id: "updated_at", label: "Updated at" },
  { id: "actions", label: "Actions", locked: true },
];

function buildPoListColumnFilters(
  columnFilters: Record<string, string[]>,
  statusLabelToRaw: Map<string, string>
): Partial<ListPoQuery> {
  const q: Partial<ListPoQuery> = {};
  const raw = (id: string) => columnFilters[id] ?? [];

  const statusLabels = raw("intake_status");
  if (statusLabels.length > 0) {
    const statuses = statusLabels.map((l) => statusLabelToRaw.get(l)).filter((x): x is string => Boolean(x));
    if (statuses.length) q.intake_statuses = statuses;
  }
  if (raw("po_number").length) q.po_numbers = raw("po_number");
  if (raw("external_id").length) q.external_ids = raw("external_id");
  if (raw("pt").length) q.pts = raw("pt");
  if (raw("plant").length) q.plants = raw("plant");
  if (raw("supplier").length) q.supplier_names = raw("supplier");
  if (raw("delivery_location").length) q.delivery_locations = raw("delivery_location");
  if (raw("incoterm_location").length) q.incoterm_locations = raw("incoterm_location");
  if (raw("kawasan_berikat").length) q.kawasan_berikats = raw("kawasan_berikat");
  if (raw("currency").length) q.currencies = raw("currency");
  if (raw("taken_by_user_id").length) q.taken_by_user_ids = raw("taken_by_user_id");
  if (raw("taken_by_name").length) q.taken_by_names = raw("taken_by_name");
  if (raw("taken_at").length) q.taken_at_dates = raw("taken_at");
  if (raw("created_at").length) q.created_at_dates = raw("created_at");
  if (raw("updated_at").length) q.updated_at_dates = raw("updated_at");
  return q;
}

function formatIsoDate(iso: string | null | undefined, dateOnly: boolean): string {
  if (iso == null || String(iso).trim() === "") return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return dateOnly ? d.toLocaleDateString() : d.toLocaleString();
  } catch {
    return "—";
  }
}

export function PoList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFromUrl = searchParams.get("intake_status") ?? undefined;
  const searchFromUrl = searchParams.get("search") ?? "";
  const filterFromUrl = searchParams.get("filter");
  const daysFromUrl = searchParams.get("days");
  const { accessToken, user } = useAuth();
  const { visibleById, toggleColumn, resetColumns, columns: poColumnDefs } = useTableColumnVisibility(
    PO_LIST_TABLE_COLUMNS_KEY,
    PO_TABLE_COLUMNS
  );
  const [items, setItems] = useState<PoListItem[]>([]);
  const [meta, setMeta] = useState<{ page: number; limit: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(DEFAULT_PAGE);
  const [searchInput, setSearchInput] = useState("");
  const [searchParam, setSearchParam] = useState("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [openFilterColumnId, setOpenFilterColumnId] = useState<string | null>(null);
  const [filterOptions, setFilterOptions] = useState<PoListFilterOptions | null>(null);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const columnFiltersKey = JSON.stringify(columnFilters);

  const statusLabelToRaw = useMemo(() => {
    const m = new Map<string, string>();
    for (const raw of filterOptions?.intake_statuses ?? []) {
      m.set(formatPoStatusLabel(raw), raw);
    }
    return m;
  }, [filterOptions]);

  const columnFilterOptions = useMemo(() => {
    if (!filterOptions) return {} as Record<string, string[]>;
    const o = filterOptions;
    return {
      po_number: o.po_numbers,
      external_id: o.external_ids,
      pt: o.pts,
      plant: o.plants,
      supplier: o.supplier_names,
      delivery_location: o.delivery_locations,
      incoterm_location: o.incoterm_locations,
      kawasan_berikat: o.kawasan_berikats,
      currency: o.currencies,
      intake_status: o.intake_statuses.map((s) => formatPoStatusLabel(s)),
      taken_by_user_id: o.taken_by_user_ids,
      taken_by_name: o.taken_by_names,
      taken_at: o.taken_at_dates,
      created_at: o.created_at_dates,
      updated_at: o.updated_at_dates,
    };
  }, [filterOptions]);

  const listQuery = useMemo((): ListPoQuery => {
    const fromCols = buildPoListColumnFilters(columnFilters, statusLabelToRaw);
    const base: ListPoQuery = {
      page,
      limit: DEFAULT_LIMIT,
      search: searchParam.trim() || undefined,
      ...fromCols,
    };
    let out: ListPoQuery;
    if (filterFromUrl === MANAGERIAL_LIST_FILTERS.stale) {
      const d = Math.max(1, parseInt(daysFromUrl || "2", 10) || 2);
      out = {
        ...base,
        intake_status: "NEW_PO_DETECTED",
        unclaimed_only: true,
        detected_older_than_days: d,
      };
    } else if (filterFromUrl === MANAGERIAL_LIST_FILTERS.uncoupled) {
      out = { ...base, has_linked_shipment: false };
    } else {
      out = { ...base, intake_status: statusFromUrl };
    }
    if (sortBy && sortBy !== "actions") {
      out = { ...out, sort_by: sortBy, sort_dir: sortDir };
    }
    return out;
  }, [
    page,
    searchParam,
    columnFiltersKey,
    statusLabelToRaw,
    filterFromUrl,
    daysFromUrl,
    statusFromUrl,
    sortBy,
    sortDir,
  ]);

  const fetchList = useCallback(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    listPo(listQuery, accessToken)
      .then((res) => {
        if (isApiError(res)) {
          setError(res.message);
          return;
        }
        const success = res as ApiSuccess<PoListItem[]>;
        setItems(
          (success.data ?? []).map((r) => ({
            ...r,
            kawasan_berikat: r.kawasan_berikat ?? null,
            currency: r.currency ?? null,
            taken_by_user_id: r.taken_by_user_id ?? null,
            taken_by_name: r.taken_by_name ?? null,
            updated_at: r.updated_at ?? r.created_at,
          }))
        );
        const m = success.meta as { page: number; limit: number; total: number } | undefined;
        if (m) setMeta(m);
      })
      .catch(() => setError("Failed to load Purchase Order"))
      .finally(() => setLoading(false));
  }, [accessToken, listQuery]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    if (!accessToken) return;
    getPoListFilterOptions(accessToken).then((res) => {
      if (isApiError(res) || !res.data) return;
      setFilterOptions(res.data);
    });
  }, [accessToken]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") fetchList();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [fetchList]);

  useEffect(() => {
    setSearchInput(searchFromUrl);
    setSearchParam(searchFromUrl);
    setPage(1);
  }, [searchFromUrl]);

  useEffect(() => {
    setPage(1);
  }, [filterFromUrl, daysFromUrl, statusFromUrl]);

  const clearManagerialFilter = useCallback(() => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("filter");
    p.delete("days");
    router.replace(`/dashboard/po${p.toString() ? `?${p.toString()}` : ""}`, { scroll: false });
  }, [router, searchParams]);

  const totalPages = meta ? Math.ceil(meta.total / meta.limit) : 0;

  const staleDaysChip =
    filterFromUrl === MANAGERIAL_LIST_FILTERS.stale
      ? Math.max(1, parseInt(daysFromUrl || "2", 10) || 2)
      : 2;

  function handleRowClick(id: string) {
    router.push(`/dashboard/po/${id}`);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearchParam(searchInput);
    setPage(1);
  }

  function handleColumnSort(columnId: string) {
    if (columnId === "actions") return;
    setPage(1);
    if (sortBy === columnId) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(columnId);
      setSortDir("asc");
    }
  }

  const visiblePoColumns = poColumnDefs.filter((c) => visibleById[c.id] !== false);

  function renderPoRowCell(column: TableColumnDef, row: PoListItem) {
    switch (column.id) {
      case "po_number":
        return (
          <TableCell key={column.id}>
            <Link href={`/dashboard/po/${row.id}`} className={styles.cellLink} onClick={(e) => e.stopPropagation()}>
              {row.po_number}
            </Link>
          </TableCell>
        );
      case "pt":
        return <TableCell key={column.id}>{row.pt ?? "—"}</TableCell>;
      case "plant":
        return <TableCell key={column.id}>{row.plant ?? "—"}</TableCell>;
      case "supplier":
        return <TableCell key={column.id}>{row.supplier_name ?? "—"}</TableCell>;
      case "external_id":
        return <TableCell key={column.id}>{row.external_id?.trim() || "—"}</TableCell>;
      case "delivery_location":
        return <TableCell key={column.id}>{row.delivery_location?.trim() || "—"}</TableCell>;
      case "incoterm_location":
        return <TableCell key={column.id}>{row.incoterm_location?.trim() || "—"}</TableCell>;
      case "kawasan_berikat":
        return <TableCell key={column.id}>{row.kawasan_berikat?.trim() || "—"}</TableCell>;
      case "currency":
        return <TableCell key={column.id}>{row.currency?.trim() || "—"}</TableCell>;
      case "taken_by_user_id":
        return <TableCell key={column.id}>{row.taken_by_user_id?.trim() || "—"}</TableCell>;
      case "taken_by_name":
        return <TableCell key={column.id}>{row.taken_by_name?.trim() || "—"}</TableCell>;
      case "taken_at":
        return <TableCell key={column.id}>{formatIsoDate(row.taken_at, false)}</TableCell>;
      case "created_at":
        return <TableCell key={column.id}>{formatIsoDate(row.created_at, true)}</TableCell>;
      case "updated_at":
        return <TableCell key={column.id}>{formatIsoDate(row.updated_at, false)}</TableCell>;
      case "intake_status":
        return (
          <TableCell key={column.id}>
            <Badge variant={intakeStatusToBadgeVariant(row.intake_status)}>{formatPoStatusLabel(row.intake_status)}</Badge>
          </TableCell>
        );
      case "actions":
        return (
          <TableCell key={column.id}>
            <div className={styles.actionCell} onClick={(e) => e.stopPropagation()}>
              <Link href={`/dashboard/po/${row.id}`} className={styles.actionBtn}>
                View
              </Link>
              {can(user, "UPDATE_PO_INTAKE") && (
                <Link href={`/dashboard/po/${row.id}/edit`} className={styles.actionBtn}>
                  Edit
                </Link>
              )}
            </div>
          </TableCell>
        );
      default:
        return null;
    }
  }

  return (
    <section>
      <PageHeader
        title="Purchase Order"
        backHref="/dashboard"
        backLabel="Dashboard"
      />

      <ActionBar
        search={
          <form onSubmit={handleSearchSubmit} className={styles.searchForm}>
            <input
              type="search"
              placeholder="Search Purchase Order number, supplier…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className={styles.searchInput}
              aria-label="Search Purchase Order"
            />
            <button type="submit" className={styles.searchSubmit}>
              Search
            </button>
          </form>
        }
        primaryAction={
          <div className={styles.primaryActions}>
            <Link href="/dashboard/po/new" className={styles.createBtn}>
              Create Purchase Order
            </Link>
            <button
              type="button"
              className={`${styles.createBtn} ${styles.refreshBtn}`}
              onClick={() => fetchList()}
              disabled={loading}
              aria-label="Refresh list"
            >
              <RefreshIcon className={styles.refreshIcon} />
            </button>
          </div>
        }
      />

      {error && <p className={styles.error}>{error}</p>}
      {loading ? (
        <LoadingSkeleton lines={6} />
      ) : (
        <Card>
          {(filterFromUrl === MANAGERIAL_LIST_FILTERS.stale || filterFromUrl === MANAGERIAL_LIST_FILTERS.uncoupled) && (
            <div className={styles.filterChipsBar}>
              <span className={styles.filterChip}>
                {filterFromUrl === MANAGERIAL_LIST_FILTERS.stale ? (
                  <>
                    Stale POs: New PO detected, unclaimed, detected &gt; {staleDaysChip} day(s) ago
                  </>
                ) : (
                  <>Uncoupled: no active shipment link</>
                )}
                <button
                  type="button"
                  className={styles.filterChipRemove}
                  aria-label="Clear managerial filter"
                  onClick={clearManagerialFilter}
                >
                  <X size={14} />
                </button>
              </span>
            </div>
          )}
          {items.length === 0 ? (
            <EmptyState
              title="No Purchase Order found"
              description={
                searchParam.trim() || statusFromUrl || filterFromUrl
                  ? "Try adjusting your search or filter."
                  : "New Purchase Orders from the external system will appear here."
              }
            />
          ) : (
            <>
              <div className={styles.tableToolbar}>
                <button
                  type="button"
                  className={styles.filterClear}
                  onClick={() => {
                    setPage(1);
                    setColumnFilters({});
                  }}
                  disabled={Object.values(columnFilters).every((v) => !Array.isArray(v) || v.length === 0)}
                >
                  Clear column filters
                </button>
                <TableColumnPicker
                  columns={PO_TABLE_COLUMNS}
                  visibleById={visibleById}
                  onToggle={toggleColumn}
                  onReset={resetColumns}
                />
              </div>
              <Table wrapperClassName={styles.tableFixedHeight}>
                <TableHead>
                  <TableRow>
                    {visiblePoColumns.map((c) => (
                      <TableHeaderCell
                        key={c.id}
                        aria-sort={
                          sortBy === c.id ? (sortDir === "asc" ? "ascending" : "descending") : undefined
                        }
                      >
                        <span className={styles.thWithFilter}>
                          {c.id === "actions" ? (
                            <span className={styles.thLabelStatic}>{c.label}</span>
                          ) : (
                            <button
                              type="button"
                              className={styles.sortHeadBtn}
                              onClick={() => handleColumnSort(c.id)}
                              aria-label={`Sort by ${c.label}${sortBy === c.id ? `, ${sortDir === "asc" ? "ascending" : "descending"}` : ""}`}
                            >
                              <span>{c.label}</span>
                              {sortBy === c.id ? (
                                <span className={styles.sortIndicator} aria-hidden>
                                  {sortDir === "asc" ? "↑" : "↓"}
                                </span>
                              ) : null}
                            </button>
                          )}
                          {c.id !== "actions" && (
                            <TableColumnFilterPicker
                              columnLabel={c.label}
                              options={columnFilterOptions[c.id] ?? []}
                              selected={columnFilters[c.id] ?? []}
                              onChange={(nextSelected) => {
                                setPage(1);
                                setColumnFilters((prev) => ({ ...prev, [c.id]: nextSelected }));
                              }}
                              open={openFilterColumnId === c.id}
                              onOpenChange={(open) => setOpenFilterColumnId(open ? c.id : null)}
                            />
                          )}
                        </span>
                      </TableHeaderCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((row) => (
                    <TableRow
                      key={row.id}
                      className={styles.clickableRow}
                      onClick={() => handleRowClick(row.id)}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                          e.preventDefault();
                          handleRowClick(row.id);
                        }
                      }}
                      tabIndex={0}
                      role="link"
                      aria-label={`Open Purchase Order ${row.po_number}`}
                    >
                      {visiblePoColumns.map((c) => renderPoRowCell(c, row))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <nav className={styles.pagination} aria-label="Pagination">
                  <button
                    type="button"
                    className={styles.pageBtn}
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <span className={styles.pageInfo}>
                    Page {page} of {totalPages}
                    {meta && ` (${meta.total} total)`}
                  </span>
                  <button
                    type="button"
                    className={styles.pageBtn}
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </nav>
              )}
            </>
          )}
        </Card>
      )}
    </section>
  );
}
