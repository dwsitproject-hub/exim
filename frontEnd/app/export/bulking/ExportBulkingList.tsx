"use client";

import { useCallback,
  useEffect,
  useState,
  useMemo,
  useRef,
  Fragment,
  type FormEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RotateCw, Plus, Check, Search, CalendarRange, ChevronRight, ChevronDown, Pencil, Eye, X } from "lucide-react";
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
  listExportBulkingDocumentationAssignees,
  assignExportBulkingDocumentation,
  type ExportBulkingDocumentationAssignee,
} from "@/services/export-bulking-service";
import {
  listShippers,
  listShipperLoadports,
  createShipperLoadport,
  findShipperMatch,
  shipperShortNameOptions,
  type Shipper,
  type ShipperLoadport,
} from "@/services/shipper-service";
import {
  listCommodities,
  resolveCommodityShortName,
  findCommodityMatch,
  type Commodity,
} from "@/services/commodity-service";
import { Modal } from "@/components/overlays";
import { ComboboxSelect } from "@/components/forms/ComboboxSelect/ComboboxSelect";
import { ComboboxSelectById } from "@/components/forms/ComboboxSelect/ComboboxSelectById";
import { ComboboxSelectCreatable } from "@/components/forms/ComboboxSelect/ComboboxSelectCreatable";
import { LoadingSkeleton } from "@/components/feedback";
import { EmptyState } from "@/components/navigation";
import { StatusBadge, StatusFilterPill } from "@/components/badges/StatusBadge";
import {
  TableColumnPicker,
  TableColumnFilterPicker,
  TablePagination,
} from "@/components/tables";
import { useToast } from "@/components/providers/ToastProvider";
import { ProcessChecklist } from "@/components/export-bulking/ProcessChecklist";
import { useRegisterGuideTourHooks, useGuideTour } from "@/components/guide-tour";
import { isFirstTimeUser } from "@/lib/first-time-user-storage";
import { can } from "@/lib/permissions";
import {
  BACKLOG_FILTER_LABELS,
  ASSIGNMENT_FILTER_LABELS,
  getDefaultAssignmentFilter,
  getDefaultBulkingView,
  matchesBacklogFilter,
  parseAssignmentFilter,
  parseBacklogFilter,
  parseListView,
  type ExportBulkingAssignmentFilter,
  type ExportBulkingBacklogFilter,
  type ExportBulkingListView,
} from "@/lib/export-bulking-backlog";
import {
  DOCUMENTATION_COLUMN_LABELS,
  DOCUMENTATION_LIST_COLUMN_IDS,
  EXPORT_DOC_COLUMN_IDS,
  OPERATIONS_LIST_COLUMN_IDS,
  buildBulkingDetailUrl,
  canEditExportBulking,
  canEditExportCargo,
  canEditExportDocumentation,
  canEditExportOperations,
  expandRowAriaLabel,
  getAvailableBulkingListViews,
  isDocumentationBacklogFilter,
  isExportBulkingDocumentationOfficer,
  resolveBulkingListView,
} from "@/lib/export-workspace";
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
import { getExportBulkingShortLabel } from "@/lib/entity-status";
import styles from "./ExportBulkingList.module.css";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;
const BACKLOG_FETCH_LIMIT = 100;

const TABLE_COLUMNS_KEY = "eos.export.bulkingGrid.tableColumns.v16";

/* ────────── column metadata ────────── */

interface GridColumnDef extends TableColumnDef {
  dbField?: string;
  editable?: boolean;
  rbacGated?: boolean;
  width?: number;
  minWidth?: number;
  multiValue?: boolean;
}

/** Columns that show long formatted document numbers — need flexible width. */
const DOC_NUMBER_COLUMN_IDS = new Set([
  "si_no",
  "invoice_no",
  "pl_no",
  "peb_no",
  "bl_no",
]);

const BASE_COLUMNS: GridColumnDef[] = [
  { id: "_expand", label: "", locked: true, width: 36, minWidth: 36 },
  { id: "shipment_no", label: "Shipment No.", locked: true, width: 148, minWidth: 132 },
  { id: "vessel", label: "Vessel Name", locked: true, width: 168, minWidth: 120, editable: true, dbField: "vessel_name" },
  { id: "voyage", label: "Voyage No.", editable: true, dbField: "voyage_number", width: 112, minWidth: 88 },
  { id: "loadport", label: "Load Port", editable: true, dbField: "loadport_name", width: 140, minWidth: 100 },
  { id: "progress", label: "Progress", width: 88, minWidth: 72 },
  { id: "status", label: "Status", locked: true, width: 144, minWidth: 120 },
  { id: "cargo_name", label: "Commodity", width: 148, minWidth: 120, multiValue: true, defaultVisible: false, rbacGated: true },
  { id: "total_qty", label: "Total Qty", width: 112, minWidth: 88 },
  { id: "cargo_lines", label: "Cargo Lines", width: 200, minWidth: 160, multiValue: true },
  { id: "laycan", label: "Laycan", width: 148, minWidth: 120 },
  { id: "cargo_readiness", label: "Cargo Readiness", width: 148, minWidth: 120 },
  { id: "demurrage_rate", label: "Demurrage Rate", width: 132, minWidth: 108 },
  { id: "pic_documentation", label: "PIC documentation", width: 180, minWidth: 160, defaultVisible: false, rbacGated: true },
  { id: "shipper", label: "Shipper", editable: true, dbField: "shipper", width: 152, minWidth: 120 },
  { id: "eta", label: "ETA", width: 96, minWidth: 80 },
  { id: "si_no", label: "Shipping Instruction No.", width: 220, minWidth: 200, multiValue: true, defaultVisible: false, rbacGated: true },
  { id: "invoice_no", label: "No Invoice", width: 240, minWidth: 220, multiValue: true, defaultVisible: false, rbacGated: true },
  { id: "pl_no", label: "No Packing List", width: 240, minWidth: 220, multiValue: true, defaultVisible: false, rbacGated: true },
  { id: "peb_no", label: "No PEB", width: 160, minWidth: 120, defaultVisible: false, rbacGated: true },
  { id: "peb_date", label: "PEB date", width: 96, minWidth: 88 },
  { id: "bl_no", label: "No BL", width: 180, minWidth: 140, defaultVisible: false, rbacGated: true },
  { id: "bl_date", label: "BL date", width: 96, minWidth: 88 },
  { id: "_actions", label: "", locked: true, width: 72, minWidth: 72 },
];

function renderMultiValueTags(values: string[] | null | undefined): ReactNode {
  const list = (values ?? []).filter(Boolean);
  if (list.length === 0) return <span className={styles.cellEmpty}>—</span>;
  return (
    <span className={styles.tagList}>
      {list.map((v) => (
        <span key={v} className={styles.tag} title={v}>
          {v}
        </span>
      ))}
    </span>
  );
}

function columnSizeStyle(col: GridColumnDef): React.CSSProperties | undefined {
  const min = col.minWidth ?? col.width;
  const width = col.width ?? min;
  if (!min && !width) return undefined;
  return {
    width,
    minWidth: min,
    boxSizing: "border-box",
  };
}

function isDocNumberColumn(col: GridColumnDef): boolean {
  return col.multiValue === true || DOC_NUMBER_COLUMN_IDS.has(col.id);
}

function buildBulkingUrl(params: URLSearchParams): string {
  const str = params.toString();
  return `/export/bulking${str ? `?${str}` : ""}`;
}

const LIST_VIEW_OPTIONS: { id: ExportBulkingListView; label: string }[] = [
  { id: "all", label: "All" },
  { id: "operations", label: "Operations" },
  { id: "documentation", label: "Document" },
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
    peb_no: "peb_no",
    peb_date: "peb_date",
    bl_no: "bill_of_lading_no",
    bl_date: "bill_of_lading_date",
    laycan: "laycan_from",
    cargo_readiness: "est_cargo_readiness",
    demurrage_rate: "demurrage_rate_pdpr",
  };
  return allowed[columnId];
}

function buildListQueryFromColumnFilters(
  columnFilters: Record<string, string[]>,
  statusLabelToRaw: Map<string, string>,
): Partial<ListExportBulkingQuery> {
  const q: Partial<ListExportBulkingQuery> = {};
  const raw = (id: string) => columnFilters[id] ?? [];

  const statusLabels = raw("status");
  if (statusLabels.length > 0) {
    const statuses = statusLabels
      .map((l) => statusLabelToRaw.get(l))
      .filter((x): x is string => Boolean(x));
    if (statuses.length) q.statuses = statuses;
  }
  if (raw("shipment_no").length) q.shipment_nos = raw("shipment_no");
  if (raw("vessel").length) q.vessel_names = raw("vessel");
  if (raw("voyage").length) q.voyage_numbers = raw("voyage");
  if (raw("shipper").length) q.shippers = raw("shipper");
  if (raw("loadport").length) q.loadport_names = raw("loadport");
  if (raw("cargo_name").length) q.cargo_names = raw("cargo_name");
  if (raw("cargo_lines").length) q.cargo_line_labels = raw("cargo_lines");
  if (raw("total_qty").length) q.total_qty_labels = raw("total_qty");
  if (raw("laycan").length) q.laycan_labels = raw("laycan");
  if (raw("cargo_readiness").length) q.cargo_readiness_labels = raw("cargo_readiness");
  if (raw("demurrage_rate").length) q.demurrage_rate_labels = raw("demurrage_rate");
  if (raw("eta").length) q.eta_dates = raw("eta");
  if (raw("pic_documentation").length) q.pic_documentation_names = raw("pic_documentation");
  if (raw("si_no").length) q.si_numbers = raw("si_no");
  if (raw("invoice_no").length) q.invoice_numbers = raw("invoice_no");
  if (raw("pl_no").length) q.pl_numbers = raw("pl_no");
  if (raw("peb_no").length) q.peb_nos = raw("peb_no");
  if (raw("peb_date").length) q.peb_dates = raw("peb_date");
  if (raw("bl_no").length) q.bl_nos = raw("bl_no");
  if (raw("bl_date").length) q.bl_dates = raw("bl_date");
  return q;
}

function columnSupportsFilter(colId: string): boolean {
  return colId !== "_expand" && colId !== "_actions" && colId !== "progress";
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

function formatLaycanDisplay(row: ExportBulkingListItem): string {
  if (row.laycan_from && row.laycan_to) {
    return `${formatShortDate(row.laycan_from)} — ${formatShortDate(row.laycan_to)}`;
  }
  if (row.laycan?.trim()) return row.laycan.trim();
  if (row.laycan_from) return formatShortDate(row.laycan_from);
  if (row.laycan_to) return formatShortDate(row.laycan_to);
  return "";
}

function formatCargoReadinessDisplay(row: ExportBulkingListItem): string {
  if (!row.est_cargo_readiness) return "";
  const date = formatShortDate(row.est_cargo_readiness);
  const period = row.est_cargo_readiness_period?.trim();
  return period ? `${date} ${period}` : date;
}

function formatDemurrageRateDisplay(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value));
}

function resolveListTotalQty(row: ExportBulkingListItem): number | null {
  const fromLines = (row.cargo_summaries ?? []).reduce((sum, line) => {
    const q = line.quantity != null ? Number(line.quantity) : 0;
    return sum + (Number.isNaN(q) ? 0 : q);
  }, 0);
  if (fromLines > 0) return fromLines;
  if (row.total_quantity != null && !Number.isNaN(Number(row.total_quantity))) {
    return Number(row.total_quantity);
  }
  return null;
}

function cargoLineLabels(row: ExportBulkingListItem): string[] {
  const summaries = row.cargo_summaries ?? [];
  if (summaries.length > 0) {
    return summaries.map((line) => {
      const name = line.cargo_name?.trim() || line.item_description?.trim() || "Cargo";
      const qty = line.quantity != null && !Number.isNaN(Number(line.quantity))
        ? formatIntegerThousandsFromNumber(Number(line.quantity))
        : null;
      return qty ? `${name} ${qty} MT` : name;
    });
  }
  return (row.cargo_names ?? []).filter(Boolean);
}

function getCellValue(row: ExportBulkingListItem, colId: string): string {
  switch (colId) {
    case "shipment_no": return row.shipment_no ?? "";
    case "vessel": return row.vessel_name ?? "";
    case "voyage": return row.voyage_number ?? "";
    case "shipper": return row.shipper ?? "";
    case "loadport": return row.loadport_name ?? "";
    case "total_qty": return resolveListTotalQty(row) != null ? String(resolveListTotalQty(row)) : "";
    case "cargo_name": return (row.cargo_names ?? []).join(" ");
    case "cargo_lines": return cargoLineLabels(row).join(" ");
    case "laycan": return formatLaycanDisplay(row);
    case "cargo_readiness": return formatCargoReadinessDisplay(row);
    case "demurrage_rate": return formatDemurrageRateDisplay(row.demurrage_rate_pdpr);
    case "si_no": return (row.si_numbers ?? []).join(" ");
    case "invoice_no": return (row.invoice_numbers ?? []).join(" ");
    case "pl_no": return (row.pl_numbers ?? []).join(" ");
    case "peb_no": return row.peb_no ?? "";
    case "peb_date": return row.peb_date ?? "";
    case "bl_no": return row.bill_of_lading_no ?? "";
    case "bl_date": return row.bill_of_lading_date ?? "";
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
  const assignmentFromUrl = parseAssignmentFilter(searchParams.get("assignment"));
  const statusesFromUrl = searchParams.getAll("statuses");

  const syncParamsToUrl = useCallback(
    (patch: {
      search?: string;
      view?: ExportBulkingListView | null;
      backlog?: ExportBulkingBacklogFilter | null;
      assignment?: ExportBulkingAssignmentFilter | null;
    }) => {
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
      if (patch.assignment !== undefined) {
        if (patch.assignment) p.set("assignment", patch.assignment);
        else p.delete("assignment");
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

  const defaultListView = getDefaultBulkingView(user);
  const listView = resolveBulkingListView(viewFromUrl, user, defaultListView);
  const backlogFilter = backlogFromUrl;
  const assignmentFilter = assignmentFromUrl;
  const backlogActive = backlogFilter != null;
  const isDocumentationOfficer = isExportBulkingDocumentationOfficer(user);

  const canViewDocs = can(user, "VIEW_EXPORT_DOCUMENTATION");
  const canEditOps = canEditExportOperations(user);
  const canEditDocs = canEditExportDocumentation(user);
  const canEditCargo = canEditExportCargo(user);
  const canEditAny = canEditExportBulking(user);
  const canCreateShipment = can(user, "CREATE_EXPORT_BULKING");
  const canAssignDocs = can(user, "ASSIGN_EXPORT_BULKING_DOCUMENTATION");
  const availableListViews = useMemo(() => getAvailableBulkingListViews(user), [user]);

  useEffect(() => {
    if (viewFromUrl && !availableListViews.includes(viewFromUrl)) {
      syncParamsToUrl({
        view: listView,
        backlog: isDocumentationBacklogFilter(backlogFromUrl) ? null : backlogFromUrl ?? undefined,
      });
      return;
    }
    if (!canViewDocs && isDocumentationBacklogFilter(backlogFromUrl)) {
      syncParamsToUrl({ backlog: null });
    }
  }, [viewFromUrl, availableListViews, listView, syncParamsToUrl, canViewDocs, backlogFromUrl]);

  useEffect(() => {
    if (assignmentFromUrl != null || !user) return;
    const defaultAssignment = getDefaultAssignmentFilter(user);
    if (defaultAssignment) {
      syncParamsToUrl({ assignment: defaultAssignment });
    }
  }, [assignmentFromUrl, user, syncParamsToUrl]);

  const columnStorageKey = `${TABLE_COLUMNS_KEY}.${listView}`;

  const allColumns = useMemo<GridColumnDef[]>(() => {
    const docIds = new Set<string>(EXPORT_DOC_COLUMN_IDS);
    let base = [...BASE_COLUMNS];
    if (!canViewDocs) {
      base = base.filter((c) => !docIds.has(c.id) && !c.rbacGated);
    } else {
      base = base.map((c) =>
        c.id === "pic_documentation"
          ? { ...c, defaultVisible: listView === "documentation" || canAssignDocs }
          : c,
      );
    }
    if (listView === "operations") {
      const opsVisible = new Set<string>(OPERATIONS_LIST_COLUMN_IDS);
      return base.map((c) => {
        if (docIds.has(c.id) || c.id === "pic_documentation") return { ...c, defaultVisible: false };
        return { ...c, defaultVisible: opsVisible.has(c.id) };
      });
    }
    if (listView === "documentation") {
      const docVisible = new Set<string>(DOCUMENTATION_LIST_COLUMN_IDS);
      return base.map((c) => ({
        ...c,
        label: DOCUMENTATION_COLUMN_LABELS[c.id] ?? c.label,
        defaultVisible: docVisible.has(c.id),
      }));
    }
    return base;
  }, [listView, canViewDocs, canAssignDocs]);

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
  const [docAssignees, setDocAssignees] = useState<ExportBulkingDocumentationAssignee[]>([]);
  const [assignBusyId, setAssignBusyId] = useState<string | null>(null);
  const docAssigneeOptions = useMemo(
    () =>
      docAssignees.map((u) => ({
        id: u.id,
        label: u.name?.trim() || u.email,
        sublabel: u.name?.trim() ? u.email : undefined,
      })),
    [docAssignees],
  );
  const closeCreateModal = useCallback(() => setShowCreateModal(false), []);
  const gridRef = useRef<HTMLDivElement>(null);

  const tourHooks = useMemo(
    () => ({
      onBeforeStep: (stepIndex: number) => {
        if (stepIndex === 2 && canCreateShipment) {
          flushSync(() => setShowCreateModal(true));
        } else if (stepIndex < 2) {
          setShowCreateModal(false);
        }
        // Grid step (index 6): keep table header in view inside the scrollable grid.
        if (stepIndex === 6 && gridRef.current) {
          gridRef.current.querySelector("thead")?.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      },
      onTourEnd: () => setShowCreateModal(false),
    }),
    [canCreateShipment],
  );
  useRegisterGuideTourHooks("exportBulkingList", tourHooks);

  const { startTour } = useGuideTour();
  const tourAutoStartedRef = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!user?.id || !isFirstTimeUser(user.id)) return;
    if (tourAutoStartedRef.current) return;

    const timer = window.setTimeout(() => {
      tourAutoStartedRef.current = true;
      startTour();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [loading, startTour, user?.id]);

  /* ── shipper data for inline edit comboboxes ── */
  const [shipperList, setShipperList] = useState<Shipper[]>([]);
  const shipperNameOptions = useMemo(() => shipperShortNameOptions(shipperList), [shipperList]);

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
    const o = filterOptions;
    return {
      shipment_no: o.shipment_nos,
      status: o.statuses.map((s) => formatExportBulkingStatus(s)),
      vessel: o.vessel_names,
      voyage: o.voyage_numbers,
      shipper: o.shippers,
      loadport: o.loadport_names,
      cargo_name: o.cargo_names,
      cargo_lines: o.cargo_line_labels,
      total_qty: o.total_qty_labels,
      laycan: o.laycan_labels,
      cargo_readiness: o.cargo_readiness_labels,
      demurrage_rate: o.demurrage_rate_labels,
      eta: o.eta_dates,
      pic_documentation: o.pic_documentation_names,
      si_no: o.si_numbers,
      invoice_no: o.invoice_numbers,
      pl_no: o.pl_numbers,
      peb_no: o.peb_nos,
      peb_date: o.peb_dates,
      bl_no: o.bl_nos,
      bl_date: o.bl_dates,
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
      assignment: assignmentFilter ?? undefined,
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
  }, [accessToken, page, searchParam, columnFiltersKey, statusLabelToRaw, sortBy, sortDir, backlogActive, assignmentFilter]);

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
    if (!accessToken || !canAssignDocs) return;
    listExportBulkingDocumentationAssignees(accessToken).then((res) => {
      if (isApiError(res)) return;
      setDocAssignees(res.data ?? []);
    });
  }, [accessToken, canAssignDocs]);

  const handleDocumentationAssign = useCallback(
    async (shipmentId: string, assigneeUserId: string | null) => {
      if (!accessToken) return;
      setAssignBusyId(shipmentId);
      const res = await assignExportBulkingDocumentation(shipmentId, assigneeUserId, accessToken);
      if (isApiError(res)) {
        pushToast(res.message, "error");
      } else if (res.data) {
        setItems((prev) =>
          prev.map((it) => (it.id === shipmentId ? { ...it, ...res.data } : it)),
        );
        pushToast(
          assigneeUserId ? "Documentation officer assigned" : "Assignment cleared",
          "success",
        );
      }
      setAssignBusyId(null);
    },
    [accessToken, pushToast],
  );

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

  function toggleAssignmentFilter(filter: ExportBulkingAssignmentFilter) {
    syncParamsToUrl({ assignment: assignmentFilter === filter ? null : filter });
    setPage(1);
  }

  function clearAssignmentFilter() {
    syncParamsToUrl({ assignment: null });
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
    router.push(
      buildBulkingDetailUrl(id, {
        listView,
        mode: mode === "view" ? "view" : undefined,
      }),
    );
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
    if (!canEditOps) return;
    const col = visibleColumns[colIdx] as GridColumnDef;
    if (!col?.editable) return;
    const row = displayItems[rowIdx];
    if (!row) return;

    const val = getCellValue(row, col.id);
    setEditingCell({ row: rowIdx, col: colIdx });
    setEditValue(val);

    if (col.id === "loadport") {
      const shipper = row.shipper;
      const match = findShipperMatch(shipper, shipperList);
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

    {
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
      patchPayload = { [col.dbField!]: valueToSave || null };
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
      if (row) navigateToDetail(row.id, canEditAny ? "edit" : "view");
      return;
    }

    if (col?.editable && canEditOps) {
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
        const match = findShipperMatch(shipper, shipperList);
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
        onChange={(e) => setEditValue(e.target.value)}
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
    if (isDocNumberColumn(col)) parts.push(styles.docNumberCell);
    if (col.editable && canEditOps) parts.push(styles.editableCell);
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
            aria-label={expandRowAriaLabel(expandedRows.has(row.id), listView, canViewDocs)}
          >
            {expandedRows.has(row.id)
              ? <ChevronDown size={14} strokeWidth={2} />
              : <ChevronRight size={14} strokeWidth={2} />}
          </button>
        );
      case "shipment_no":
        return (
          <Link
            href={buildBulkingDetailUrl(row.id, {
              listView,
              mode: canEditAny ? undefined : "view",
            })}
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
          <StatusBadge domain="export-bulking" status={row.current_status} visual="pill" />
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
        const val = resolveListTotalQty(row);
        return val != null ? (
          <span title="Sum of cargo line quantities">{formatIntegerThousandsFromNumber(val)}</span>
        ) : (
          <span className={styles.cellEmpty}>—</span>
        );
      }
      case "si_no":
        return renderMultiValueTags(row.si_numbers);
      case "invoice_no":
        return renderMultiValueTags(row.invoice_numbers);
      case "pl_no":
        return renderMultiValueTags(row.pl_numbers);
      case "cargo_name":
        return renderMultiValueTags(row.cargo_names);
      case "cargo_lines":
        return renderMultiValueTags(cargoLineLabels(row));
      case "laycan": {
        const val = formatLaycanDisplay(row);
        return val ? <span title={val}>{val}</span> : <span className={styles.cellEmpty}>—</span>;
      }
      case "cargo_readiness": {
        const val = formatCargoReadinessDisplay(row);
        return val ? <span title={val}>{val}</span> : <span className={styles.cellEmpty}>—</span>;
      }
      case "demurrage_rate": {
        const val = formatDemurrageRateDisplay(row.demurrage_rate_pdpr);
        return val ? (
          <span title={`${val} PD/PR`}>{val}</span>
        ) : (
          <span className={styles.cellEmpty}>—</span>
        );
      }
      case "peb_no":
        return row.peb_no?.trim() ? (
          <span className={styles.docNumberText} title={row.peb_no}>
            {row.peb_no}
          </span>
        ) : (
          <span className={styles.cellEmpty}>—</span>
        );
      case "peb_date":
        return formatShortDate(row.peb_date);
      case "bl_no":
        return row.bill_of_lading_no?.trim() ? (
          <span className={styles.docNumberText} title={row.bill_of_lading_no}>
            {row.bill_of_lading_no}
          </span>
        ) : (
          <span className={styles.cellEmpty}>—</span>
        );
      case "bl_date":
        return formatShortDate(row.bill_of_lading_date);
      case "doc_assignee":
      case "pic_documentation":
        if (canAssignDocs) {
          return (
            <ComboboxSelectById
              className={styles.docAssignCombobox}
              inputClassName={styles.docAssignComboboxInput}
              listClassName={styles.docAssignComboboxList}
              listMinWidth={300}
              options={docAssigneeOptions}
              value={row.documentation_assigned_to ?? ""}
              disabled={assignBusyId === row.id}
              allowEmpty
              emptyLabel="Unassigned"
              placeholder="Search officer…"
              aria-label={`Assign PIC documentation for ${row.shipment_no}`}
              onClick={(e) => e.stopPropagation()}
              onChange={(nextId) => {
                void handleDocumentationAssign(row.id, nextId.trim() || null);
              }}
            />
          );
        }
        return row.documentation_assignee_name?.trim() ? (
          row.documentation_assignee_name
        ) : (
          <span className={styles.cellEmpty}>Unassigned</span>
        );
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
            {canEditOps && (
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
            canEditDocs={canEditDocs}
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
      <div className={styles.pageContainer} data-tour="export-bulking-page">
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

  function formatOptionForColumn(columnId: string): ((v: string) => string) | undefined {
    if (columnId === "eta" || columnId === "peb_date" || columnId === "bl_date") {
      return (v) => formatShortDate(v);
    }
    return undefined;
  }

  return (
    <div className={styles.pageContainer} data-tour="export-bulking-page">
      {/* ── Toolbar ── */}
      <div className={styles.toolbarRow}>
        <div className={styles.toolbarLeft}>
          <Link href="/export/dashboard" style={{ color: "var(--color-primitive-text-steel)", textDecoration: "none", fontSize: 13 }}>
            ← Export
          </Link>
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" }}>Bulking</span>

          <div className={styles.searchBox} data-tour="export-bulking-search">
            <Search size={14} className={styles.searchIcon} aria-hidden />
            <input
              type="search"
              placeholder={
                listView === "documentation"
                  ? "Search shipment, cargo, shipping instruction, invoice, PL, PEB, BL…"
                  : "Search shipment, vessel, shipper…"
              }
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className={styles.searchInput}
              aria-label="Search export shipments"
            />
          </div>

          {/* Status filter pills (inline, with counts) */}
          <div className={styles.pillGroup} data-tour="export-bulking-status-filters">
            {filterOptions?.statuses.map((rawStatus) => {
              const label = formatExportBulkingStatus(rawStatus);
              const isActive = (columnFilters["status"] ?? []).includes(label);
              const count = filterOptions.status_counts?.[rawStatus];
              return (
                <StatusFilterPill
                  key={rawStatus}
                  domain="export-bulking"
                  status={rawStatus}
                  active={isActive}
                  onClick={() => toggleStatusPill(rawStatus)}
                  title={label}
                  className={`${styles.statusPillBtn} ${isActive ? styles.statusPillBtnActive : ""}`.trim()}
                >
                  {getExportBulkingShortLabel(rawStatus)}
                  {count != null && <span className={styles.pillCount}>{count}</span>}
                </StatusFilterPill>
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

          {(canAssignDocs || isDocumentationOfficer) && (
            <div className={styles.pillGroup} role="group" aria-label="PIC assignment filters">
              {canAssignDocs && (
                <button
                  type="button"
                  className={`${styles.assignmentPillBtn} ${assignmentFilter === "unassigned" ? styles.assignmentPillBtnActive : ""}`}
                  onClick={() => toggleAssignmentFilter("unassigned")}
                  aria-pressed={assignmentFilter === "unassigned"}
                >
                  {ASSIGNMENT_FILTER_LABELS.unassigned}
                </button>
              )}
              {isDocumentationOfficer && (
                <button
                  type="button"
                  className={`${styles.assignmentPillBtn} ${assignmentFilter === "assigned_to_me" ? styles.assignmentPillBtnActive : ""}`}
                  onClick={() => toggleAssignmentFilter("assigned_to_me")}
                  aria-pressed={assignmentFilter === "assigned_to_me"}
                >
                  {ASSIGNMENT_FILTER_LABELS.assigned_to_me}
                </button>
              )}
            </div>
          )}
        </div>

        <div className={styles.toolbarRight}>
          <button
            type="button"
            className={styles.dateRangeBtn}
            title="Date range filter — coming in a future release"
            aria-label="Date range filter — coming soon"
            disabled
          >
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
            data-tour="export-bulking-create-btn"
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
        {availableListViews.length > 1 && (
        <div className={styles.viewTabs} role="tablist" aria-label="Bulking list view" data-tour="export-bulking-view-tabs">
          {LIST_VIEW_OPTIONS.filter(({ id }) => availableListViews.includes(id)).map(({ id, label }) => (
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
        )}
        {backlogFilter && (
          <button type="button" className={styles.backlogChip} onClick={clearBacklogFilter}>
            Filter: {BACKLOG_FILTER_LABELS[backlogFilter]}
            <span aria-hidden> ×</span>
          </button>
        )}
        {assignmentFilter && (
          <button type="button" className={styles.backlogChip} onClick={clearAssignmentFilter}>
            Filter: {ASSIGNMENT_FILTER_LABELS[assignmentFilter]}
            <span aria-hidden> ×</span>
          </button>
        )}
      </div>

      {assignmentFilter && !backlogFilter && (
        <p className={styles.backlogBanner}>
          Showing shipments{" "}
          {assignmentFilter === "assigned_to_me" ? (
            <>
              <strong>assigned to you</strong>
            </>
          ) : (
            <>
              with <strong>{ASSIGNMENT_FILTER_LABELS[assignmentFilter].toLowerCase()}</strong>
            </>
          )}
          .
        </p>
      )}

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
                : assignmentFilter
                  ? `No shipments match "${ASSIGNMENT_FILTER_LABELS[assignmentFilter]}". Try clearing the filter.`
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
          data-tour="export-bulking-grid"
          tabIndex={0}
          onKeyDown={handleGridKeyDown}
        >
          <table className={styles.grid}>
            <colgroup>
              {visibleColumns.map((c) => {
                const col = c as GridColumnDef;
                return <col key={col.id} style={columnSizeStyle(col)} />;
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
                      className={[
                        col.id === "_expand" ? styles.expandCol : "",
                        isDocNumberColumn(col) ? styles.docNumberCell : "",
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined}
                      style={columnSizeStyle(col)}
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
                        {columnSupportsFilter(col.id) && (
                          <TableColumnFilterPicker
                            columnLabel={col.label}
                            options={opts}
                            selected={selected}
                            onChange={(next) => setColumnFilter(col.id, next)}
                            open={openFilterColumnId === col.id}
                            onOpenChange={(open) => setOpenFilterColumnId(open ? col.id : null)}
                            formatOptionLabel={formatOptionForColumn(col.id)}
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
                          style={columnSizeStyle(col)}
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
        <TablePagination
          page={page}
          totalPages={totalPages}
          totalItems={meta?.total}
          itemNoun="shipments"
          showWhenSinglePage
          previousLabel="← Previous"
          nextLabel="Next →"
          onPageChange={setPage}
          className={styles.paginationBar}
        />
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

function parseCreateQuantityInput(raw: string): number | null {
  const cleaned = parseThousands(raw.trim());
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

function emptyCreateCargoLine(): CreateCargoLineDraft {
  return { _key: `new-${++createCargoKeyCounter}`, cargo_name: "", quantity: "" };
}

let createCargoKeyCounter = 0;

interface CreateCargoLineDraft {
  _key: string;
  cargo_name: string;
  quantity: string;
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
  const { accessToken, user } = useAuth();
  const [vesselName, setVesselName] = useState("");
  const [voyageNumber, setVoyageNumber] = useState("");

  const [shipperList, setShipperList] = useState<Shipper[]>([]);
  const [shipperName, setShipperName] = useState("");
  const [selectedShipperId, setSelectedShipperId] = useState<string | null>(null);

  const [loadportOptions, setLoadportOptions] = useState<string[]>([]);
  const [loadport, setLoadport] = useState("");

  const [cargoLines, setCargoLines] = useState<CreateCargoLineDraft[]>(() => [emptyCreateCargoLine()]);
  const [commodityList, setCommodityList] = useState<Commodity[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pendingLoadportName, setPendingLoadportName] = useState<string | null>(null);

  const shipperNameOptions = useMemo(() => shipperShortNameOptions(shipperList), [shipperList]);

  const commodityOptions = useMemo(
    () =>
      [...commodityList]
        .map((c) => c.short_name.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    [commodityList],
  );

  const cargoTotalMt = useMemo(
    () =>
      cargoLines.reduce((sum, line) => {
        const qty = parseCreateQuantityInput(line.quantity);
        return sum + (qty != null && qty > 0 ? qty : 0);
      }, 0),
    [cargoLines],
  );

  useEffect(() => {
    if (!accessToken) return;
    listShippers(accessToken).then((res) => {
      if (!isApiError(res)) {
        setShipperList((res as ApiSuccess<Shipper[]>).data ?? []);
      }
    });
    listCommodities(accessToken).then((res) => {
      if (!isApiError(res)) {
        setCommodityList((res as ApiSuccess<Commodity[]>).data ?? []);
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
    const match = findShipperMatch(name, shipperList);
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
    setCargoLines([emptyCreateCargoLine()]);
    setFieldErrors({});
    setPendingLoadportName(null);
    onClose();
  }, [onClose]);

  const updateCargoLine = (idx: number, patch: Partial<Pick<CreateCargoLineDraft, "cargo_name" | "quantity">>) => {
    setCargoLines((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const addCargoLine = () => {
    setCargoLines((prev) => [...prev, emptyCreateCargoLine()]);
  };

  const removeCargoLine = (idx: number) => {
    setCargoLines((prev) => {
      if (prev.length <= 1) return [emptyCreateCargoLine()];
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleCargoQuantityChange = (idx: number, raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    const normalized = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : cleaned;
    updateCargoLine(idx, { quantity: formatThousands(normalized) });
  };

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!vesselName.trim()) errs.vessel_name = "Vessel name is required";
    if (!voyageNumber.trim()) errs.voyage_number = "Voyage number is required";
    if (!shipperName.trim()) errs.shipper = "Shipper is required";
    if (!loadport.trim()) errs.loadport_name = "Load port is required";

    let hasValidCargoLine = false;
    cargoLines.forEach((line, idx) => {
      const commodity = line.cargo_name.trim();
      const qty = parseCreateQuantityInput(line.quantity);
      if (!commodity) {
        errs[`cargo_${idx}_commodity`] = "Commodity is required";
      }
      if (qty == null || qty <= 0) {
        errs[`cargo_${idx}_quantity`] = "Quantity must be greater than 0";
      }
      if (commodity && qty != null && qty > 0) hasValidCargoLine = true;
    });
    if (!hasValidCargoLine) {
      errs.cargo_lines = "Add at least one cargo line with commodity and quantity";
    }

    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const payloadCargoLines = cargoLines
      .map((line) => {
        const cargoName = line.cargo_name.trim()
          ? resolveCommodityShortName(line.cargo_name, commodityList)
          : "";
        const commodity = findCommodityMatch(cargoName, commodityList);
        const qty = parseCreateQuantityInput(line.quantity);
        if (!cargoName || qty == null || qty <= 0) return null;
        return {
          cargo_name: cargoName,
          quantity: qty,
          item_description: commodity?.name ?? null,
        };
      })
      .filter((line): line is { cargo_name: string; quantity: number; item_description: string | null } => line != null);

    onSubmit({
      vessel_name: vesselName.trim(),
      voyage_number: voyageNumber.trim(),
      shipper: shipperName.trim(),
      loadport_name: findMatchingOption(loadportOptions, loadport.trim()) ?? loadport.trim(),
      cargo_lines: payloadCargoLines,
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
          <button
            type="submit"
            form="create-shipment-form"
            className={styles.createBtn}
            data-tour="export-bulking-create-submit"
            disabled={saving}
          >
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
          <div className={styles.createCargoHeader}>
            <label className={`${styles.formLabel} ${styles.formLabelRequired}`}>Cargo lines</label>
            {cargoTotalMt > 0 ? (
              <span className={styles.createCargoTotal}>Total: {formatThousands(String(cargoTotalMt))} MT</span>
            ) : null}
          </div>
          <div className={styles.createCargoList}>
            {cargoLines.map((line, idx) => (
              <div key={line._key} className={styles.createCargoRow}>
                <div className={styles.createCargoRowFields}>
                  <div className={styles.createCargoField}>
                    <label className={styles.createCargoFieldLabel} htmlFor={`create-cargo-commodity-${line._key}`}>
                      Commodity
                    </label>
                    <ComboboxSelect
                      id={`create-cargo-commodity-${line._key}`}
                      options={commodityOptions}
                      value={line.cargo_name}
                      onChange={(val) => {
                        const canonical = resolveCommodityShortName(val, commodityList);
                        updateCargoLine(idx, { cargo_name: canonical });
                        if (fieldErrors[`cargo_${idx}_commodity`] || fieldErrors.cargo_lines) {
                          setFieldErrors((p) => {
                            const next = { ...p };
                            delete next[`cargo_${idx}_commodity`];
                            delete next.cargo_lines;
                            return next;
                          });
                        }
                      }}
                      placeholder="Select commodity…"
                      allowEmpty
                      emptyLabel="— Select —"
                      inputClassName={`${styles.formInput}${fieldErrors[`cargo_${idx}_commodity`] ? ` ${styles.formInputError}` : ""}`}
                      aria-label={`Commodity line ${idx + 1}`}
                    />
                    {fieldErrors[`cargo_${idx}_commodity`] ? (
                      <span className={styles.fieldError}>{fieldErrors[`cargo_${idx}_commodity`]}</span>
                    ) : null}
                  </div>
                  <div className={styles.createCargoField}>
                    <label className={styles.createCargoFieldLabel} htmlFor={`create-cargo-qty-${line._key}`}>
                      Quantity (MT)
                    </label>
                    <input
                      id={`create-cargo-qty-${line._key}`}
                      className={`${styles.formInput} ${styles.quantityInput}${fieldErrors[`cargo_${idx}_quantity`] ? ` ${styles.formInputError}` : ""}`}
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={line.quantity}
                      onChange={(e) => {
                        handleCargoQuantityChange(idx, e.target.value);
                        if (fieldErrors[`cargo_${idx}_quantity`] || fieldErrors.cargo_lines) {
                          setFieldErrors((p) => {
                            const next = { ...p };
                            delete next[`cargo_${idx}_quantity`];
                            delete next.cargo_lines;
                            return next;
                          });
                        }
                      }}
                    />
                    {fieldErrors[`cargo_${idx}_quantity`] ? (
                      <span className={styles.fieldError}>{fieldErrors[`cargo_${idx}_quantity`]}</span>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.createCargoRemoveBtn}
                  onClick={() => removeCargoLine(idx)}
                  title="Remove cargo line"
                  aria-label={`Remove cargo line ${idx + 1}`}
                >
                  <X size={16} strokeWidth={2.5} aria-hidden />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className={styles.createCargoAddBtn} onClick={addCargoLine}>
            + Add cargo line
          </button>
          {fieldErrors.cargo_lines ? (
            <span className={styles.fieldError}>{fieldErrors.cargo_lines}</span>
          ) : (
            <span className={styles.formHint}>Select commodity and quantity per cargo line. Destination port and country are completed later by the documentation team.</span>
          )}
        </div>
      </form>
    </Modal>
  );
}
