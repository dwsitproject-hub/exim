"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Filter, Plane, Ship, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { can } from "@/lib/permissions";
import { PT_OPTION_LABELS, getAllPlantsSorted } from "@/lib/po-create-constants";
import { PRODUCT_CLASSIFICATION_OPTIONS, displayProductClassification } from "@/lib/product-classification";
import { getShipmentAnalytics, getShipmentAnalyticsLines } from "@/services/dashboard-service";
import { listPo, getPoDetail } from "@/services/po-service";
import { listShipments, getShipmentDetail, getShipmentTimeline } from "@/services/shipments-service";
import { Card } from "@/components/cards";
import { LoadingSkeleton } from "@/components/feedback";
import { EmptyState } from "@/components/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/tables";
import { isApiError } from "@/types/api";
import type { ApiSuccess } from "@/types/api";
import type {
  ShipmentAnalyticsLineAggRow,
  ShipmentAnalyticsQuery,
  ShipmentAnalyticsSummary,
} from "@/types/analytics";
import type { PoListItem, PoDetail } from "@/types/po";
import type { ShipmentDetail, ShipmentListItem } from "@/types/shipments";
import type { ManagerialThresholds } from "@/types/dashboard";
import {
  LogisticsDetailTable,
  type LogisticsNavigateSync,
  type TransportTab,
} from "@/components/logistics-detail-table";
import { ShipmentPerformanceCard } from "@/components/shipment-performance/ShipmentPerformanceCard";
import { ScalingFinancialValue } from "@/components/dashboard/ScalingFinancialValue";
import { DashboardUsdRateBar } from "@/components/dashboard/DashboardUsdRateBar";
import {
  amountToDashboardUsd,
  idrToDashboardUsd,
  useDashboardCurrency,
} from "@/lib/dashboard-currency-context";
import {
  buildPoListDeepLink,
  buildShipmentListDormantDeepLink,
  DEFAULT_STALE_DAYS,
  managerialFilterTooltip,
  MANAGERIAL_LIST_FILTERS,
} from "@/lib/managerial-deep-link";
import styles from "./DashboardContent.module.css";

const VIEW_SHIPMENTS = "VIEW_SHIPMENTS";
const MAX_MANAGERIAL_PAGE_SCAN = 8;
const PO_PAGE_LIMIT = 100;
const SHIPMENT_PAGE_LIMIT = 50;

const MANAGERIAL_THRESHOLDS: ManagerialThresholds = {
  maxUnclaimedHours: 48,
  dormantRemainingQtyDays: 30,
  overdueCustomsDays: 7,
  highValueShipmentAmountUsd: 50000,
  uncoupledValueWarningUsd: 100000,
};

type ManagerialInsights = {
  stalePoNumbers: string[];
  uncoupledVolumeUsd: number;
  uncoupledPoCount: number;
  dormantPoNumbers: string[];
  /** Count for shipment-list deep link (remaining qty + stale shipment update). */
  dormantShipmentCount: number;
  airPct: number;
  seaPct: number;
  airTrendDeltaPct: number;
  customsLeadByPlant: Array<{ plant: string; days: number }>;
  overdueCustomsCount: number;
  highValueShipments: Array<{ id: string; shipmentNo: string; amountUsd: number; status: string }>;
  totalImportValueUsdMonth: number;
};

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 90);
  return { from: formatYmd(from), to: formatYmd(to) };
}

type AppliedFilters = {
  dateFrom: string;
  dateTo: string;
  pts: string[];
  plants: string[];
  vendors: string[];
  productClassifications: string[];
  shipmentMethod: string;
};

type DrillState =
  | null
  | { kind: "plant"; plant: string }
  | { kind: "classification"; classification: string };

function buildAnalyticsQueryPayload(a: AppliedFilters): ShipmentAnalyticsQuery {
  return {
    date_from: a.dateFrom,
    date_to: a.dateTo,
    ...(a.pts.length ? { pts: [...a.pts] } : {}),
    ...(a.plants.length ? { plants: [...a.plants] } : {}),
    ...(a.vendors.length ? { vendor_names: [...a.vendors] } : {}),
    ...(a.productClassifications.length ? { product_classifications: [...a.productClassifications] } : {}),
    ...(a.shipmentMethod ? { shipment_method: a.shipmentMethod } : {}),
  };
}

function formatQtyDelivered(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(n);
}

const CLASS_COLORS = ["#c43a31", "#6366f1", "#0ea5e9", "#16a34a", "#71717a", "#a855f7", "#ea580c"];

function formatShipByLabel(mode: string): string {
  const u = mode.trim().toUpperCase();
  if (u === "OTHER") return "Other / unset";
  if (u === "LCL" || u === "FCL") return u;
  if (u === "BULK") return "Bulk";
  return mode;
}

export function DashboardAnalyticsSection() {
  const router = useRouter();
  const { user, accessToken } = useAuth();
  const allowed = can(user, VIEW_SHIPMENTS);
  const { idrPerUsd, formatUsd } = useDashboardCurrency();

  const initial = useMemo(() => defaultRange(), []);
  const emptyFilters = useMemo(
    (): AppliedFilters => ({
      dateFrom: initial.from,
      dateTo: initial.to,
      pts: [],
      plants: [],
      vendors: [],
      productClassifications: [],
      shipmentMethod: "",
    }),
    [initial.from, initial.to]
  );
  const [draft, setDraft] = useState<AppliedFilters>(() => ({ ...emptyFilters }));
  const [applied, setApplied] = useState<AppliedFilters>(() => ({ ...emptyFilters }));

  const [filterOpen, setFilterOpen] = useState(false);
  const [summary, setSummary] = useState<ShipmentAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drill, setDrill] = useState<DrillState>(null);
  const [lineAggRows, setLineAggRows] = useState<ShipmentAnalyticsLineAggRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [logisticsNavigate, setLogisticsNavigate] = useState<LogisticsNavigateSync>({ token: 0, tab: "AIR" });
  const [logisticsModalOpen, setLogisticsModalOpen] = useState(false);
  const [managerialLoading, setManagerialLoading] = useState(false);
  const [managerial, setManagerial] = useState<ManagerialInsights | null>(null);

  const goLogisticsDetail = useCallback((tab: TransportTab) => {
    setDrill(null);
    setLogisticsNavigate((prev) => ({ token: prev.token + 1, tab }));
    setLogisticsModalOpen(true);
  }, []);

  const plantsSorted = useMemo(() => getAllPlantsSorted(), []);

  const getPoAmountDashboardUsd = (detail: PoDetail, rate: number): number =>
    detail.items.reduce((sum, item) => {
      const qty = Number(item.qty ?? 0);
      const value = Number(item.value ?? 0);
      if (!Number.isFinite(qty) || !Number.isFinite(value)) return sum;
      const lineNative = qty * value;
      return sum + amountToDashboardUsd(lineNative, detail.currency, rate);
    }, 0);

  const getRemainingQty = (detail: PoDetail): number =>
    detail.items.reduce((sum, item) => sum + Math.max(0, Number(item.remaining_qty ?? 0)), 0);

  const getLastPoShipmentTouch = (detail: PoDetail): number => {
    const timestamps: number[] = [Date.parse(detail.updated_at), Date.parse(detail.created_at)];
    for (const linked of detail.linked_shipments) {
      [linked.coupled_at, linked.atd, linked.ata, linked.delivered_at].forEach((ts) => {
        if (ts) timestamps.push(Date.parse(ts));
      });
    }
    return Math.max(...timestamps.filter((n) => Number.isFinite(n)));
  };

  const loadManagerialInsights = useCallback(async () => {
    if (!accessToken || !allowed) return;
    setManagerialLoading(true);
    try {
      const now = Date.now();
      const scanPo = async (intakeStatus: string): Promise<PoListItem[]> => {
        const rows: PoListItem[] = [];
        for (let page = 1; page <= MAX_MANAGERIAL_PAGE_SCAN; page += 1) {
          const res = await listPo({ page, limit: PO_PAGE_LIMIT, intake_status: intakeStatus }, accessToken);
          if (isApiError(res) || !res.success) break;
          const chunk = (res as ApiSuccess<PoListItem[]>).data ?? [];
          rows.push(...chunk);
          if (chunk.length < PO_PAGE_LIMIT) break;
        }
        return rows;
      };

      const [newPos, claimedPos] = await Promise.all([scanPo("NEW_PO_DETECTED"), scanPo("CLAIMED")]);
      const stalePoNumbers = newPos
        .filter((po) => {
          const ageHours = (now - Date.parse(po.created_at)) / (1000 * 60 * 60);
          return ageHours >= MANAGERIAL_THRESHOLDS.maxUnclaimedHours && !po.taken_by_user_id;
        })
        .map((po) => po.po_number);

      const candidatePoIds = Array.from(new Set([...newPos, ...claimedPos].map((po) => po.id)));
      const poDetails: PoDetail[] = [];
      for (let i = 0; i < candidatePoIds.length; i += 10) {
        const chunk = candidatePoIds.slice(i, i + 10);
        const detailChunk = await Promise.all(chunk.map((id) => getPoDetail(id, accessToken)));
        for (const d of detailChunk) {
          if (!isApiError(d) && d.success && d.data) poDetails.push(d.data);
        }
      }

      /**
       * Uncoupled must match GET /po?has_linked_shipment=false (active shipment_po_mapping with decoupled_at IS NULL).
       * Do not infer from “linked_shipments” on a NEW+CLAIMED-only scan — that double-counts logic and can drift from the list view.
       */
      let uncoupledPoCount = 0;
      let uncoupledVolumeUsd = 0;
      const uncoupledListRows: PoListItem[] = [];
      for (let page = 1; page <= MAX_MANAGERIAL_PAGE_SCAN; page += 1) {
        const res = await listPo({ page, limit: PO_PAGE_LIMIT, has_linked_shipment: false }, accessToken);
        if (isApiError(res) || !res.success) break;
        if (page === 1) uncoupledPoCount = Number((res as ApiSuccess<PoListItem[]>).meta?.total ?? 0);
        const chunk = (res as ApiSuccess<PoListItem[]>).data ?? [];
        uncoupledListRows.push(...chunk);
        if (chunk.length < PO_PAGE_LIMIT) break;
      }
      const uncoupledIds = [...new Set(uncoupledListRows.map((r) => r.id))];
      for (let i = 0; i < uncoupledIds.length; i += 10) {
        const chunk = uncoupledIds.slice(i, i + 10);
        const detailChunk = await Promise.all(chunk.map((id) => getPoDetail(id, accessToken)));
        for (const d of detailChunk) {
          if (isApiError(d) || !d.success || !d.data) continue;
          const detail = d.data;
          if ((detail.linked_shipments ?? []).length > 0) continue;
          uncoupledVolumeUsd += getPoAmountDashboardUsd(detail, idrPerUsd);
        }
      }

      const dormantPoNumbers: string[] = [];
      for (const detail of poDetails) {
        if (getRemainingQty(detail) > 0) {
          const dormantDays = (now - getLastPoShipmentTouch(detail)) / (1000 * 60 * 60 * 24);
          if (dormantDays >= MANAGERIAL_THRESHOLDS.dormantRemainingQtyDays) dormantPoNumbers.push(detail.po_number);
        }
      }

      const weekWindow = (daysAgoStart: number, daysAgoEnd: number) => {
        const to = new Date();
        to.setDate(to.getDate() - daysAgoEnd);
        const from = new Date();
        from.setDate(from.getDate() - daysAgoStart);
        return { from: formatYmd(from), to: formatYmd(to) };
      };

      const thisWeek = weekWindow(7, 0);
      const prevWeek = weekWindow(14, 7);
      const [airThis, seaThis, airPrev] = await Promise.all([
        listShipments({ page: 1, limit: 1, shipment_method: "AIR", created_from: thisWeek.from, created_to: thisWeek.to }, accessToken),
        listShipments({ page: 1, limit: 1, shipment_method: "SEA", created_from: thisWeek.from, created_to: thisWeek.to }, accessToken),
        listShipments({ page: 1, limit: 1, shipment_method: "AIR", created_from: prevWeek.from, created_to: prevWeek.to }, accessToken),
      ]);

      const airThisCount = !isApiError(airThis) ? Number(airThis.meta?.total ?? 0) : 0;
      const seaThisCount = !isApiError(seaThis) ? Number(seaThis.meta?.total ?? 0) : 0;
      const airPrevCount = !isApiError(airPrev) ? Number(airPrev.meta?.total ?? 0) : 0;
      const thisTotal = Math.max(1, airThisCount + seaThisCount);
      const airTrendDeltaPct = airPrevCount > 0 ? ((airThisCount - airPrevCount) / airPrevCount) * 100 : 0;

      const customsRows: string[] = [];
      for (let page = 1; page <= 2; page += 1) {
        const customsRes = await listShipments(
          { page, limit: SHIPMENT_PAGE_LIMIT, status: "CUSTOMS_CLEARANCE" },
          accessToken
        );
        if (isApiError(customsRes) || !customsRes.success) break;
        const ids = ((customsRes as ApiSuccess<ShipmentListItem[]>).data ?? []).map((s) => s.id);
        customsRows.push(...ids);
        if (ids.length < SHIPMENT_PAGE_LIMIT) break;
      }

      const plantDurations = new Map<string, number[]>();
      let overdueCustomsCount = 0;
      for (let i = 0; i < customsRows.length; i += 6) {
        const chunk = customsRows.slice(i, i + 6);
        const customsDetails = await Promise.all(chunk.map((id) => getShipmentDetail(id, accessToken)));
        const customsTimelines = await Promise.all(chunk.map((id) => getShipmentTimeline(id, accessToken)));
        chunk.forEach((_, idx) => {
          const detailRes = customsDetails[idx];
          const timelineRes = customsTimelines[idx];
          if (isApiError(detailRes) || !detailRes.success || !detailRes.data) return;
          if (isApiError(timelineRes) || !timelineRes.success || !timelineRes.data) return;
          const customsTouch = timelineRes.data
            .filter((t) => t.status === "CUSTOMS_CLEARANCE")
            .map((t) => Date.parse(t.changed_at))
            .filter((n) => Number.isFinite(n))
            .sort((a, b) => b - a)[0];
          if (!Number.isFinite(customsTouch)) return;
          const days = (now - customsTouch) / (1000 * 60 * 60 * 24);
          const plant = detailRes.data.linked_pos.find((p) => p.plant)?.plant ?? "Unknown";
          const prev = plantDurations.get(plant) ?? [];
          prev.push(days);
          plantDurations.set(plant, prev);
          if (days >= MANAGERIAL_THRESHOLDS.overdueCustomsDays) overdueCustomsCount += 1;
        });
      }

      const customsLeadByPlant = [...plantDurations.entries()]
        .map(([plant, vals]) => ({ plant, days: vals.reduce((a, b) => a + b, 0) / vals.length }))
        .sort((a, b) => b.days - a.days)
        .slice(0, 5);

      const monthStart = new Date();
      monthStart.setDate(1);
      const monthFrom = formatYmd(monthStart);
      const monthTo = formatYmd(new Date());
      const monthShipmentIds: string[] = [];
      for (let page = 1; page <= 5; page += 1) {
        const list = await listShipments(
          {
            page,
            limit: SHIPMENT_PAGE_LIMIT,
            statuses: ["ON_SHIPMENT", "DELIVERED"],
            created_from: monthFrom,
            created_to: monthTo,
          },
          accessToken
        );
        if (isApiError(list) || !list.success) break;
        const ids = ((list as ApiSuccess<ShipmentListItem[]>).data ?? []).map((s) => s.id);
        monthShipmentIds.push(...ids);
        if (ids.length < SHIPMENT_PAGE_LIMIT) break;
      }

      const highValueShipments: Array<{ id: string; shipmentNo: string; amountUsd: number; status: string }> = [];
      let totalImportValueUsdMonth = 0;
      for (let i = 0; i < monthShipmentIds.length; i += 8) {
        const detailChunk = await Promise.all(monthShipmentIds.slice(i, i + 8).map((id) => getShipmentDetail(id, accessToken)));
        for (const detailRes of detailChunk) {
          if (isApiError(detailRes) || !detailRes.success || !detailRes.data) continue;
          const amountIdr = Number(detailRes.data.total_items_amount ?? 0);
          const amountUsd = idrToDashboardUsd(amountIdr, idrPerUsd);
          totalImportValueUsdMonth += amountUsd;
          if (amountUsd >= MANAGERIAL_THRESHOLDS.highValueShipmentAmountUsd) {
            highValueShipments.push({
              id: detailRes.data.id,
              shipmentNo: detailRes.data.shipment_number,
              amountUsd,
              status: detailRes.data.current_status,
            });
          }
        }
      }

      const dormantShipListRes = await listShipments(
        {
          page: 1,
          limit: 1,
          dormant_remaining_qty: true,
          dormant_days: MANAGERIAL_THRESHOLDS.dormantRemainingQtyDays,
        },
        accessToken
      );
      const dormantShipmentCount =
        !isApiError(dormantShipListRes) && dormantShipListRes.success
          ? Number(dormantShipListRes.meta?.total ?? 0)
          : 0;

      setManagerial({
        stalePoNumbers,
        uncoupledVolumeUsd,
        uncoupledPoCount,
        dormantPoNumbers,
        dormantShipmentCount,
        airPct: (airThisCount / thisTotal) * 100,
        seaPct: (seaThisCount / thisTotal) * 100,
        airTrendDeltaPct,
        customsLeadByPlant,
        overdueCustomsCount,
        highValueShipments: highValueShipments.sort((a, b) => b.amountUsd - a.amountUsd).slice(0, 8),
        totalImportValueUsdMonth,
      });
    } finally {
      setManagerialLoading(false);
    }
  }, [accessToken, allowed, idrPerUsd]);

  const loadSummary = useCallback(async () => {
    if (!accessToken || !allowed) return;
    setLoading(true);
    setError(null);
    const q = buildAnalyticsQueryPayload(applied);
    const res = await getShipmentAnalytics(q, accessToken);
    if (isApiError(res)) {
      setError(res.message ?? "Failed to load analytics");
      setSummary(null);
    } else {
      setSummary((res as ApiSuccess<ShipmentAnalyticsSummary>).data ?? null);
    }
    setLoading(false);
  }, [accessToken, allowed, applied]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadManagerialInsights();
  }, [loadManagerialInsights]);

  useEffect(() => {
    if (!drill || !accessToken || !allowed) {
      setLineAggRows([]);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);

    const linesQuery = {
      ...buildAnalyticsQueryPayload(applied),
      detail_kind: drill.kind,
      ...(drill.kind === "plant" && drill.plant !== "__ALL__" ? { detail_plant: drill.plant } : {}),
      ...(drill.kind === "classification" && drill.classification !== "__ALL__"
        ? { detail_classification: drill.classification }
        : {}),
    };

    getShipmentAnalyticsLines(linesQuery, accessToken)
      .then((res) => {
        if (cancelled) return;
        if (isApiError(res) || !res.success) {
          setLineAggRows([]);
          return;
        }
        setLineAggRows((res as ApiSuccess<ShipmentAnalyticsLineAggRow[]>).data ?? []);
      })
      .catch(() => {
        if (!cancelled) setLineAggRows([]);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [drill, applied, accessToken, allowed]);

  const applyFilters = () => {
    setApplied({ ...draft });
    setFilterOpen(false);
    setDrill(null);
    setLogisticsModalOpen(false);
  };

  const resetFilters = () => {
    const r = defaultRange();
    const empty: AppliedFilters = {
      dateFrom: r.from,
      dateTo: r.to,
      pts: [],
      plants: [],
      vendors: [],
      productClassifications: [],
      shipmentMethod: "",
    };
    setDraft(empty);
    setApplied(empty);
    setDrill(null);
    setLogisticsModalOpen(false);
  };

  const allPlants = summary?.by_plant ?? [];
  const maxPlant = Math.max(1, ...allPlants.map((p) => p.count));

  const donutGradient = useMemo(() => {
    const rows = summary?.by_classification ?? [];
    if (rows.length === 0) return "conic-gradient(var(--color-primitive-border-light, #e0e0e0) 0deg 360deg)";
    const total = rows.reduce((s, r) => s + r.count, 0);
    let acc = 0;
    const parts: string[] = [];
    rows.forEach((r, i) => {
      const deg = (r.count / total) * 360;
      const start = acc;
      acc += deg;
      const color = CLASS_COLORS[i % CLASS_COLORS.length];
      parts.push(`${color} ${start}deg ${acc}deg`);
    });
    return `conic-gradient(${parts.join(", ")})`;
  }, [summary?.by_classification]);

  const logisticsTotal = (summary?.logistics.air ?? 0) + (summary?.logistics.sea ?? 0) || 1;

  const seaBarSegments = useMemo(() => {
    const sl = summary?.sea_logistics;
    if (!sl?.by_ship_by.length) return [];
    const upperMap = new Map(sl.by_ship_by.map((r) => [r.ship_by.toUpperCase(), r.count]));
    const order = ["BULK", "LCL", "FCL", "OTHER"];
    const total = sl.by_ship_by.reduce((s, r) => s + r.count, 0) || 1;
    const colors: Record<string, string> = {
      BULK: "#64748b",
      LCL: "#6366f1",
      FCL: "#4338ca",
      OTHER: "#94a3b8",
    };
    return order.map((key) => ({
      key,
      count: upperMap.get(key) ?? 0,
      pct: ((upperMap.get(key) ?? 0) / total) * 100,
      color: colors[key] ?? "#94a3b8",
      label: formatShipByLabel(key),
    }));
  }, [summary?.sea_logistics]);

  const managerialThresholds = MANAGERIAL_THRESHOLDS;

  useEffect(() => {
    if (drill) setLogisticsModalOpen(false);
  }, [drill]);

  useEffect(() => {
    if (!drill && !logisticsModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrill(null);
        setLogisticsModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drill, logisticsModalOpen]);

  const dateRangeLabel = useMemo(() => {
    const a = new Date(`${applied.dateFrom}T12:00:00`);
    const b = new Date(`${applied.dateTo}T12:00:00`);
    const f = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });
    return `${f.format(a)} → ${f.format(b)}`;
  }, [applied.dateFrom, applied.dateTo]);

  const isDefaultDateRange = useMemo(() => {
    const r = defaultRange();
    return r.from === applied.dateFrom && r.to === applied.dateTo;
  }, [applied.dateFrom, applied.dateTo]);

  const removeDateChip = () => {
    const r = defaultRange();
    const next = { dateFrom: r.from, dateTo: r.to };
    setApplied((prev) => ({ ...prev, ...next }));
    setDraft((prev) => ({ ...prev, ...next }));
  };

  if (!allowed) return null;

  return (
    <div className={styles.managementSection} data-tour="dashboard-analytics">
      <div className={styles.analyticsViewport}>
        <div className={styles.managementHeader}>
          <h2 className={styles.managementTitle}>Shipment analytics</h2>
        </div>

        <DashboardUsdRateBar embedded />

        <div className={styles.analyticsTopBar}>
          <button
            type="button"
            className={styles.analyticsFilterPrimaryBtn}
            onClick={() => setFilterOpen(true)}
          >
            <Filter size={18} strokeWidth={2} aria-hidden />
            Filter
          </button>
          <button type="button" className={styles.refreshBtn} onClick={loadSummary} disabled={loading}>
            Refresh
          </button>
        </div>

        <div className={styles.analyticsChipRow}>
          {!isDefaultDateRange && (
            <span className={styles.analyticsChip}>
              Date: {dateRangeLabel}
              <button
                type="button"
                className={styles.analyticsChipRemove}
                aria-label="Reset date range"
                onClick={removeDateChip}
              >
                <X size={14} />
              </button>
            </span>
          )}
          {applied.pts.map((pt) => (
            <span key={pt} className={styles.analyticsChip}>
              PT: {pt}
              <button
                type="button"
                className={styles.analyticsChipRemove}
                aria-label={`Remove ${pt}`}
                onClick={() => {
                  setApplied((p) => ({ ...p, pts: p.pts.filter((x) => x !== pt) }));
                  setDraft((p) => ({ ...p, pts: p.pts.filter((x) => x !== pt) }));
                }}
              >
                <X size={14} />
              </button>
            </span>
          ))}
          {applied.plants.map((pl) => (
            <span key={pl} className={styles.analyticsChip}>
              Plant: {pl}
              <button
                type="button"
                className={styles.analyticsChipRemove}
                aria-label={`Remove ${pl}`}
                onClick={() => {
                  setApplied((p) => ({ ...p, plants: p.plants.filter((x) => x !== pl) }));
                  setDraft((p) => ({ ...p, plants: p.plants.filter((x) => x !== pl) }));
                }}
              >
                <X size={14} />
              </button>
            </span>
          ))}
          {applied.vendors.map((v) => (
            <span key={v} className={styles.analyticsChip}>
              Vendor: {v}
              <button
                type="button"
                className={styles.analyticsChipRemove}
                aria-label={`Remove ${v}`}
                onClick={() => {
                  setApplied((p) => ({ ...p, vendors: p.vendors.filter((x) => x !== v) }));
                  setDraft((p) => ({ ...p, vendors: p.vendors.filter((x) => x !== v) }));
                }}
              >
                <X size={14} />
              </button>
            </span>
          ))}
          {applied.productClassifications.map((c) => (
            <span key={c} className={styles.analyticsChip}>
              Class: {displayProductClassification(c)}
              <button
                type="button"
                className={styles.analyticsChipRemove}
                aria-label={`Remove ${c}`}
                onClick={() => {
                  const fn = (p: AppliedFilters) => ({
                    ...p,
                    productClassifications: p.productClassifications.filter((x) => x !== c),
                  });
                  setApplied(fn);
                  setDraft(fn);
                }}
              >
                <X size={14} />
              </button>
            </span>
          ))}
          {applied.shipmentMethod ? (
            <span className={styles.analyticsChip}>
              Ship via: {applied.shipmentMethod}
              <button
                type="button"
                className={styles.analyticsChipRemove}
                aria-label="Remove ship via"
                onClick={() => {
                  setApplied((p) => ({ ...p, shipmentMethod: "" }));
                  setDraft((p) => ({ ...p, shipmentMethod: "" }));
                }}
              >
                <X size={14} />
              </button>
            </span>
          ) : null}
        </div>

        <div className={styles.shipmentPerformanceSlot}>
          <ShipmentPerformanceCard />
        </div>

        {error && <p className={styles.specError}>{error}</p>}

      {loading && !summary ? (
        <LoadingSkeleton lines={8} />
      ) : (
        <>
          <div className={styles.managerialGrid}>
            <Card className={styles.managerialCard}>
              <div className={styles.managerialTitleRow}>
                <h3 className={styles.analyticsCardTitle}>Exception & alert summary</h3>
                {managerialLoading && <span className={styles.analyticsTrendHint}>Updating…</span>}
              </div>
              <div className={styles.alertTiles}>
                <button
                  type="button"
                  className={`${styles.alertTile} ${styles.alertTileDeepLink}`}
                  title={managerialFilterTooltip(managerial?.stalePoNumbers.length ?? 0)}
                  onClick={() =>
                    router.push(buildPoListDeepLink(MANAGERIAL_LIST_FILTERS.stale, DEFAULT_STALE_DAYS))
                  }
                >
                  <p className={styles.alertTileLabel}>Stale POs ({managerialThresholds.maxUnclaimedHours}h+ unclaimed)</p>
                  <p className={styles.alertTileValue}>{managerial?.stalePoNumbers.length ?? 0}</p>
                </button>
                <button
                  type="button"
                  className={`${styles.alertTile} ${styles.alertTileDeepLink} ${
                    (managerial?.uncoupledVolumeUsd ?? 0) >= managerialThresholds.uncoupledValueWarningUsd
                      ? styles.alertTileWarning
                      : ""
                  }`}
                  title={managerialFilterTooltip(managerial?.uncoupledPoCount ?? 0)}
                  onClick={() => router.push(buildPoListDeepLink(MANAGERIAL_LIST_FILTERS.uncoupled))}
                >
                  <p className={styles.alertTileLabel}>Uncoupled volume</p>
                  <ScalingFinancialValue
                    className={styles.alertTileValueMoney}
                    valueText={formatUsd(managerial?.uncoupledVolumeUsd ?? 0)}
                  />
                </button>
                <button
                  type="button"
                  className={`${styles.alertTile} ${styles.alertTileDeepLink}`}
                  title={managerialFilterTooltip(managerial?.dormantShipmentCount ?? 0)}
                  onClick={() =>
                    router.push(
                      buildShipmentListDormantDeepLink(managerialThresholds.dormantRemainingQtyDays)
                    )
                  }
                >
                  <p className={styles.alertTileLabel}>Dormant remaining qty ({managerialThresholds.dormantRemainingQtyDays}d+)</p>
                  <p className={styles.alertTileValue}>{managerial?.dormantShipmentCount ?? 0}</p>
                </button>
                <button
                  type="button"
                  className={styles.alertTile}
                  onClick={() => router.push("/dashboard/shipments?status=CUSTOMS_CLEARANCE")}
                >
                  <p className={styles.alertTileLabel}>Overdue customs shipments ({managerialThresholds.overdueCustomsDays}d+)</p>
                  <p className={styles.alertTileValue}>{managerial?.overdueCustomsCount ?? 0}</p>
                </button>
              </div>
            </Card>
            <Card className={styles.managerialCard}>
              <h3 className={styles.analyticsCardTitle}>Financial visibility</h3>
              <ScalingFinancialValue
                className={styles.bigNumber}
                valueText={formatUsd(managerial?.totalImportValueUsdMonth ?? 0)}
              />
              <p className={styles.subsectionHint}>Total import value this month (On shipment + Delivered)</p>
              <div className={styles.highValueList}>
                {(managerial?.highValueShipments ?? []).map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    className={styles.highValueRow}
                    onClick={() => router.push(`/dashboard/shipments/${s.id}`)}
                  >
                    <span>{s.shipmentNo}</span>
                    <span>{formatUsd(s.amountUsd)}</span>
                  </button>
                ))}
              </div>
            </Card>
          </div>
          <div className={styles.analyticsGrid}>
            <Card
              className={styles.analyticsInteractiveCard}
              onClick={() => setDrill({ kind: "plant", plant: "__ALL__" })}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setDrill({ kind: "plant", plant: "__ALL__" });
                }
              }}
            >
              <div className={styles.analyticsCardTop}>
                <h3 className={styles.analyticsCardTitle}>Import by plant</h3>
                <button
                  type="button"
                  className={styles.analyticsTextBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDrill({ kind: "plant", plant: "__ALL__" });
                  }}
                >
                  Table view
                </button>
              </div>
              <div className={styles.analyticsKpiHero}>
                <span className={styles.analyticsKpiNumber}>{summary?.total_shipments ?? 0}</span>
                <span className={styles.analyticsKpiSuffixLarge}>shipments</span>
              </div>
              <ul className={styles.analyticsPlantList}>
                {allPlants.length === 0 ? (
                  <li className={styles.subsectionHint}>No data in range</li>
                ) : (
                  allPlants.map((p) => (
                    <li key={p.plant}>
                      <button
                        type="button"
                        className={styles.analyticsPlantRowBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDrill({ kind: "plant", plant: p.plant });
                        }}
                      >
                        <div className={styles.analyticsPlantRowMeta}>
                          <span className={styles.analyticsPlantName}>{p.plant}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span className={styles.analyticsPlantCount}>{p.count}</span>
                            <ChevronRight className={styles.plantRowChevron} size={18} aria-hidden />
                          </span>
                        </div>
                        <div className={styles.analyticsBarTrackThin}>
                          <div
                            className={styles.analyticsBarFillBrand}
                            style={{ width: `${(p.count / maxPlant) * 100}%` }}
                          />
                        </div>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </Card>

            <Card
              className={styles.analyticsInteractiveCard}
              onClick={() => setDrill({ kind: "classification", classification: "__ALL__" })}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setDrill({ kind: "classification", classification: "__ALL__" });
                }
              }}
            >
              <div className={styles.analyticsCardTop}>
                <h3 className={styles.analyticsCardTitle}>By classification</h3>
                <button
                  type="button"
                  className={styles.analyticsTextBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDrill({ kind: "classification", classification: "__ALL__" });
                  }}
                >
                  Table view
                </button>
              </div>
              <div className={styles.analyticsClassPillOnly}>
                <div
                  className={styles.analyticsDonutLg}
                  style={{ background: donutGradient }}
                  role="img"
                  aria-label="Classification mix"
                />
              </div>
              <div className={styles.analyticsPillRow}>
                {(summary?.by_classification ?? []).map((r, i) => (
                  <button
                    key={r.classification}
                    type="button"
                    className={styles.analyticsPill}
                    style={{ borderColor: `${CLASS_COLORS[i % CLASS_COLORS.length]}55` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDrill({ kind: "classification", classification: r.classification });
                    }}
                  >
                    {displayProductClassification(r.classification)} · {r.count}
                  </button>
                ))}
              </div>
            </Card>

            <Card
              className={styles.analyticsInteractiveCard}
              onClick={() => goLogisticsDetail("AIR")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  goLogisticsDetail("AIR");
                }
              }}
            >
              <div className={styles.analyticsLogisticsHeaderRow}>
                <h3 className={styles.analyticsCardTitle} style={{ margin: 0 }}>
                  Logistics split
                </h3>
                <p
                  className={styles.analyticsTrendHint}
                  title="Week-over-week air share movement."
                >
                  Air trend · {managerial ? `${managerial.airTrendDeltaPct >= 0 ? "+" : ""}${managerial.airTrendDeltaPct.toFixed(1)}%` : "n/a"}
                </p>
              </div>
              <div className={styles.analyticsCardTop} style={{ marginTop: 0 }}>
                <span className={styles.analyticsKpiSuffixLarge} style={{ paddingBottom: 0 }}>
                  Air {managerial ? `${managerial.airPct.toFixed(0)}%` : "—"} · Sea {managerial ? `${managerial.seaPct.toFixed(0)}%` : "—"}
                </span>
                <button
                  type="button"
                  className={styles.analyticsTextBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    goLogisticsDetail("AIR");
                  }}
                >
                  Table view
                </button>
              </div>
              <div className={styles.logisticsGrid}>
                <button
                  type="button"
                  className={`${styles.logisticsTile} ${styles.logisticsTileAir} ${styles.analyticsCardInnerStop}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    goLogisticsDetail("AIR");
                  }}
                >
                  <div className={styles.logisticsIconWrap}>
                    <Plane size={22} strokeWidth={1.75} aria-hidden />
                  </div>
                  <p className={styles.logisticsTileValue}>{summary?.logistics.air ?? 0}</p>
                  <p className={styles.logisticsTileLabel}>Air</p>
                </button>
                <button
                  type="button"
                  className={`${styles.logisticsTile} ${styles.logisticsTileSea} ${styles.analyticsCardInnerStop}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    goLogisticsDetail("LCL");
                  }}
                >
                  <div className={styles.logisticsIconWrap}>
                    <Ship size={22} strokeWidth={1.75} aria-hidden />
                  </div>
                  <p className={styles.logisticsTileValue}>{summary?.logistics.sea ?? 0}</p>
                  <p className={styles.logisticsTileLabel}>Sea</p>
                </button>
              </div>
              <div className={styles.logisticsStackBar}>
                <div
                  className={styles.logisticsStackSegAir}
                  style={{ width: `${((summary?.logistics.air ?? 0) / logisticsTotal) * 100}%` }}
                />
                <div
                  className={styles.logisticsStackSegSea}
                  style={{ width: `${((summary?.logistics.sea ?? 0) / logisticsTotal) * 100}%` }}
                />
              </div>
              {summary?.sea_logistics && (summary.logistics.sea ?? 0) > 0 && (
                <div className={styles.seaLoadSection} onClick={(e) => e.stopPropagation()}>
                  <p className={styles.seaLoadLabel}>Sea — load type (shipments)</p>
                  <div className={styles.seaSegTrack}>
                    {seaBarSegments.map((seg) => (
                      <div
                        key={seg.key}
                        className={styles.seaSegChunk}
                        style={{ width: `${Math.max(seg.pct, 0)}%`, backgroundColor: seg.color }}
                        title={`${seg.label}: ${seg.count}`}
                      />
                    ))}
                  </div>
                  <ul className={styles.seaSegLegend}>
                    {seaBarSegments.map((seg) => (
                      <li key={seg.key}>
                        <span
                          className={styles.seaSegSwatch}
                          style={{ backgroundColor: seg.color }}
                        />
                        {seg.label} · {seg.count}
                      </li>
                    ))}
                  </ul>
                  <p className={styles.seaLoadCaption}>
                    LCL — total packages: {summary.sea_logistics.lcl_package_count_total}. FCL containers
                    (20′ / 40′ / ISO tank): {summary.sea_logistics.fcl_container_totals.container_20ft} /{" "}
                    {summary.sea_logistics.fcl_container_totals.container_40ft} /{" "}
                    {summary.sea_logistics.fcl_container_totals.iso_tank_20}.
                  </p>
                </div>
              )}
              <div className={styles.customsLeadMini}>
                <p className={styles.seaLoadLabel}>Customs clearance avg days by plant</p>
                <ul className={styles.customsLeadList}>
                  {(managerial?.customsLeadByPlant ?? []).map((row) => (
                    <li key={row.plant}>
                      <span>{row.plant}</span>
                      <div className={styles.customsLeadBarTrack}>
                        <div className={styles.customsLeadBarFill} style={{ width: `${Math.min(100, row.days * 10)}%` }} />
                      </div>
                      <strong>{row.days.toFixed(1)}d</strong>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          </div>

          {logisticsModalOpen && (
            <div
              className={styles.analyticsDrillBackdrop}
              role="presentation"
              onClick={() => setLogisticsModalOpen(false)}
            >
              <div
                id="logistics-detail-root"
                className={`${styles.analyticsDrillModal} ${styles.analyticsLogisticsModal}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="logistics-detail-modal-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className={styles.analyticsDrillModalHeader}>
                  <h3 id="logistics-detail-modal-title" className={styles.analyticsDrillModalTitle}>
                    Logistics detail
                  </h3>
                  <button
                    type="button"
                    className={styles.analyticsDrillClose}
                    aria-label="Close"
                    onClick={() => setLogisticsModalOpen(false)}
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className={styles.analyticsDrillBody}>
                  <LogisticsDetailTable
                    navigate={logisticsNavigate}
                    detailRootId={null}
                    variant="modal"
                  />
                </div>
              </div>
            </div>
          )}

          {drill && (
            <div
              className={styles.analyticsDrillBackdrop}
              role="presentation"
              onClick={() => setDrill(null)}
            >
              <div
                className={styles.analyticsDrillModal}
                role="dialog"
                aria-modal="true"
                aria-labelledby="analytics-drill-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className={styles.analyticsDrillModalHeader}>
                  <h3 id="analytics-drill-title" className={styles.analyticsDrillModalTitle}>
                    {drill.kind === "plant" &&
                      (drill.plant === "__ALL__"
                        ? "All plants (current filters)"
                        : `Plant · ${drill.plant}`)}
                    {drill.kind === "classification" &&
                      (drill.classification === "__ALL__"
                        ? "All classifications (current filters)"
                        : `Classification · ${displayProductClassification(drill.classification)}`)}
                  </h3>
                  <button
                    type="button"
                    className={styles.analyticsDrillClose}
                    aria-label="Close"
                    onClick={() => setDrill(null)}
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className={styles.analyticsDrillBody}>
              {detailLoading ? (
                <p className={styles.subsectionHint}>Loading…</p>
              ) : lineAggRows.length === 0 ? (
                <EmptyState
                  title="No lines"
                  description="No PO line receipts match this slice for the selected period and filters."
                />
              ) : (
                <div className={styles.procurementTableWrap}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>Item description</TableHeaderCell>
                        <TableHeaderCell>PT</TableHeaderCell>
                        <TableHeaderCell>Plant</TableHeaderCell>
                        <TableHeaderCell>Unit</TableHeaderCell>
                        <TableHeaderCell>Total qty delivered</TableHeaderCell>
                        <TableHeaderCell>Total price (USD)</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {lineAggRows.map((row) => (
                        <TableRow
                          key={`${row.item_description}|${row.pt ?? ""}|${row.plant ?? ""}`}
                        >
                          <TableCell>{row.item_description}</TableCell>
                          <TableCell>{row.pt ?? "—"}</TableCell>
                          <TableCell>{row.plant ?? "—"}</TableCell>
                          <TableCell>{row.unit?.trim() ? row.unit.trim() : "—"}</TableCell>
                          <TableCell>{formatQtyDelivered(row.total_qty_delivered)}</TableCell>
                          <TableCell className={styles.procurementTdNum}>
                            {formatUsd(idrToDashboardUsd(row.total_price_idr, idrPerUsd))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
      </div>

      {filterOpen && (
        <div className={styles.filterOverlay}>
          <button
            type="button"
            className={styles.filterBackdrop}
            aria-label="Close filters"
            onClick={() => setFilterOpen(false)}
          />
          <aside
            className={styles.filterAside}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dash-analytics-filter-title"
          >
            <div className={styles.filterAsideHeader}>
              <h2 id="dash-analytics-filter-title" className={styles.filterAsideTitle}>
                Filters
              </h2>
              <button
                type="button"
                className={styles.filterIconBtn}
                aria-label="Close"
                onClick={() => setFilterOpen(false)}
              >
                <span aria-hidden style={{ fontSize: "1.25rem", lineHeight: 1 }}>
                  ×
                </span>
              </button>
            </div>
            <div className={styles.filterAsideBody}>
              <div className={styles.dateRangeUnified}>
                <span className={styles.dateRangeUnifiedLabel}>Transaction date (start to end)</span>
                <div className={styles.dateRangeInputs}>
                  <label className={styles.field}>
                    <span>Start</span>
                    <input
                      type="date"
                      value={draft.dateFrom}
                      onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>End</span>
                    <input
                      type="date"
                      value={draft.dateTo}
                      onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))}
                    />
                  </label>
                </div>
              </div>
              <div>
                <div className={styles.analyticsMultiFieldLabel}>PT (company entity)</div>
                <div className={styles.analyticsCheckboxScroll}>
                  {PT_OPTION_LABELS.map((pt) => (
                    <label key={pt} className={styles.analyticsCheckRow}>
                      <input
                        type="checkbox"
                        checked={draft.pts.includes(pt)}
                        onChange={() =>
                          setDraft((d) => ({
                            ...d,
                            pts: d.pts.includes(pt) ? d.pts.filter((x) => x !== pt) : [...d.pts, pt],
                          }))
                        }
                      />
                      {pt}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className={styles.analyticsMultiFieldLabel}>Plant</div>
                <div className={styles.analyticsCheckboxScroll}>
                  {plantsSorted.map((p) => (
                    <label key={p} className={styles.analyticsCheckRow}>
                      <input
                        type="checkbox"
                        checked={draft.plants.includes(p)}
                        onChange={() =>
                          setDraft((d) => ({
                            ...d,
                            plants: d.plants.includes(p)
                              ? d.plants.filter((x) => x !== p)
                              : [...d.plants, p],
                          }))
                        }
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className={styles.analyticsMultiFieldLabel}>Vendor</div>
                <div className={styles.analyticsCheckboxScroll}>
                  {(summary?.vendor_options ?? []).length === 0 ? (
                    <span className={styles.subsectionHint}>Load analytics once to populate vendors.</span>
                  ) : (
                    (summary?.vendor_options ?? []).map((v) => (
                      <label key={v} className={styles.analyticsCheckRow}>
                        <input
                          type="checkbox"
                          checked={draft.vendors.includes(v)}
                          onChange={() =>
                            setDraft((d) => ({
                              ...d,
                              vendors: d.vendors.includes(v)
                                ? d.vendors.filter((x) => x !== v)
                                : [...d.vendors, v],
                            }))
                          }
                        />
                        {v}
                      </label>
                    ))
                  )}
                </div>
              </div>
              <div>
                <div className={styles.analyticsMultiFieldLabel}>Product classification</div>
                <div className={styles.analyticsCheckboxScroll}>
                  {PRODUCT_CLASSIFICATION_OPTIONS.map((c) => (
                    <label key={c} className={styles.analyticsCheckRow}>
                      <input
                        type="checkbox"
                        checked={draft.productClassifications.includes(c)}
                        onChange={() =>
                          setDraft((d) => ({
                            ...d,
                            productClassifications: d.productClassifications.includes(c)
                              ? d.productClassifications.filter((x) => x !== c)
                              : [...d.productClassifications, c],
                          }))
                        }
                      />
                      {c}
                    </label>
                  ))}
                </div>
              </div>
              <label className={styles.field}>
                <span>Ship via</span>
                <select
                  value={draft.shipmentMethod}
                  onChange={(e) => setDraft((d) => ({ ...d, shipmentMethod: e.target.value }))}
                >
                  <option value="">All</option>
                  <option value="AIR">Air</option>
                  <option value="SEA">Sea</option>
                </select>
              </label>
            </div>
            <div className={styles.filterAsideFooter}>
              <button type="button" className={styles.btnSecondary} style={{ flex: 1 }} onClick={resetFilters}>
                Reset
              </button>
              <button type="button" className={styles.refreshBtn} style={{ flex: 1 }} onClick={applyFilters}>
                Apply filters
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
