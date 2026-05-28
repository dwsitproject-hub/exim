"use client";

import {
  useCallback,
  useEffect,
  useState,
  useMemo,
  useRef,
  Fragment,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RotateCw, Plus, Check, Search, CalendarRange, ChevronRight, ChevronDown, Pencil, Eye } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  useTableColumnVisibility,
  type TableColumnDef,
} from "@/hooks/use-table-column-visibility";
import {
  listExportBulkingShipments,
  getExportBulkingFilterOptions,
  updateExportBulkingShipment,
  createExportBulkingShipment,
} from "@/services/export-bulking-service";
import {
  listShippers,
  listShipperLoadports,
  createShipperLoadport,
  type Shipper,
  type ShipperLoadport,
} from "@/services/shipper-service";
import { Modal } from "@/components/overlays";
import { ComboboxSelect } from "@/components/forms/ComboboxSelect/ComboboxSelect";
import { ComboboxSelectCreatable } from "@/components/forms/ComboboxSelect/ComboboxSelectCreatable";
import { LoadingSkeleton } from "@/components/feedback";
import { EmptyState } from "@/components/navigation";
import {
  TableColumnPicker,
  TableColumnFilterPicker,
} from "@/components/tables";
import { useToast } from "@/components/providers/ToastProvider";
import { ProcessChecklist } from "@/components/export-bulking/ProcessChecklist";
import { can } from "@/lib/permissions";
import {
  BACKLOG_FILTER_LABELS,
  getDefaultBulkingView,
  matchesBacklogFilter,
  parseBacklogFilter,
  parseListView,
  type ExportBulkingBacklogFilter,
  type ExportBulkingListView,
} from "@/lib/export-bulking-backlog";
import {
  BulkingExpandDocsPanel,
  fetchBulkingExpandDocs,
  type BulkingExpandDocsData,
} from "./ExportBulkingListExpandDocs";
import { isApiError } from "@/types/api";
import { equalsIgnoreCase, findMatchingOption } from "@/lib/string-match";
import type { ApiSuccess } from "@/types/api";
import type {
  ExportBulkingListItem,
  ExportBulkingFilterOptions,
  ListExportBulkingQuery,
} from "@/types/export-bulking";
import { formatExportBulkingStatus } from "@/types/export-bulking";
import styles from "./ExportBulkingList.module.css";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;
const BACKLOG_FETCH_LIMIT = 100;

const TABLE_COLUMNS_KEY = "eos.export.bulkingGrid.tableColumns.v9";

/* ────────── column metadata ────────── */

interface GridColumnDef extends TableColumnDef {
  dbField?: string;
  editable?: boolean;
  rbacGated?: boolean;
  width?: number;
  multiValue?: boolean;
}

const BASE_COLUMNS: GridColumnDef[] = [
  { id: "_expand", label: "", locked: true, width: 36 },
  { id: "shipment_no", label: "Shipment No.", locked: true, width: 128 },
  { id: "progress", label: "Progress", width: 88 },
  { id: "status", label: "Status", locked: true, width: 144 },
  { id: "vessel", label: "Vessel Name", locked: true, width: 168, editable: true, dbField: "vessel_name" },
  { id: "voyage", label: "Voyage No.", editable: true, dbField: "voyage_number", width: 112 },
  { id: "shipper", label: "Shipper", editable: true, dbField: "shipper", width: 152 },
  { id: "loadport", label: "Load Port", editable: true, dbField: "loadport_name", width: 140 },
  { id: "total_qty", label: "Total Qty", editable: true, dbField: "total_quantity", width: 112 },
  { id: "eta", label: "ETA", width: 96 },
  { id: "si_no", label: "SI No.", width: 120, multiValue: true, defaultVisible: false },
  { id: "invoice_no", label: "Invoice No.", width: 128, multiValue: true, defaultVisible: false },
  { id: "pl_no", label: "PL No.", width: 120, multiValue: true, defaultVisible: false },
  { id: "_actions", label: "", locked: true, width: 72 },
];

function renderMultiValueTags(values: string[] | null | undefined): ReactNode {
  const list = (values ?? []).filter(Boolean);
  if (list.length === 0) return <span className={styles.cellEmpty}>—</span>;
  return (
    <span className={styles.tagList}>
      {list.map((v) => (
        <span key={v} className={styles.tag}>{v}</span>
      ))}
    </span>
  );
}

function buildBulkingUrl(params: URLSearchParams): string {
  const str = params.toString();
  return `/export/bulking${str ? `?${str}` : ""}`;
}

const LIST_VIEW_OPTIONS: { id: ExportBulkingListView; label: string }[] = [
  { id: "all", label: "All" },
  { id: "operations", label: "Operations" },
  { id: "documentation", label: "Documentation" },
];

function mapSortFieldForApi(columnId: string | null): string | undefined {
  if (!columnId || columnId === "_expand") return undefined;
  const allowed: Record<string, string> = {
    shipment_no: "shipment_no",
    status: "current_status",
    vessel: "vessel_name",
    voyage: "voyage_number",
    shipper: "shipper",
    loadport: "loadport_name",
    total_qty: "total_quantity",
    eta: "eta",
  };
  return allowed[columnId];
}

function buildListQueryFromColumnFilters(
  columnFilters: Record<string, string[]>,
  statusLabelToRaw: Map<string, string>,
): Partial<ListExportBulkingQuery> {
  const q: Partial<ListExportBulkingQuery> = {};
  const statusLabels = columnFilters["status"] ?? [];
  if (statusLabels.length > 0) {
    const statuses = statusLabels
      .map((l) => statusLabelToRaw.get(l))
      .filter((x): x is string => Boolean(x));
    if (statuses.length) q.statuses = statuses;
  }
  return q;
}

function etaColorClass(eta: string | null | undefined): string {
  if (!eta) return "";
  const diffDays = (new Date(eta).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return styles.etaOverdue;
  if (diffDays <= 7) return styles.etaThisWeek;
  return styles.etaFuture;
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return "—";
  }
}

function statusPillClass(status: string | null | undefined): string {
  switch (status) {
    case "SHIPMENT_PLANNING": return styles.statusPlanning;
    case "NOMINATION": return styles.statusNomination;
    case "SI_RECEIVE": return styles.statusSiReceive;
    case "ARRIVAL": return styles.statusArrival;
    case "AT_BERTH": return styles.statusAtBerth;
    case "LOADING": return styles.statusLoading;
    case "NPE": return styles.statusNpe;
    case "CASE_OFF": return styles.statusCaseOff;
    default: return styles.statusPlanning;
  }
}

function shortStatusLabel(raw: string): string {
  switch (raw) {
    case "SHIPMENT_PLANNING": return "Planning";
    case "NOMINATION": return "Nomination";
    case "SI_RECEIVE": return "SI Recv";
    case "ARRIVAL": return "Arrival";
    case "AT_BERTH": return "At Berth";
    case "LOADING": return "Loading";
    case "NPE": return "Pre-ship";
    case "CASE_OFF": return "Case Off";
    default: return formatExportBulkingStatus(raw);
  }
}

function formatThousands(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.length > 1 ? `${parts[0]}.${parts[1]}` : parts[0];
}

function parseThousands(formatted: string): string {
  return formatted.replace(/,/g, "");
}

function formatIntegerThousandsFromNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "";
  return formatThousands(String(Math.round(Number(value))));
}

function getCellValue(row: ExportBulkingListItem, colId: string): string {
  switch (colId) {
    case "shipment_no": return row.shipment_no ?? "";
    case "vessel": return row.vessel_name ?? "";
    case "voyage": return row.voyage_number ?? "";
    case "shipper": return row.shipper ?? "";
    case "loadport": return row.loadport_name ?? "";
    case "total_qty": return row.total_quantity != null ? String(row.total_quantity) : "";
    default: return "";
  }
}

/* ────────────────────────────────────── */
/*             MAIN COMPONENT             */
/* ────────────────────────────────────── */

export function ExportBulkingList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchFromUrl = searchParams.get("search") ?? "";
  const viewFromUrl = parseListView(searchParams.get("view"));
  const backlogFromUrl = parseBacklogFilter(searchParams.get("backlog"));
  const statusesFromUrl = searchParams.getAll("statuses");

  const syncParamsToUrl = useCallback(
    (patch: { search?: string; view?: ExportBulkingListView | null; backlog?: ExportBulkingBacklogFilter | null }) => {
      const p = new URLSearchParams(searchParams.toString());
      if (patch.search !== undefined) {
        if (patch.search) p.set("search", patch.search);
        else p.delete("search");
      }
      if (patch.view !== undefined) {
        if (patch.view) p.set("view", patch.view);
        else p.delete("view");
      }
      if (patch.backlog !== undefined) {
        if (patch.backlog) p.set("backlog", patch.backlog);
        else p.delete("backlog");
      }
      router.replace(buildBulkingUrl(p), { scroll: false });
    },
    [router, searchParams],
  );

  const syncSearchToUrl = useCallback(
    (search: string) => syncParamsToUrl({ search }),
    [syncParamsToUrl],
  );

  const { accessToken, user } = useAuth();
  const { pushToast } = useToast();

  const listView = viewFromUrl ?? getDefaultBulkingView(user);
  const backlogFilter = backlogFromUrl;
  const backlogActive = backlogFilter != null;

  const canViewDocs = can(user, "VIEW_EXPORT_DOCUMENTATION");
  const canEditCargo = can(user, "UPDATE_EXPORT_BULKING");
  const canCreateShipment = can(user, "CREATE_EXPORT_BULKING");

  const columnStorageKey = `${TABLE_COLUMNS_KEY}.${listView}`;

  const allColumns = useMemo<GridColumnDef[]>(() => {
    const base = [...BASE_COLUMNS];
    if (listView === "operations") {
      return base.map((c) => {
        if (["si_no", "invoice_no", "pl_no"].includes(c.id)) return { ...c, defaultVisible: false };
        if (["vessel", "voyage", "shipper", "loadport", "total_qty", "eta", "progress"].includes(c.id)) {
          return { ...c, defaultVisible: true };
        }
        return c;
      });
    }
    if (listView === "documentation") {
      return base.map((c) => {
        if (["si_no", "invoice_no", "pl_no", "progress"].includes(c.id)) return { ...c, defaultVisible: true };
        if (["vessel", "voyage", "shipper", "loadport", "total_qty", "eta"].includes(c.id)) {
          return { ...c, defaultVisible: false };
        }
        return c;
      });
    }
    return base;
  }, [listView]);

  const {
    visibleById,
    toggleColumn,
    resetColumns,
    columns: columnDefs,
  } = useTableColumnVisibility(columnStorageKey, allColumns);

  const visibleColumns = useMemo(
    () => (columnDefs as GridColumnDef[]).filter((c) => visibleById[c.id] !== false),
    [columnDefs, visibleById],
  );

  /* ── data state ── */
  const [items, setItems] = useState<ExportBulkingListItem[]>([]);
  const [meta, setMeta] = useState<{ page: number; limit: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(DEFAULT_PAGE);
  const [searchInput, setSearchInput] = useState("");
  const [searchParam, setSearchParam] = useState("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [openFilterColumnId, setOpenFilterColumnId] = useState<string | null>(null);
  const [filterOptions, setFilterOptions] = useState<ExportBulkingFilterOptions | null>(null);
  const [sortBy, setSortBy] = useState<string | null>("eta");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const closeCreateModal = useCallback(() => setShowCreateModal(false), []);

  /* ── shipper data for inline edit comboboxes ── */
  const [shipperList, setShipperList] = useState<Shipper[]>([]);
  const shipperNameOptions = useMemo(() => shipperList.map((s) => s.name), [shipperList]);

  useEffect(() => {
    if (!accessToken) return;
    listShippers(accessToken).then((res) => {
      if (!isApiError(res)) setShipperList((res as ApiSuccess<Shipper[]>).data ?? []);
    });
  }, [accessToken]);

  /* ── inline editing state ── */
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingCells, setSavingCells] = useState<Record<string, boolean>>({});
  const [savedCells, setSavedCells] = useState<Record<string, boolean>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, Record<string, string>>>({});

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [rowExpandedData, setRowExpandedData] = useState<Record<string, BulkingExpandDocsData>>({});
  const [rowExpandLoading, setRowExpandLoading] = useState<Record<string, boolean>>({});
  const backlogAutoExpandDoneRef = useRef(false);

  const editInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const activeCellRef = useRef(activeCell);
  activeCellRef.current = activeCell;
  const editingCellRef = useRef(editingCell);
  editingCellRef.current = editingCell;
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncSearchToUrlRef = useRef(syncSearchToUrl);
  syncSearchToUrlRef.current = syncSearchToUrl;
  const inlineLpResolveRef = useRef<((ok: boolean) => void) | null>(null);
  const [inlinePendingLp, setInlinePendingLp] = useState<{ name: string; shipper: string } | null>(null);

  /* ── loadport options for inline edit (depends on selected shipper per row) ── */
  const [inlineLoadportOptions, setInlineLoadportOptions] = useState<string[]>([]);

  const statusLabelToRaw = useMemo(() => {
    const m = new Map<string, string>();
    for (const raw of filterOptions?.statuses ?? []) {
      m.set(formatExportBulkingStatus(raw), raw);
    }
    return m;
  }, [filterOptions]);

  const columnFilterOptions = useMemo(() => {
    if (!filterOptions) return {} as Record<string, string[]>;
    return {
      status: filterOptions.statuses.map((s) => formatExportBulkingStatus(s)),
    };
  }, [filterOptions]);

  const columnFiltersKey = JSON.stringify(columnFilters);

  /* ── fetch list ── */
  const fetchList = useCallback(() => {
    if (!accessToken) { setLoading(false); return; }
    setLoading(true);
    const fromCols = buildListQueryFromColumnFilters(columnFilters, statusLabelToRaw);
    const listQuery: ListExportBulkingQuery = {
      page: backlogActive ? 1 : page,
      limit: backlogActive ? BACKLOG_FETCH_LIMIT : DEFAULT_LIMIT,
      search: searchParam.trim() || undefined,
      ...fromCols,
    };
    const sortField = mapSortFieldForApi(sortBy);
    if (sortField) {
      listQuery.sort_by = sortField;
      listQuery.sort_dir = sortDir;
    }
    listExportBulkingShipments(listQuery, accessToken)
      .then((res) => {
        if (isApiError(res)) { setError(res.message); return; }
        const success = res as ApiSuccess<ExportBulkingListItem[]>;
        setItems(success.data ?? []);
        const m = success.meta as { page: number; limit: number; total: number } | undefined;
        if (m) setMeta(m);
      })
      .catch(() => setError("Failed to load export shipments"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, page, searchParam, columnFiltersKey, statusLabelToRaw, sortBy, sortDir, backlogActive]);

  const displayItems = useMemo(() => {
    if (!backlogFilter) return items;
    return items.filter((row) => matchesBacklogFilter(row, backlogFilter));
  }, [items, backlogFilter]);

  useEffect(() => { fetchList(); }, [fetchList]);

  useEffect(() => {
    backlogAutoExpandDoneRef.current = false;
  }, [backlogFilter, listView]);

  useEffect(() => {
    if (!backlogFilter || displayItems.length === 0 || backlogAutoExpandDoneRef.current) return;
    const firstId = displayItems[0].id;
    backlogAutoExpandDoneRef.current = true;
    setExpandedRows(new Set([firstId]));
    if (accessToken && !rowExpandedData[firstId] && !rowExpandLoading[firstId]) {
      setRowExpandLoading((prev) => ({ ...prev, [firstId]: true }));
      fetchBulkingExpandDocs(firstId, accessToken).then((data) => {
        setRowExpandedData((prev) => ({ ...prev, [firstId]: data }));
        setRowExpandLoading((prev) => ({ ...prev, [firstId]: false }));
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backlogFilter, displayItems, accessToken]);

  useEffect(() => {
    if (searchParams.get("create") === "1") {
      setShowCreateModal(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!accessToken) return;
    getExportBulkingFilterOptions(accessToken).then((res) => {
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
    if (statusesFromUrl.length === 0 || !filterOptions) return;
    const labels = statusesFromUrl
      .map((raw) => formatExportBulkingStatus(raw))
      .filter((label) => filterOptions.statuses.some((s) => formatExportBulkingStatus(s) === label));
    if (labels.length > 0) {
      setColumnFilters((prev) => ({ ...prev, status: labels }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusesFromUrl.join(","), filterOptions]);

  function handleListViewChange(nextView: ExportBulkingListView) {
    syncParamsToUrl({ view: nextView });
  }

  function clearBacklogFilter() {
    syncParamsToUrl({ backlog: null });
    setPage(1);
  }

  // Debounce user typing → searchParam (skip when URL sync already handled it)
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearchParam(searchInput);
      setPage(1);
      syncSearchToUrlRef.current(searchInput);
    }, 400);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  const totalPages = meta ? Math.ceil(meta.total / meta.limit) : 0;

  /* ── navigation & interaction handlers ── */

  function navigateToDetail(id: string, mode: "view" | "edit" = "edit") {
    const suffix = mode === "view" ? "?mode=view" : "";
    router.push(`/export/bulking/${id}${suffix}`);
  }

  async function loadRowExpandedData(rowId: string) {
    if (rowExpandedData[rowId] || rowExpandLoading[rowId] || !accessToken) return;
    setRowExpandLoading((prev) => ({ ...prev, [rowId]: true }));
    const data = await fetchBulkingExpandDocs(rowId, accessToken);
    setRowExpandedData((prev) => ({ ...prev, [rowId]: data }));
    setRowExpandLoading((prev) => ({ ...prev, [rowId]: false }));
  }

  async function refreshRowExpandedData(rowId: string) {
    if (!accessToken) return;
    const data = await fetchBulkingExpandDocs(rowId, accessToken);
    setRowExpandedData((prev) => ({ ...prev, [rowId]: data }));
    fetchList();
  }

  function toggleRowExpand(rowId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingCell(null);
    setActiveCell(null);
    const wasExpanded = expandedRows.has(rowId);
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (wasExpanded) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
    if (!wasExpanded) void loadRowExpandedData(rowId);
  }

  function toggleStatusPill(rawStatus: string) {
    const label = formatExportBulkingStatus(rawStatus);
    const current = columnFilters["status"] ?? [];
    const next = current.includes(label)
      ? current.filter((s) => s !== label)
      : [...current, label];
    setColumnFilter("status", next);
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

  function setColumnFilter(key: string, nextSelected: string[]) {
    setColumnFilters((prev) => ({ ...prev, [key]: nextSelected }));
    setPage(1);
  }

  /* ── inline editing ── */

  function startEditing(rowIdx: number, colIdx: number) {
    if (!canEditCargo) return;
    const col = visibleColumns[colIdx] as GridColumnDef;
    if (!col?.editable) return;
    const row = displayItems[rowIdx];
    if (!row) return;

    const val = getCellValue(row, col.id);
    setEditingCell({ row: rowIdx, col: colIdx });
    setEditValue(col.id === "total_qty" ? formatIntegerThousandsFromNumber(row.total_quantity) : val);

    if (col.id === "loadport") {
      const shipper = row.shipper;
      const match = shipperList.find((s) => s.name === shipper);
      if (match && accessToken) {
        listShipperLoadports(match.id, accessToken).then((res) => {
          if (!isApiError(res)) {
            setInlineLoadportOptions((res as ApiSuccess<ShipperLoadport[]>).data?.map((lp) => lp.name) ?? []);
          }
        });
      } else {
        setInlineLoadportOptions([]);
      }
    }
  }

  async function commitEdit() {
    const ec = editingCellRef.current;
    if (!ec || !accessToken) { setEditingCell(null); return; }
    const { row: rowIdx, col: colIdx } = ec;
    const col = visibleColumns[colIdx] as GridColumnDef;
    const row = displayItems[rowIdx];
    if (!col?.dbField || !row) { setEditingCell(null); return; }

    let valueToSave = editValue.trim();
    let patchPayload: Record<string, string | number | null> | null = null;

    if (col.id === "total_qty") {
      valueToSave = parseThousands(valueToSave);
      const num = Number.parseInt(valueToSave, 10);
      if (!valueToSave.trim() || Number.isNaN(num) || num < 0) {
        setValidationErrors((prev) => ({
          ...prev,
          [row.id]: { ...prev[row.id], [col.id]: "Invalid number" },
        }));
        setEditingCell(null);
        return;
      }
      const prevRounded =
        row.total_quantity != null ? Math.round(Number(row.total_quantity)) : null;
      if (prevRounded !== null && num === prevRounded) {
        setEditingCell(null);
        return;
      }
      patchPayload = { [col.dbField]: num };
    } else {
      const originalValue = getCellValue(row, col.id);
      if (col.id === "loadport") {
        valueToSave = findMatchingOption(inlineLoadportOptions, valueToSave) ?? valueToSave;
        if (equalsIgnoreCase(valueToSave, originalValue)) {
          setEditingCell(null);
          return;
        }
      } else if (valueToSave === originalValue.trim()) {
        setEditingCell(null);
        return;
      }
      patchPayload = { [col.dbField]: valueToSave || null };
    }

    setEditingCell(null);

    const cellKey = `${row.id}:${col.id}`;
    setSavingCells((prev) => ({ ...prev, [cellKey]: true }));

    setValidationErrors((prev) => {
      const rowErrs = { ...prev[row.id] };
      delete rowErrs[col.id];
      return { ...prev, [row.id]: rowErrs };
    });

    const res = await updateExportBulkingShipment(row.id, patchPayload, accessToken);
    setSavingCells((prev) => ({ ...prev, [cellKey]: false }));

    if (isApiError(res)) {
      pushToast(res.message, "error");
    } else {
      setSavedCells((prev) => ({ ...prev, [cellKey]: true }));
      setTimeout(() => setSavedCells((prev) => ({ ...prev, [cellKey]: false })), 1500);
      fetchList();
    }
  }

  /* ── keyboard navigation ── */

  function handleGridKeyDown(e: React.KeyboardEvent) {
    const ac = activeCellRef.current;
    const ec = editingCellRef.current;

    if (ec) {
      if (e.key === "Enter") {
        e.preventDefault();
        commitEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setEditingCell(null);
      } else if (e.key === "Tab") {
        e.preventDefault();
        commitEdit();
        moveToNextEditable(ec.row, ec.col, e.shiftKey ? -1 : 1);
      }
      return;
    }

    if (!ac) return;

    const rowCount = displayItems.length;
    const colCount = visibleColumns.length;

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        if (ac.row > 0) setActiveCell({ row: ac.row - 1, col: ac.col });
        break;
      case "ArrowDown":
        e.preventDefault();
        if (ac.row < rowCount - 1) setActiveCell({ row: ac.row + 1, col: ac.col });
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (ac.col > 0) setActiveCell({ row: ac.row, col: ac.col - 1 });
        break;
      case "ArrowRight":
        e.preventDefault();
        if (ac.col < colCount - 1) setActiveCell({ row: ac.row, col: ac.col + 1 });
        break;
      case "Tab":
        e.preventDefault();
        moveToNextEditable(ac.row, ac.col, e.shiftKey ? -1 : 1);
        break;
      case "Enter":
        e.preventDefault();
        startEditing(ac.row, ac.col);
        break;
      case "Home":
        e.preventDefault();
        setActiveCell({ row: ac.row, col: 0 });
        break;
      case "End":
        e.preventDefault();
        setActiveCell({ row: ac.row, col: colCount - 1 });
        break;
      default:
        break;
    }
  }

  function moveToNextEditable(fromRow: number, fromCol: number, direction: 1 | -1) {
    const colCount = visibleColumns.length;
    const rowCount = displayItems.length;
    let r = fromRow;
    let c = fromCol + direction;

    for (let attempts = 0; attempts < colCount * rowCount; attempts++) {
      if (c >= colCount) { c = 0; r++; }
      if (c < 0) { c = colCount - 1; r--; }
      if (r >= rowCount || r < 0) break;

      const col = visibleColumns[c] as GridColumnDef;
      if (col?.editable) {
        setActiveCell({ row: r, col: c });
        return;
      }
      c += direction;
    }
  }

  /* ── create shipment ── */

  async function handleCreateSubmit(payload: Record<string, unknown>) {
    if (!accessToken || creating) return;
    setCreating(true);
    try {
      const res = await createExportBulkingShipment(payload, accessToken);
      if (isApiError(res)) { setError(res.message); return; }
      const created = (res as ApiSuccess<ExportBulkingListItem>).data;
      setShowCreateModal(false);
      if (created?.id) router.push(`/export/bulking/${created.id}`);
    } catch {
      setError("Failed to create shipment");
    } finally {
      setCreating(false);
    }
  }

  /* ── cell click handlers ── */

  function handleCellClick(rowIdx: number, colIdx: number, e: React.MouseEvent) {
    e.stopPropagation();
    const col = visibleColumns[colIdx] as GridColumnDef;
    if (col?.id === "_expand" || col?.id === "_actions") return;
    if (col?.id === "shipment_no" || col?.id === "progress") {
      const row = displayItems[rowIdx];
      if (row) navigateToDetail(row.id, canEditCargo ? "edit" : "view");
      return;
    }

    if (col?.editable && canEditCargo) {
      // If already editing this exact cell, do nothing — don't steal focus from combobox
      if (editingCell?.row === rowIdx && editingCell?.col === colIdx) return;
      // Single-click starts editing immediately
      startEditing(rowIdx, colIdx);
    } else {
      const row = displayItems[rowIdx];
      if (row) navigateToDetail(row.id, "view");
    }
  }

  /* ── render helpers ── */

  function renderEditingCell(row: ExportBulkingListItem, col: GridColumnDef) {
    if (col.id === "shipper") {
      return (
        <ComboboxSelect
          options={shipperNameOptions}
          value={editValue}
          onChange={(v) => { setEditValue(v); }}
          placeholder="Select shipper…"
          aria-label="Shipper"
        />
      );
    }

    if (col.id === "loadport") {
      const handleCreateLoadport = (name: string): boolean => {
        const shipper = row.shipper ?? "";
        const match = shipperList.find((s) => s.name === shipper);
        if (!match || !accessToken) return false;
        const canonical = findMatchingOption(inlineLoadportOptions, name);
        if (canonical) {
          setEditValue(canonical);
          return true;
        }
        inlineLpResolveRef.current = async (ok: boolean) => {
          if (ok) {
            const res = await createShipperLoadport(match.id, { name }, accessToken);
            if (!isApiError(res)) {
              const created = (res as ApiSuccess<ShipperLoadport>).data;
              const canonicalName = created?.name ?? findMatchingOption(inlineLoadportOptions, name) ?? name;
              setEditValue(canonicalName);
              const refreshRes = await listShipperLoadports(match.id, accessToken);
              if (!isApiError(refreshRes)) {
                setInlineLoadportOptions((refreshRes as ApiSuccess<ShipperLoadport[]>).data?.map((lp) => lp.name) ?? []);
              }
            }
          }
          setInlinePendingLp(null);
          inlineLpResolveRef.current = null;
        };
        setInlinePendingLp({ name, shipper });
        return false;
      };

      return (
        <ComboboxSelectCreatable
          options={inlineLoadportOptions}
          value={inlinePendingLp?.name ?? editValue}
          onChange={(v) => {
            const canonical = findMatchingOption(inlineLoadportOptions, v) ?? v;
            setEditValue(canonical);
          }}
          onCreateOption={handleCreateLoadport}
          placeholder="Select load port…"
          externallyManaged={!!inlinePendingLp}
          aria-label="Load port"
        />
      );
    }

    return (
      <input
        ref={editInputRef}
        type="text"
        className={styles.inlineEditInput}
        value={editValue}
        onChange={(e) => {
          if (col.id === "total_qty") {
            const raw = e.target.value.replace(/[^0-9]/g, "");
            setEditValue(formatThousands(raw));
          } else {
            setEditValue(e.target.value);
          }
        }}
        onBlur={() => commitEdit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
          else if (e.key === "Escape") { e.preventDefault(); setEditingCell(null); }
          else if (e.key === "Tab") { e.preventDefault(); commitEdit(); moveToNextEditable(editingCellRef.current?.row ?? 0, editingCellRef.current?.col ?? 0, e.shiftKey ? -1 : 1); }
        }}
      />
    );
  }

  function cellClassName(rowIdx: number, colIdx: number, col: GridColumnDef, row: ExportBulkingListItem): string {
    const parts: string[] = [];
    if (col.id === "_expand") parts.push(styles.expandCol);
    if (col.id === "_actions") parts.push(styles.actionsCol);
    if (col.editable && canEditCargo) parts.push(styles.editableCell);
    if (activeCell?.row === rowIdx && activeCell?.col === colIdx && !editingCell) parts.push(styles.cellActive);

    const cellKey = `${row.id}:${col.id}`;
    if (savingCells[cellKey]) parts.push(styles.cellSaving);
    if (validationErrors[row.id]?.[col.id]) parts.push(styles.cellInvalid);

    return parts.join(" ");
  }

  function renderCellContent(row: ExportBulkingListItem, col: GridColumnDef, rowIdx: number, colIdx: number) {
    const isEditing = editingCell?.row === rowIdx && editingCell?.col === colIdx;
    const cellKey = `${row.id}:${col.id}`;

    if (isEditing && col.editable) {
      return renderEditingCell(row, col);
    }

    switch (col.id) {
      case "_expand":
        return (
          <button
            type="button"
            className={styles.expandToggleBtn}
            onClick={(e) => toggleRowExpand(row.id, e)}
            aria-label={expandedRows.has(row.id) ? "Collapse documents" : "Expand documents"}
          >
            {expandedRows.has(row.id)
              ? <ChevronDown size={14} strokeWidth={2} />
              : <ChevronRight size={14} strokeWidth={2} />}
          </button>
        );
      case "shipment_no":
        return (
          <Link
            href={canEditCargo ? `/export/bulking/${row.id}` : `/export/bulking/${row.id}?mode=view`}
            className={`${styles.shipmentNoCell} ${styles.cellLink}`}
            onClick={(e) => e.stopPropagation()}
          >
            {row.shipment_no || "—"}
          </Link>
        );
      case "progress":
        return (
          <ProcessChecklist
            compact
            input={{
              current_status: row.current_status,
              vessel_name: row.vessel_name,
              voyage_number: row.voyage_number,
              shipper: row.shipper,
              loadport_name: row.loadport_name,
              total_quantity: row.total_quantity,
              received_nomination: row.received_nomination,
              eta: row.eta,
              td: row.td,
              cargo_count: row.cargo_count,
              si_numbers: row.si_numbers,
              invoice_numbers: row.invoice_numbers,
              pl_numbers: row.pl_numbers,
            }}
          />
        );
      case "status":
        return (
          <span className={`${styles.statusPill} ${statusPillClass(row.current_status)}`}>
            {formatExportBulkingStatus(row.current_status)}
          </span>
        );
      case "eta": {
        const displayDate = row.ata ?? row.eta;
        const cls = etaColorClass(displayDate);
        return (
          <span className={cls ? `${styles.etaCell} ${cls}` : styles.etaCell} title={row.ata ? "ATA (actual)" : row.eta ? "ETA (estimated)" : undefined}>
            {formatShortDate(displayDate)}
          </span>
        );
      }
      case "vessel":
      case "voyage":
      case "shipper":
      case "loadport": {
        const val = getCellValue(row, col.id);
        return (
          <span className={styles.editableCellContent}>
            <span>{val || <span className={styles.cellEmpty}>—</span>}</span>
            {savedCells[cellKey] && <Check size={12} className={styles.savedIcon} />}
          </span>
        );
      }
      case "total_qty": {
        const val = row.total_quantity;
        return (
          <span className={styles.editableCellContent}>
            <span>{val != null ? formatIntegerThousandsFromNumber(val) : <span className={styles.cellEmpty}>—</span>}</span>
            {savedCells[cellKey] && <Check size={12} className={styles.savedIcon} />}
          </span>
        );
      }
      case "si_no":
        return renderMultiValueTags(row.si_numbers);
      case "invoice_no":
        return renderMultiValueTags(row.invoice_numbers);
      case "pl_no":
        return renderMultiValueTags(row.pl_numbers);
      case "_actions":
        return (
          <div className={styles.rowActions}>
            <button
              type="button"
              className={styles.rowActionBtn}
              title="View shipment"
              aria-label={`View ${row.shipment_no || "shipment"}`}
              onClick={(e) => {
                e.stopPropagation();
                navigateToDetail(row.id, "view");
              }}
            >
              <Eye size={15} strokeWidth={2} aria-hidden />
            </button>
            {canEditCargo && (
              <button
                type="button"
                className={styles.rowActionBtn}
                title="Edit shipment"
                aria-label={`Edit ${row.shipment_no || "shipment"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  navigateToDetail(row.id, "edit");
                }}
              >
                <Pencil size={14} strokeWidth={2} aria-hidden />
              </button>
            )}
          </div>
        );
      default:
        return <span className={styles.cellEmpty}>—</span>;
    }
  }

  function renderExpandedPanel(row: ExportBulkingListItem) {
    return (
      <tr className={styles.expandedPanelRow}>
        <td colSpan={visibleColumns.length} className={styles.expandedPanelCell}>
          <BulkingExpandDocsPanel
            row={row}
            accessToken={accessToken ?? ""}
            data={rowExpandedData[row.id] ?? null}
            loading={!!rowExpandLoading[row.id]}
            canViewDocs={canViewDocs}
            canEditCargo={canEditCargo}
            listView={listView}
            onRefresh={() => refreshRowExpandedData(row.id)}
          />
        </td>
      </tr>
    );
  }

  /* ── RENDER ── */

  if (loading && items.length === 0) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.toolbarRow}>
          <div className={styles.toolbarLeft}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>Bulking</span>
          </div>
        </div>
        <div style={{ padding: 24 }}>
          <LoadingSkeleton lines={8} />
        </div>
      </div>
    );
  }

  const hasActiveFilters = Object.values(columnFilters).some((v) => Array.isArray(v) && v.length > 0);

  return (
    <div className={styles.pageContainer}>
      {/* ── Toolbar ── */}
      <div className={styles.toolbarRow}>
        <div className={styles.toolbarLeft}>
          <Link href="/export/dashboard" style={{ color: "var(--color-primitive-text-steel)", textDecoration: "none", fontSize: 13 }}>
            ← Export
          </Link>
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" }}>Bulking</span>

          <div className={styles.searchBox}>
            <Search size={14} className={styles.searchIcon} aria-hidden />
            <input
              type="search"
              placeholder="Search shipment, vessel, shipper…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className={styles.searchInput}
              aria-label="Search export shipments"
            />
          </div>

          {/* Status filter pills (inline, with counts) */}
          <div className={styles.pillGroup}>
            {filterOptions?.statuses.map((rawStatus) => {
              const label = formatExportBulkingStatus(rawStatus);
              const isActive = (columnFilters["status"] ?? []).includes(label);
              const count = filterOptions.status_counts?.[rawStatus];
              return (
                <button
                  key={rawStatus}
                  type="button"
                  className={`${styles.statusPillBtn} ${statusPillClass(rawStatus)} ${isActive ? styles.statusPillBtnActive : ""}`}
                  onClick={() => toggleStatusPill(rawStatus)}
                  title={label}
                >
                  {shortStatusLabel(rawStatus)}
                  {count != null && <span className={styles.pillCount}>{count}</span>}
                </button>
              );
            })}
            {hasActiveFilters && (
              <button
                type="button"
                className={styles.filterClearInline}
                onClick={() => { setColumnFilters({}); setPage(1); }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className={styles.toolbarRight}>
          <button type="button" className={styles.dateRangeBtn} title="Filter by date range (coming soon)" disabled>
            <CalendarRange size={14} aria-hidden />
            Date range
          </button>
          <div className={styles.colToggleWrap}>
            <TableColumnPicker
              label="Columns"
              columns={allColumns}
              visibleById={visibleById}
              onToggle={toggleColumn}
              onReset={resetColumns}
            />
          </div>
          <button
            type="button"
            className={styles.refreshIconBtn}
            onClick={() => fetchList()}
            disabled={loading}
            aria-label="Refresh list"
            title="Refresh"
          >
            <RotateCw size={16} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            className={styles.createBtn}
            onClick={() => setShowCreateModal(true)}
            disabled={creating || !canCreateShipment}
            title={!canCreateShipment ? "You do not have permission to create shipments" : undefined}
          >
            <Plus size={16} strokeWidth={2} aria-hidden style={{ marginRight: 4 }} />
            New shipment
          </button>
        </div>
      </div>

      <div className={styles.viewTabsRow}>
        <div className={styles.viewTabs} role="tablist" aria-label="Bulking list view">
          {LIST_VIEW_OPTIONS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={listView === id}
              className={`${styles.viewTab} ${listView === id ? styles.viewTabActive : ""}`}
              onClick={() => handleListViewChange(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {backlogFilter && (
          <button type="button" className={styles.backlogChip} onClick={clearBacklogFilter}>
            Filter: {BACKLOG_FILTER_LABELS[backlogFilter]}
            <span aria-hidden> ×</span>
          </button>
        )}
      </div>

      {backlogFilter && (
        <p className={styles.backlogBanner}>
          Showing {displayItems.length} shipment{displayItems.length === 1 ? "" : "s"} matching{" "}
          <strong>{BACKLOG_FILTER_LABELS[backlogFilter]}</strong>
          {backlogActive ? " (from up to 100 most recent by sort)" : ""}
        </p>
      )}

      {/* Inline load port creation confirm (replaces window.confirm) */}
      {inlinePendingLp && (
        <div className={styles.inlineLpConfirm}>
          <span>Add <strong>&ldquo;{inlinePendingLp.name}&rdquo;</strong> as a new load port for <strong>{inlinePendingLp.shipper}</strong>?</span>
          <div className={styles.inlineLpActions}>
            <button type="button" className={styles.btnConfirmSm} onClick={() => inlineLpResolveRef.current?.(true)}>Add port</button>
            <button type="button" className={styles.btnCancelSm} onClick={() => inlineLpResolveRef.current?.(false)}>Cancel</button>
          </div>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {/* ── Grid body ── */}
      {displayItems.length === 0 && !loading ? (
        <div className={styles.emptyWrapper}>
          <EmptyState
            title="No export shipments yet"
            description={
              backlogFilter
                ? `No shipments match "${BACKLOG_FILTER_LABELS[backlogFilter]}". Try clearing the filter.`
                : searchParam.trim() || Object.keys(columnFilters).some((k) => columnFilters[k]?.length)
                ? "Try adjusting search or column filters."
                : 'Click "New shipment" to create your first export bulking shipment.'
            }
          />
        </div>
      ) : (
        <div
          ref={gridRef}
          className={styles.gridWrapper}
          tabIndex={0}
          onKeyDown={handleGridKeyDown}
        >
          <table className={styles.grid}>
            <colgroup>
              {visibleColumns.map((c) => {
                const col = c as GridColumnDef;
                return <col key={col.id} style={{ width: col.width }} />;
              })}
            </colgroup>
            <thead>
              <tr>
                {visibleColumns.map((c) => {
                  const col = c as GridColumnDef;
                  const selected = columnFilters[col.id] ?? [];
                  const opts = columnFilterOptions[col.id] ?? [];

                  return (
                    <th
                      key={col.id}
                      className={col.id === "_expand" ? styles.expandCol : undefined}
                      style={
                        col.width
                          ? { width: col.width, minWidth: col.width, boxSizing: "border-box" }
                          : undefined
                      }
                      aria-sort={
                        sortBy === col.id
                          ? sortDir === "asc" ? "ascending" : "descending"
                          : undefined
                      }
                    >
                      {col.id === "_expand" || col.id === "_actions" ? (
                        <span className={styles.headerExpandSpacer} aria-hidden />
                      ) : (
                      <div className={styles.headerCellInner}>
                        <button
                          type="button"
                          className={styles.sortHeadBtn}
                          onClick={() => handleColumnSort(col.id)}
                        >
                          <span>{col.label}</span>
                          {sortBy === col.id && (
                            <span className={styles.sortIndicator} aria-hidden>
                              {sortDir === "asc" ? "↑" : "↓"}
                            </span>
                          )}
                        </button>
                        {opts.length > 0 && (
                          <TableColumnFilterPicker
                            columnLabel={col.label}
                            options={opts}
                            selected={selected}
                            onChange={(next) => setColumnFilter(col.id, next)}
                            open={openFilterColumnId === col.id}
                            onOpenChange={(open) => setOpenFilterColumnId(open ? col.id : null)}
                            revealIconOnHover
                          />
                        )}
                      </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {displayItems.map((row, rowIdx) => (
                <Fragment key={row.id}>
                  <tr className={`${styles.gridRow} ${expandedRows.has(row.id) ? styles.gridRowExpanded : ""}`}>
                    {visibleColumns.map((c, colIdx) => {
                      const col = c as GridColumnDef;
                      return (
                        <td
                          key={col.id}
                          className={cellClassName(rowIdx, colIdx, col, row)}
                          onClick={(e) => handleCellClick(rowIdx, colIdx, e)}
                          style={
                            col.width
                              ? { width: col.width, minWidth: col.width, boxSizing: "border-box" }
                              : undefined
                          }
                        >
                          {renderCellContent(row, col, rowIdx, colIdx)}
                        </td>
                      );
                    })}
                  </tr>
                  {expandedRows.has(row.id) ? renderExpandedPanel(row) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination footer ── */}
      {!backlogActive && totalPages > 0 && (
        <div className={styles.paginationBar}>
          <button
            type="button"
            className={styles.pageBtn}
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Previous
          </button>
          <span className={styles.pageInfo}>
            Page {page} of {totalPages}
            {meta && <span className={styles.pageInfoTotal}> · {meta.total} shipments</span>}
          </span>
          <button
            type="button"
            className={styles.pageBtn}
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}

      <CreateShipmentModal
        open={showCreateModal}
        saving={creating}
        onClose={closeCreateModal}
        onSubmit={handleCreateSubmit}
      />
    </div>
  );
}

/* ────────── Create Shipment Modal ────────── */

function CreateShipmentModal({
  open,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const { accessToken } = useAuth();
  const [vesselName, setVesselName] = useState("");
  const [voyageNumber, setVoyageNumber] = useState("");

  const [shipperList, setShipperList] = useState<Shipper[]>([]);
  const [shipperName, setShipperName] = useState("");
  const [selectedShipperId, setSelectedShipperId] = useState<string | null>(null);

  const [loadportOptions, setLoadportOptions] = useState<string[]>([]);
  const [loadport, setLoadport] = useState("");

  const [totalQuantityDisplay, setTotalQuantityDisplay] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pendingLoadportName, setPendingLoadportName] = useState<string | null>(null);

  const shipperNameOptions = useMemo(() => shipperList.map((s) => s.name), [shipperList]);

  useEffect(() => {
    if (!accessToken) return;
    listShippers(accessToken).then((res) => {
      if (!isApiError(res)) {
        setShipperList((res as ApiSuccess<Shipper[]>).data ?? []);
      }
    });
  }, [accessToken]);

  useEffect(() => {
    if (!selectedShipperId || !accessToken) {
      setLoadportOptions([]);
      return;
    }
    listShipperLoadports(selectedShipperId, accessToken).then((res) => {
      if (!isApiError(res)) {
        setLoadportOptions((res as ApiSuccess<ShipperLoadport[]>).data?.map((lp) => lp.name) ?? []);
      }
    });
  }, [selectedShipperId, accessToken]);

  function handleShipperChange(name: string) {
    setShipperName(name);
    const match = shipperList.find((s) => s.name === name);
    setSelectedShipperId(match?.id ?? null);
    setLoadport("");
    setLoadportOptions([]);
  }

  const handleCreateLoadport = useCallback(
    (name: string): boolean => {
      if (!selectedShipperId || !accessToken) return false;
      const canonical = findMatchingOption(loadportOptions, name);
      if (canonical) {
        setLoadport(canonical);
        return true;
      }
      setPendingLoadportName(name);
      return false;
    },
    [selectedShipperId, accessToken, loadportOptions],
  );

  const confirmCreateLoadport = useCallback(async () => {
    if (!pendingLoadportName || !selectedShipperId || !accessToken) return;
    const res = await createShipperLoadport(selectedShipperId, { name: pendingLoadportName }, accessToken);
    const ok = !isApiError(res);
    if (ok) {
      const created = (res as ApiSuccess<ShipperLoadport>).data;
      const canonicalName = created?.name ?? findMatchingOption(loadportOptions, pendingLoadportName) ?? pendingLoadportName;
      const refreshRes = await listShipperLoadports(selectedShipperId, accessToken);
      if (!isApiError(refreshRes)) {
        setLoadportOptions((refreshRes as ApiSuccess<ShipperLoadport[]>).data?.map((lp) => lp.name) ?? []);
      }
      setLoadport(canonicalName);
    }
    setPendingLoadportName(null);
  }, [pendingLoadportName, selectedShipperId, accessToken, loadportOptions]);

  const cancelCreateLoadport = useCallback(() => {
    setPendingLoadportName(null);
    setLoadport(""); // reset field — user cancelled creation
  }, []);

  const handleClose = useCallback(() => {
    setVesselName("");
    setVoyageNumber("");
    setShipperName("");
    setSelectedShipperId(null);
    setLoadport("");
    setLoadportOptions([]);
    setTotalQuantityDisplay("");
    setFieldErrors({});
    setPendingLoadportName(null);
    onClose();
  }, [onClose]);

  function handleQuantityChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9]/g, "");
    setTotalQuantityDisplay(formatThousands(raw));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!vesselName.trim()) errs.vessel_name = "Vessel name is required";
    if (!voyageNumber.trim()) errs.voyage_number = "Voyage number is required";
    if (!shipperName.trim()) errs.shipper = "Shipper is required";
    if (!loadport.trim()) errs.loadport_name = "Load port is required";
    const rawQty = parseThousands(totalQuantityDisplay);
    const qty = Number.parseInt(rawQty, 10);
    if (!rawQty.trim() || Number.isNaN(qty) || qty <= 0) errs.total_quantity = "Must be greater than 0";

    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    onSubmit({
      vessel_name: vesselName.trim(),
      voyage_number: voyageNumber.trim(),
      shipper: shipperName.trim(),
      loadport_name: findMatchingOption(loadportOptions, loadport.trim()) ?? loadport.trim(),
      total_quantity: qty,
    });
  }

  return (
    <Modal
      open={open}
      title="New Export Shipment"
      onClose={handleClose}
      footer={
        <>
          <button type="button" className={styles.modalCancelBtn} onClick={handleClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="create-shipment-form" className={styles.createBtn} disabled={saving}>
            {saving ? "Creating…" : "Create & Open →"}
          </button>
        </>
      }
    >
      <form id="create-shipment-form" onSubmit={handleSubmit} className={styles.createForm}>

        <div className={styles.formField}>
          <label className={`${styles.formLabel} ${styles.formLabelRequired}`}>Vessel name</label>
          <input
            className={`${styles.formInput}${fieldErrors.vessel_name ? ` ${styles.formInputError}` : ""}`}
            value={vesselName}
            onChange={(e) => { setVesselName(e.target.value); if (fieldErrors.vessel_name) setFieldErrors((p) => { const n = { ...p }; delete n.vessel_name; return n; }); }}
            placeholder="e.g. MV Kartini"
          />
          {fieldErrors.vessel_name && <span className={styles.fieldError}>{fieldErrors.vessel_name}</span>}
        </div>

        <div className={styles.formField}>
          <label className={`${styles.formLabel} ${styles.formLabelRequired}`}>Voyage number</label>
          <input
            className={`${styles.formInput}${fieldErrors.voyage_number ? ` ${styles.formInputError}` : ""}`}
            value={voyageNumber}
            onChange={(e) => { setVoyageNumber(e.target.value); if (fieldErrors.voyage_number) setFieldErrors((p) => { const n = { ...p }; delete n.voyage_number; return n; }); }}
            placeholder="e.g. V.001"
          />
          {fieldErrors.voyage_number && <span className={styles.fieldError}>{fieldErrors.voyage_number}</span>}
        </div>

        <div className={styles.formField}>
          <label className={`${styles.formLabel} ${styles.formLabelRequired}`}>Shipper</label>
          <ComboboxSelect
            options={shipperNameOptions}
            value={shipperName}
            onChange={(v) => { handleShipperChange(v); if (fieldErrors.shipper) setFieldErrors((p) => { const n = { ...p }; delete n.shipper; return n; }); }}
            placeholder="Select shipper…"
            aria-label="Shipper"
          />
          {fieldErrors.shipper && <span className={styles.fieldError}>{fieldErrors.shipper}</span>}
        </div>

        <div className={styles.formField}>
          <label className={`${styles.formLabel} ${styles.formLabelRequired}`}>Load port</label>
          <ComboboxSelectCreatable
            options={loadportOptions}
            value={pendingLoadportName ?? loadport}
            onChange={(v) => {
              const canonical = findMatchingOption(loadportOptions, v) ?? v;
              setLoadport(canonical);
              if (fieldErrors.loadport_name) setFieldErrors((p) => { const n = { ...p }; delete n.loadport_name; return n; });
            }}
            onCreateOption={handleCreateLoadport}
            placeholder={selectedShipperId ? "Select or type to create…" : "Select a shipper first…"}
            disabled={!selectedShipperId}
            externallyManaged={!!pendingLoadportName}
            aria-label="Load port"
          />
          {!selectedShipperId && (
            <span className={styles.formHint}>Select a shipper above to enable this field.</span>
          )}
          {selectedShipperId && !loadport && !fieldErrors.loadport_name && (
            <span className={styles.formHint}>Type a new name to create a port for this shipper.</span>
          )}
          {fieldErrors.loadport_name && <span className={styles.fieldError}>{fieldErrors.loadport_name}</span>}
          {pendingLoadportName && (
            <div className={styles.loadportConfirm}>
              <span>Add <strong>&ldquo;{pendingLoadportName}&rdquo;</strong> as a new port for <strong>{shipperName}</strong>?</span>
              <div className={styles.loadportConfirmActions}>
                <button type="button" className={styles.btnConfirmSm} onClick={confirmCreateLoadport}>Add port</button>
                <button type="button" className={styles.btnCancelSm} onClick={cancelCreateLoadport}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        <div className={styles.formField}>
          <label className={`${styles.formLabel} ${styles.formLabelRequired}`}>Total quantity (MT)</label>
          <input
            className={`${styles.formInput} ${styles.quantityInput}${fieldErrors.total_quantity ? ` ${styles.formInputError}` : ""}`}
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={totalQuantityDisplay}
            onChange={(e) => { handleQuantityChange(e); if (fieldErrors.total_quantity) setFieldErrors((p) => { const n = { ...p }; delete n.total_quantity; return n; }); }}
          />
          {fieldErrors.total_quantity
            ? <span className={styles.fieldError}>{fieldErrors.total_quantity}</span>
            : <span className={styles.formHint}>Enter metric tonnes. Use numbers only.</span>
          }
        </div>
      </form>
    </Modal>
  );
}
