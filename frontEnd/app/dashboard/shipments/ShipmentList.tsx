"use client";

import { Fragment, useCallback, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RotateCw, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTableColumnVisibility, type TableColumnDef } from "@/hooks/use-table-column-visibility";
import { listShipments, getShipmentListFilterOptions } from "@/services/shipments-service";
import { Card } from "@/components/cards";
import { LoadingSkeleton } from "@/components/feedback";
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
import { isApiError } from "@/types/api";
import { displayPibTypeLabel } from "@/lib/pib-type-label";
import { displayProductClassification } from "@/lib/product-classification";
import { formatStatusLabel } from "@/lib/status-badge";
import { shipmentTimelineStatusTone } from "@/lib/shipment-timeline-status";
import { MANAGERIAL_LIST_FILTERS } from "@/lib/managerial-deep-link";
import {
  PERFORMANCE_ETA_LATE_QUERY_PARAM,
  PERFORMANCE_STATUS_QUERY_PARAM,
} from "@/lib/shipment-performance-deep-link";
import type { ShipmentListItem, ShipmentListLinkedPo, ShipmentListFilterOptions, ListShipmentsQuery } from "@/types/shipments";
import { formatDayMonthYear } from "@/lib/format-date";
import type { ApiSuccess } from "@/types/api";
import styles from "./ShipmentList.module.css";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

const SHIPMENT_LIST_TABLE_COLUMNS_KEY = "eos.dash.shipmentList.tableColumns.v4";

/** PT and Plant first for sticky priority; Shipment scrolls with the table. */
const SHIPMENT_TABLE_COLUMNS: TableColumnDef[] = [
  { id: "pt", label: "PT", locked: true },
  { id: "plant", label: "Plant", locked: true },
  { id: "shipment", label: "Shipment", locked: true },
  { id: "status", label: "Status" },
  { id: "po_number", label: "PO number" },
  { id: "vendor", label: "Vendor" },
  { id: "incoterm", label: "Incoterms" },
  { id: "pib_type", label: "PIB type" },
  { id: "ship_via", label: "Ship via" },
  { id: "product_classification", label: "Product classification" },
  { id: "ship_by", label: "Ship by" },
  { id: "pic", label: "PIC" },
  { id: "forwarder", label: "Forwarder" },
  { id: "etd", label: "ETD" },
  { id: "eta", label: "ETA" },
  { id: "origin_port", label: "Origin port" },
  { id: "destination_port", label: "Destination port" },
];

/** `ship_via` shares filter state with `shipment_method` (same DB column). */
function columnFilterStateKey(columnId: string): string {
  return columnId === "ship_via" ? "shipment_method" : columnId;
}

function buildListQueryFromColumnFilters(
  columnFilters: Record<string, string[]>,
  statusLabelToRaw: Map<string, string>
): Partial<ListShipmentsQuery> {
  const q: Partial<ListShipmentsQuery> = {};
  const raw = (id: string) => columnFilters[id] ?? [];

  const statusLabels = raw("status");
  if (statusLabels.length > 0) {
    const statuses = statusLabels.map((l) => statusLabelToRaw.get(l)).filter((x): x is string => Boolean(x));
    if (statuses.length) q.statuses = statuses;
  }
  if (raw("shipment").length) q.shipment_nos = raw("shipment");
  if (raw("pt").length) q.pts = raw("pt");
  if (raw("plant").length) q.plants = raw("plant");
  if (raw("vendor").length) q.vendor_names_exact = raw("vendor");
  if (raw("po_number").length) q.po_numbers = raw("po_number");
  if (raw("incoterm").length) q.incoterms = raw("incoterm");
  if (raw("pib_type").length) q.pib_types = raw("pib_type");
  if (raw("shipment_method").length) q.shipment_methods = raw("shipment_method");
  if (raw("product_classification").length) q.product_classifications = raw("product_classification");
  if (raw("ship_by").length) q.ship_bys = raw("ship_by");
  if (raw("pic").length) q.pic_names = raw("pic");
  if (raw("forwarder").length) q.forwarder_names = raw("forwarder");
  if (raw("etd").length) q.etd_dates = raw("etd");
  if (raw("eta").length) q.eta_dates = raw("eta");
  if (raw("origin_port").length) q.origin_port_names = raw("origin_port");
  if (raw("destination_port").length) q.destination_port_names = raw("destination_port");
  return q;
}

function displayScheduleDate(iso: string | null | undefined): string {
  return formatDayMonthYear(iso);
}

function formatLineQty(q: number | string | null | undefined): string {
  if (q == null || q === "") return "—";
  if (typeof q === "number") return Number.isInteger(q) ? String(q) : String(q);
  const n = Number(q);
  return Number.isNaN(n) ? String(q) : Number.isInteger(n) ? String(n) : String(n);
}

function normalizeListRow(row: ShipmentListItem): ShipmentListItem {
  const linked = (row.linked_pos ?? []).map((p) => ({
    ...p,
    currency: p.currency ?? null,
    intake_status: p.intake_status ?? null,
  }));
  const linked_po_count = row.linked_po_count ?? linked.length;
  return {
    ...row,
    closed_at: row.closed_at ?? null,
    linked_pos: linked,
    linked_po_count,
    incoterm: row.incoterm ?? null,
    pib_type: row.pib_type ?? null,
    shipment_method: row.shipment_method ?? null,
    product_classification: row.product_classification ?? null,
    ship_by: row.ship_by ?? null,
  };
}

function EmptyText() {
  return <span className={styles.cellEmpty}>—</span>;
}

function CellText({ value, className }: { value: string | null | undefined; className?: string }) {
  const t = value?.trim();
  if (!t) return <EmptyText />;
  return <span className={className}>{t}</span>;
}

export function ShipmentList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchFromUrl = searchParams.get("search") ?? "";
  const poFromUrl = (searchParams.get("po_from_date") ?? "").trim();
  const poToUrl = (searchParams.get("po_to_date") ?? "").trim();
  const managerialFilter = searchParams.get("filter");
  const managerialDays = searchParams.get("days");
  const performanceStatusRaw = (searchParams.get(PERFORMANCE_STATUS_QUERY_PARAM) ?? "").trim() || undefined;
  const performanceEtaLate =
    searchParams.get(PERFORMANCE_ETA_LATE_QUERY_PARAM) === "true" ||
    searchParams.get(PERFORMANCE_ETA_LATE_QUERY_PARAM) === "1";
  const { accessToken } = useAuth();
  const { visibleById, toggleColumn, resetColumns, columns: shipmentColumnDefs } = useTableColumnVisibility(
    SHIPMENT_LIST_TABLE_COLUMNS_KEY,
    SHIPMENT_TABLE_COLUMNS
  );
  const [items, setItems] = useState<ShipmentListItem[]>([]);
  const [meta, setMeta] = useState<{ page: number; limit: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(DEFAULT_PAGE);
  const [searchInput, setSearchInput] = useState("");
  const [searchParam, setSearchParam] = useState("");
  const [poFromInput, setPoFromInput] = useState(poFromUrl);
  const [poToInput, setPoToInput] = useState(poToUrl);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [openFilterColumnId, setOpenFilterColumnId] = useState<string | null>(null);
  const [filterOptions, setFilterOptions] = useState<ShipmentListFilterOptions | null>(null);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const syncSearchToUrl = useCallback(
    (search: string) => {
      const p = new URLSearchParams(searchParams.toString());
      if (search) p.set("search", search);
      else p.delete("search");
      router.replace(`/dashboard/shipments${p.toString() ? `?${p.toString()}` : ""}`, { scroll: false });
    },
    [router, searchParams]
  );

  const statusLabelToRaw = useMemo(() => {
    const m = new Map<string, string>();
    for (const raw of filterOptions?.statuses ?? []) {
      m.set(formatStatusLabel(raw), raw);
    }
    return m;
  }, [filterOptions]);

  const columnFilterOptions = useMemo(() => {
    if (!filterOptions) return {} as Record<string, string[]>;
    const o = filterOptions;
    return {
      status: o.statuses.map((s) => formatStatusLabel(s)),
      shipment: o.shipment_numbers,
      pt: o.pts,
      plant: o.plants,
      po_number: o.po_numbers,
      vendor: o.vendors,
      incoterm: o.incoterms,
      pib_type: o.pib_types,
      shipment_method: o.shipment_methods,
      ship_via: o.shipment_methods,
      product_classification: o.product_classifications,
      ship_by: o.ship_bys,
      pic: o.pic_names,
      forwarder: o.forwarder_names,
      etd: o.etd_dates,
      eta: o.eta_dates,
      origin_port: o.origin_port_names,
      destination_port: o.destination_port_names,
    };
  }, [filterOptions]);

  const columnFiltersKey = JSON.stringify(columnFilters);

  const fetchList = useCallback(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const fromCols = buildListQueryFromColumnFilters(columnFilters, statusLabelToRaw);
    const dormantDays = Math.max(1, parseInt(managerialDays || "30", 10) || 30);
    const listQuery: ListShipmentsQuery = {
      page,
      limit: DEFAULT_LIMIT,
      search: searchParam.trim() || undefined,
      po_from_date: poFromUrl || undefined,
      po_to_date: poToUrl || undefined,
      ...(managerialFilter === MANAGERIAL_LIST_FILTERS.dormantRemaining
        ? { dormant_remaining_qty: true, dormant_days: dormantDays }
        : {}),
      ...fromCols,
    };
    if (performanceStatusRaw && (!fromCols.statuses || fromCols.statuses.length === 0)) {
      listQuery.statuses = [performanceStatusRaw];
    }
    if (performanceEtaLate) {
      listQuery.performance_eta_late = true;
    }
    if (sortBy) {
      listQuery.sort_by = sortBy;
      listQuery.sort_dir = sortDir;
    }
    listShipments(listQuery, accessToken)
      .then((res) => {
        if (isApiError(res)) {
          setError(res.message);
          return;
        }
        const success = res as ApiSuccess<ShipmentListItem[]>;
        const raw = success.data ?? [];
        setItems(raw.map(normalizeListRow));
        const m = success.meta as { page: number; limit: number; total: number } | undefined;
        if (m) setMeta(m);
      })
      .catch(() => setError("Failed to load shipments"))
      .finally(() => setLoading(false));
  }, [
    accessToken,
    page,
    searchParam,
    poFromUrl,
    poToUrl,
    managerialFilter,
    managerialDays,
    performanceStatusRaw,
    performanceEtaLate,
    columnFiltersKey,
    statusLabelToRaw,
    sortBy,
    sortDir,
  ]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    if (!accessToken) return;
    getShipmentListFilterOptions(accessToken).then((res) => {
      if (isApiError(res) || !res.data) return;
      setFilterOptions(res.data);
    });
  }, [accessToken]);

  useEffect(() => {
    setSearchInput(searchFromUrl);
    setSearchParam(searchFromUrl);
    setPage(1);
  }, [searchFromUrl]);

  useEffect(() => {
    setPoFromInput(poFromUrl);
    setPoToInput(poToUrl);
    setPage(1);
  }, [poFromUrl, poToUrl]);

  useEffect(() => {
    setPage(1);
  }, [managerialFilter, managerialDays]);

  useEffect(() => {
    setPage(1);
  }, [performanceStatusRaw]);

  useEffect(() => {
    setPage(1);
  }, [performanceEtaLate]);

  useEffect(() => {
    if (!performanceStatusRaw || !filterOptions?.statuses?.includes(performanceStatusRaw)) return;
    const label = formatStatusLabel(performanceStatusRaw);
    setColumnFilters((prev) => {
      if (prev.status?.length === 1 && prev.status[0] === label) return prev;
      return { ...prev, status: [label] };
    });
  }, [performanceStatusRaw, filterOptions]);

  const clearManagerialShipmentFilter = useCallback(() => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("filter");
    p.delete("days");
    router.replace(`/dashboard/shipments${p.toString() ? `?${p.toString()}` : ""}`, { scroll: false });
  }, [router, searchParams]);

  const clearPerformanceStatusFilter = useCallback(() => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete(PERFORMANCE_STATUS_QUERY_PARAM);
    router.replace(`/dashboard/shipments${p.toString() ? `?${p.toString()}` : ""}`, { scroll: false });
    setColumnFilters((prev) => {
      const next = { ...prev };
      delete next.status;
      return next;
    });
  }, [router, searchParams]);

  const clearPerformanceEtaLateFilter = useCallback(() => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete(PERFORMANCE_ETA_LATE_QUERY_PARAM);
    router.replace(`/dashboard/shipments${p.toString() ? `?${p.toString()}` : ""}`, { scroll: false });
  }, [router, searchParams]);

  const syncPoDatesToUrl = useCallback(
    (from: string, to: string) => {
      const p = new URLSearchParams(searchParams.toString());
      const f = from.trim();
      const t = to.trim();
      if (f) p.set("po_from_date", f);
      else p.delete("po_from_date");
      if (t) p.set("po_to_date", t);
      else p.delete("po_to_date");
      router.replace(`/dashboard/shipments${p.toString() ? `?${p.toString()}` : ""}`, { scroll: false });
    },
    [router, searchParams]
  );

  const totalPages = meta ? Math.ceil(meta.total / meta.limit) : 0;

  function handleRowClick(shipmentId: string) {
    router.push(`/dashboard/shipments/${shipmentId}`);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearchParam(searchInput);
    setPage(1);
    syncSearchToUrl(searchInput);
  }

  function handleColumnSort(columnId: string) {
    setPage(1);
    if (sortBy === columnId) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(columnId);
      setSortDir("asc");
    }
  }

  function applyPoDateFilter() {
    syncPoDatesToUrl(poFromInput, poToInput);
  }

  function clearPoDateFilter() {
    setPoFromInput("");
    setPoToInput("");
    syncPoDatesToUrl("", "");
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const visibleShipmentColumns = shipmentColumnDefs.filter((c) => visibleById[c.id] !== false);

  function setColumnFilter(key: string, nextSelected: string[]) {
    setColumnFilters((prev) => ({ ...prev, [key]: nextSelected }));
    setPage(1);
    const fk = columnFilterStateKey(key);
    const p = new URLSearchParams(searchParams.toString());
    let changed = false;
    if (fk === "status" && performanceStatusRaw) {
      p.delete(PERFORMANCE_STATUS_QUERY_PARAM);
      changed = true;
    }
    if (performanceEtaLate) {
      p.delete(PERFORMANCE_ETA_LATE_QUERY_PARAM);
      changed = true;
    }
    if (changed) {
      router.replace(`/dashboard/shipments${p.toString() ? `?${p.toString()}` : ""}`, { scroll: false });
    }
  }

  function statusBadgeClass(status: string | null | undefined): string {
    const tone = shipmentTimelineStatusTone(status);
    if (tone === "delivered") return styles.statusDelivered;
    if (tone === "green") return styles.statusGreen;
    return styles.statusEarly;
  }

  function renderShipmentRowCell(column: (typeof SHIPMENT_TABLE_COLUMNS)[number], row: ShipmentListItem) {
    const linked = row.linked_pos ?? [];
    const n = row.linked_po_count ?? linked.length;
    const expanded = expandedIds.has(row.id);
    const vendor = row.vendor_name ?? row.supplier_name;

    switch (column.id) {
      case "pt":
        return (
          <TableCell key={column.id} className={styles.ptStickyCol}>
            <CellText value={row.display_pt} className={styles.stickyCellTruncate} />
          </TableCell>
        );
      case "plant":
        return (
          <TableCell key={column.id} className={styles.plantStickyCol}>
            <CellText value={row.display_plant} className={styles.stickyCellTruncate} />
          </TableCell>
        );
      case "shipment":
        return (
          <TableCell key={column.id}>
            <Link
              href={`/dashboard/shipments/${row.id}`}
              className={styles.cellLink}
              onClick={(e) => e.stopPropagation()}
            >
              {row.shipment_number}
            </Link>
          </TableCell>
        );
      case "status":
        return (
          <TableCell key={column.id}>
            <span className={`${styles.statusBadge} ${statusBadgeClass(row.current_status)}`}>
              {formatStatusLabel(row.current_status ?? "")}
            </span>
          </TableCell>
        );
      case "po_number":
        return (
          <TableCell key={column.id} className={styles.poCell}>
            {n === 0 && <EmptyText />}
            {n === 1 && (linked[0]?.po_number?.trim() ? linked[0].po_number : <EmptyText />)}
            {n > 1 && (
              <button
                type="button"
                className={styles.poToggle}
                aria-expanded={expanded}
                aria-controls={`shipment-${row.id}-po-panel`}
                id={`shipment-${row.id}-po-trigger`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(row.id);
                }}
              >
                {n} POs
                <span className={styles.poToggleIcon} aria-hidden>
                  {expanded ? " ▴" : " ▾"}
                </span>
              </button>
            )}
          </TableCell>
        );
      case "vendor":
        return (
          <TableCell key={column.id}>
            <CellText value={vendor} />
          </TableCell>
        );
      case "incoterm":
        return (
          <TableCell key={column.id}>
            <CellText value={row.incoterm} />
          </TableCell>
        );
      case "pib_type": {
        const pib = displayPibTypeLabel(row.pib_type);
        return (
          <TableCell key={column.id}>
            <CellText value={pib === "—" ? null : pib} />
          </TableCell>
        );
      }
      case "ship_via":
        return (
          <TableCell key={column.id}>
            <CellText value={row.shipment_method} />
          </TableCell>
        );
      case "product_classification": {
        const pc = displayProductClassification(row.product_classification);
        return (
          <TableCell key={column.id}>
            <CellText value={pc === "—" ? null : pc} />
          </TableCell>
        );
      }
      case "ship_by":
        return (
          <TableCell key={column.id}>
            <CellText value={row.ship_by} />
          </TableCell>
        );
      case "pic":
        return (
          <TableCell key={column.id}>
            <CellText value={row.pic_name} />
          </TableCell>
        );
      case "forwarder":
        return (
          <TableCell key={column.id}>
            <CellText value={row.forwarder_name} />
          </TableCell>
        );
      case "etd":
        return <TableCell key={column.id}>{displayScheduleDate(row.etd)}</TableCell>;
      case "eta":
        return <TableCell key={column.id}>{displayScheduleDate(row.eta)}</TableCell>;
      case "origin_port":
        return (
          <TableCell key={column.id}>
            <CellText value={row.origin_port_name} />
          </TableCell>
        );
      case "destination_port":
        return (
          <TableCell key={column.id}>
            <CellText value={row.destination_port_name} />
          </TableCell>
        );
      default:
        return null;
    }
  }

  function renderPoExpandPanel(pos: ShipmentListLinkedPo[]) {
    return (
      <div className={styles.expandPanel}>
        {pos.map((po) => (
          <div key={po.intake_id} className={styles.expandPoBlock}>
            <div className={styles.expandPoTitle}>
              PO <strong>{po.po_number}</strong>
              {(po.pt || po.plant) && (
                <span className={styles.expandPoMeta}>
                  {[po.pt, po.plant].filter(Boolean).join(" · ")}
                </span>
              )}
            </div>
            {po.items.length === 0 ? (
              <p className={styles.expandEmptyLines}>No line items on this PO.</p>
            ) : (
              <table className={styles.expandItemsTable}>
                <thead>
                  <tr>
                    <th className={styles.expandTh}>Item description</th>
                    <th className={styles.expandThQty}>Qty PO</th>
                    <th className={styles.expandThQty}>Delivery qty</th>
                    <th className={styles.expandThUnit}>Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {po.items.map((it, idx) => (
                    <tr key={`${po.intake_id}-${idx}`}>
                      <td>{it.item_description?.trim() || "—"}</td>
                      <td className={styles.expandTdNum}>{formatLineQty(it.qty_po)}</td>
                      <td className={styles.expandTdNum}>
                        {it.delivery_qty != null && it.delivery_qty !== ""
                          ? formatLineQty(it.delivery_qty)
                          : "—"}
                      </td>
                      <td>{it.unit?.trim() || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    );
  }

  const colSpanData = visibleShipmentColumns.length;

  function formatOptionForColumn(columnId: string): ((v: string) => string) | undefined {
    if (columnId === "pib_type") return (v) => displayPibTypeLabel(v);
    if (columnId === "product_classification") return (v) => displayProductClassification(v);
    return undefined;
  }

  return (
    <section>
      <PageHeader title="Shipments" backHref="/dashboard" backLabel="Dashboard" />

      <ActionBar
        search={
          <form onSubmit={handleSearchSubmit} className={styles.searchForm}>
            <input
              type="search"
              placeholder="Search shipment, supplier, or PO…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className={styles.searchInput}
              aria-label="Search shipments"
            />
            <button type="submit" className={styles.searchSubmit}>
              Search
            </button>
          </form>
        }
        filters={
          <div className={styles.filterBar} data-tour="shipment-po-date-filter">
            <span className={styles.filterLabel}>PO date</span>
            <label className={styles.dateField}>
              <span className={styles.dateFieldLabel}>From</span>
              <input
                type="date"
                className={styles.dateInput}
                value={poFromInput}
                onChange={(e) => setPoFromInput(e.target.value)}
                aria-label="PO date from"
              />
            </label>
            <label className={styles.dateField}>
              <span className={styles.dateFieldLabel}>To</span>
              <input
                type="date"
                className={styles.dateInput}
                value={poToInput}
                onChange={(e) => setPoToInput(e.target.value)}
                aria-label="PO date to"
              />
            </label>
            <div className={styles.poDateActions}>
              <button type="button" className={styles.filterApply} onClick={applyPoDateFilter}>
                Apply
              </button>
              <button type="button" className={styles.filterClear} onClick={clearPoDateFilter}>
                Clear
              </button>
            </div>
          </div>
        }
        primaryAction={
          <button
            type="button"
            className={styles.refreshIconBtn}
            onClick={() => fetchList()}
            disabled={loading}
            aria-label="Refresh list"
            title="Refresh"
          >
            <RotateCw size={18} strokeWidth={2} aria-hidden />
          </button>
        }
      />

      {(managerialFilter === MANAGERIAL_LIST_FILTERS.dormantRemaining ||
        performanceStatusRaw ||
        performanceEtaLate) && (
        <div className={styles.filterChipsBar}>
          {managerialFilter === MANAGERIAL_LIST_FILTERS.dormantRemaining && (
            <span className={styles.filterChip}>
              Dormant: remaining PO line qty, shipment last updated &gt;{" "}
              {Math.max(1, parseInt(managerialDays || "30", 10) || 30)} day(s) ago
              <button
                type="button"
                className={styles.filterChipRemove}
                aria-label="Clear managerial filter"
                onClick={clearManagerialShipmentFilter}
              >
                <X size={14} />
              </button>
            </span>
          )}
          {performanceStatusRaw && (
            <span className={styles.filterChip}>
              Shipment performance: {formatStatusLabel(performanceStatusRaw)}
              <button
                type="button"
                className={styles.filterChipRemove}
                aria-label="Clear performance status filter"
                onClick={clearPerformanceStatusFilter}
              >
                <X size={14} />
              </button>
            </span>
          )}
          {performanceEtaLate && (
            <span className={styles.filterChip}>
              Late / delayed: overdue ETA, not delivered
              <button
                type="button"
                className={styles.filterChipRemove}
                aria-label="Clear late / delayed filter"
                onClick={clearPerformanceEtaLateFilter}
              >
                <X size={14} />
              </button>
            </span>
          )}
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}
      {loading ? (
        <LoadingSkeleton lines={6} />
      ) : (
        <Card>
          {items.length === 0 ? (
            <EmptyState
              title="No shipments found"
              description={
                searchParam.trim() ||
                poFromUrl ||
                poToUrl ||
                performanceStatusRaw ||
                performanceEtaLate ||
                Object.keys(columnFilters).some((k) => columnFilters[k]?.length)
                  ? "Try adjusting search, PO date, or column filters."
                  : "Create a shipment from a PO (Take ownership → Create shipment)."
              }
            />
          ) : (
            <>
              <div className={styles.tableToolbar} data-tour="shipment-column-filters">
                <button
                  type="button"
                  className={styles.filterClear}
                  onClick={() => {
                    setColumnFilters({});
                    setPage(1);
                    if (performanceStatusRaw || performanceEtaLate) {
                      const p = new URLSearchParams(searchParams.toString());
                      p.delete(PERFORMANCE_STATUS_QUERY_PARAM);
                      p.delete(PERFORMANCE_ETA_LATE_QUERY_PARAM);
                      router.replace(`/dashboard/shipments${p.toString() ? `?${p.toString()}` : ""}`, { scroll: false });
                    }
                  }}
                  disabled={Object.values(columnFilters).every((v) => !Array.isArray(v) || v.length === 0)}
                >
                  Clear column filters
                </button>
                <span data-tour="shipment-column-picker">
                  <TableColumnPicker
                    columns={SHIPMENT_TABLE_COLUMNS}
                    visibleById={visibleById}
                    onToggle={toggleColumn}
                    onReset={resetColumns}
                  />
                </span>
              </div>
              <Table wrapperClassName={styles.tableFixedHeight} className={styles.shipmentTable}>
                <TableHead>
                  <TableRow>
                    {visibleShipmentColumns.map((c) => {
                      const fk = columnFilterStateKey(c.id);
                      const selected = columnFilters[fk] ?? [];
                      const opts = columnFilterOptions[c.id] ?? [];
                      return (
                        <TableHeaderCell
                          key={c.id}
                          className={
                            c.id === "pt"
                              ? styles.ptStickyTh
                              : c.id === "plant"
                                ? styles.plantStickyTh
                                : undefined
                          }
                          aria-sort={
                            sortBy === c.id ? (sortDir === "asc" ? "ascending" : "descending") : undefined
                          }
                        >
                          <div className={styles.headerCellFilter}>
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
                            <TableColumnFilterPicker
                              columnLabel={c.label}
                              options={opts}
                              selected={selected}
                              onChange={(next) => setColumnFilter(fk, next)}
                              open={openFilterColumnId === c.id}
                              onOpenChange={(open) => setOpenFilterColumnId(open ? c.id : null)}
                              revealIconOnHover
                              formatOptionLabel={formatOptionForColumn(c.id)}
                            />
                          </div>
                        </TableHeaderCell>
                      );
                    })}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((row) => {
                    const linked = row.linked_pos ?? [];
                    const n = row.linked_po_count ?? linked.length;
                    const expanded = expandedIds.has(row.id);

                    return (
                      <Fragment key={row.id}>
                        <TableRow
                          className={styles.rowInteractive}
                          onClick={() => handleRowClick(row.id)}
                          onKeyDown={(e) => {
                            if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                              e.preventDefault();
                              handleRowClick(row.id);
                            }
                          }}
                          tabIndex={0}
                          role="link"
                          aria-label={`Open shipment ${row.shipment_number}`}
                        >
                          {visibleShipmentColumns.map((c) => renderShipmentRowCell(c, row))}
                        </TableRow>
                        {n > 1 && expanded && (
                          <TableRow className={styles.expandRow} aria-labelledby={`shipment-${row.id}-po-trigger`}>
                            <TableCell colSpan={colSpanData} className={styles.expandCell} id={`shipment-${row.id}-po-panel`}>
                              {renderPoExpandPanel(linked)}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
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
