"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { BarChart2, ChevronDown, ChevronRight, Container, Filter, Package, Plane, Ship, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { can } from "@/lib/permissions";
import { PT_OPTION_LABELS, getAllPlantsSorted } from "@/lib/po-create-constants";
import { displayPtPlantLabel, displayPtShortName } from "@/lib/pt-display";
import {
  comparePostArrivalLoadTypes,
  formatPostArrivalLoadType,
  postArrivalLeadWarnThresholdDays,
} from "@/lib/post-arrival-lead";
import { PRODUCT_CLASSIFICATION_OPTIONS, displayProductClassification } from "@/lib/product-classification";
import { formatShipmentStatusTitleCase } from "@/lib/shipment-status-title-case";
import { getClassificationQty, getFinancialSummary, getLogisticsRows, getPostArrivalLead, getShipmentAnalytics, getShipmentAnalyticsLines } from "@/services/dashboard-service";
import { getShipmentAnalyticsDefaultDateRange } from "@/lib/shipment-analytics-date-range";
import { Card } from "@/components/cards";
import { LoadingSkeleton } from "@/components/feedback";
import { EmptyState } from "@/components/navigation";
import { isApiError } from "@/types/api";
import type { ApiSuccess } from "@/types/api";
import { postArrivalPlantGroupKey } from "@/types/analytics";
import type {
  ClassificationQtyRow,
  FinancialSummaryResult,
  PostArrivalLeadItem,
  PostArrivalLeadRow,
  ShipmentAnalyticsLineAggRow,
  ShipmentAnalyticsLinesQuery,
  ShipmentAnalyticsLinesResult,
  ShipmentAnalyticsQuery,
  ShipmentAnalyticsSummary,
} from "@/types/analytics";
import {
  LogisticsDetailTable,
  type LogisticsNavigateSync,
  type TransportTab,
} from "@/components/logistics-detail-table";
import type { LogisticsDetailSourceRow } from "@/components/logistics-detail-table/types";
import { ShipmentPerformanceCard } from "@/components/shipment-performance/ShipmentPerformanceCard";
import { DashboardUsdRateBar } from "@/components/dashboard/DashboardUsdRateBar";
import { AnalyticsDrillLineTable } from "@/components/dashboard/AnalyticsDrillLineTable";
import { usePostArrivalPlantExpand } from "@/components/dashboard/usePostArrivalPlantExpand";
import expandStyles from "@/components/dashboard/GroupedShipmentExpandRows.module.css";
import { ScalingFinancialValue } from "@/components/dashboard/ScalingFinancialValue";
import {
  idrToDashboardUsd,
  useDashboardCurrency,
} from "@/lib/dashboard-currency-context";
import styles from "./DashboardContent.module.css";

const VIEW_SHIPMENTS = "VIEW_SHIPMENTS";

function defaultRange(): { from: string; to: string } {
  return getShipmentAnalyticsDefaultDateRange();
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

const CLASS_COLORS = ["#c43a31", "#6366f1", "#0ea5e9", "#16a34a", "#71717a", "#a855f7", "#ea580c"];

const SEA_LOAD_TYPES: { key: string; label: string; icon: LucideIcon; tab: TransportTab }[] = [
  { key: "BULK", label: "Bulking", icon: Ship, tab: "BULK" },
  { key: "FCL", label: "FCL", icon: Package, tab: "FCL" },
  { key: "LCL", label: "LCL", icon: Container, tab: "LCL" },
];

function fclContainerCountUnit(slug: string): string {
  return slug === "ISO" ? "ISO Tank" : "Container";
}

function formatFclShipmentCount(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? "shipment" : "shipments"}`;
}

/** Strip trailing purity/concentration suffix e.g. "Methanol (99.85%)" → "Methanol". */
function displayBulkCargoName(itemDescription: string): string {
  const stripped = itemDescription.replace(/\s*\([^)]*%[^)]*\)\s*$/i, "").trim();
  return stripped || itemDescription;
}

export function DashboardAnalyticsSection() {
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
  const [classificationQty, setClassificationQty] = useState<ClassificationQtyRow[]>([]);
  const [postArrivalLead, setPostArrivalLead] = useState<PostArrivalLeadItem[]>([]);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummaryResult | null>(null);
  const [expandedLoadTypes, setExpandedLoadTypes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drill, setDrill] = useState<DrillState>(null);
  const [lineAggRows, setLineAggRows] = useState<ShipmentAnalyticsLineAggRow[]>([]);
  const [drillShipmentCount, setDrillShipmentCount] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [logisticsNavigate, setLogisticsNavigate] = useState<LogisticsNavigateSync>({ token: 0, tab: "AIR" });
  const [logisticsModalOpen, setLogisticsModalOpen] = useState(false);
  const [logisticsRows, setLogisticsRows] = useState<LogisticsDetailSourceRow[]>([]);

  const drillCloseRef = useRef<HTMLButtonElement>(null);
  const logisticsCloseRef = useRef<HTMLButtonElement>(null);

  const goLogisticsDetail = useCallback((tab: TransportTab) => {
    setDrill(null);
    setLogisticsNavigate((prev) => ({ token: prev.token + 1, tab }));
    setLogisticsModalOpen(true);
  }, []);

  const plantsSorted = useMemo(() => getAllPlantsSorted(), []);

  const loadSummary = useCallback(async () => {
    if (!accessToken || !allowed) return;
    setLoading(true);
    setError(null);
    const q = buildAnalyticsQueryPayload(applied);
    const [res, qtyRes, leadRes, logisticsRes, finRes] = await Promise.all([
      getShipmentAnalytics(q, accessToken),
      getClassificationQty(q, accessToken),
      getPostArrivalLead(q, accessToken),
      getLogisticsRows(q, accessToken),
      getFinancialSummary(q, idrPerUsd, accessToken),
    ]);
    if (isApiError(res)) {
      setError(res.message ?? "Failed to load analytics");
      setSummary(null);
    } else {
      setSummary((res as ApiSuccess<ShipmentAnalyticsSummary>).data ?? null);
    }
    if (!isApiError(qtyRes) && qtyRes.success) {
      setClassificationQty((qtyRes as ApiSuccess<ClassificationQtyRow[]>).data ?? []);
    }
    if (!isApiError(leadRes) && leadRes.success) {
      const rows = (leadRes as ApiSuccess<PostArrivalLeadRow[]>).data ?? [];
      const map = new Map<string, PostArrivalLeadItem>();
      for (const row of rows) {
        if (row.is_type_total) {
          map.set(row.load_type, {
            load_type: row.load_type,
            avg_days: row.avg_days,
            shipment_count: row.shipment_count,
            by_plant: [],
          });
        }
      }
      for (const row of rows) {
        if (!row.is_type_total && row.plant != null) {
          map.get(row.load_type)?.by_plant.push({
            plant: row.plant,
            avg_days: row.avg_days,
            shipment_count: row.shipment_count,
          });
        }
      }
      setPostArrivalLead([...map.values()].sort((a, b) => comparePostArrivalLoadTypes(a.load_type, b.load_type)));
    }
    if (!isApiError(logisticsRes) && logisticsRes.success) {
      setLogisticsRows((logisticsRes as ApiSuccess<LogisticsDetailSourceRow[]>).data ?? []);
    } else {
      setLogisticsRows([]);
    }
    if (!isApiError(finRes) && finRes.success) {
      setFinancialSummary((finRes as ApiSuccess<FinancialSummaryResult>).data ?? null);
    } else {
      setFinancialSummary(null);
    }
    setLoading(false);
  }, [accessToken, allowed, applied, idrPerUsd]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (!drill || !accessToken || !allowed) {
      setLineAggRows([]);
      setDrillShipmentCount(null);
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
          setDrillShipmentCount(null);
          return;
        }
        const data = (res as ApiSuccess<ShipmentAnalyticsLinesResult>).data;
        setLineAggRows(data?.rows ?? []);
        setDrillShipmentCount(data?.shipment_count ?? 0);
      })
      .catch(() => {
        if (!cancelled) {
          setLineAggRows([]);
          setDrillShipmentCount(null);
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [drill, applied, accessToken, allowed]);

  const toggleLoadType = (loadType: string) => {
    setExpandedLoadTypes((prev) => {
      const next = new Set(prev);
      if (next.has(loadType)) next.delete(loadType);
      else next.add(loadType);
      return next;
    });
  };

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

  const drillExpectedCount = useMemo(() => {
    if (!drill || !summary) return null;
    if (drill.kind === "plant") {
      if (drill.plant === "__ALL__") return summary.total_shipments;
      return allPlants.find((p) => p.plant === drill.plant)?.count ?? null;
    }
    if (drill.classification === "__ALL__") return summary.total_shipments;
    return summary.by_classification.find((r) => r.classification === drill.classification)?.count ?? null;
  }, [drill, summary, allPlants]);

  const drillLinesQuery = useMemo((): ShipmentAnalyticsLinesQuery | null => {
    if (!drill) return null;
    return {
      ...buildAnalyticsQueryPayload(applied),
      detail_kind: drill.kind,
      ...(drill.kind === "plant" && drill.plant !== "__ALL__" ? { detail_plant: drill.plant } : {}),
      ...(drill.kind === "classification" && drill.classification !== "__ALL__"
        ? { detail_classification: drill.classification }
        : {}),
    };
  }, [drill, applied]);

  const analyticsQuery = useMemo(() => buildAnalyticsQueryPayload(applied), [applied]);
  const {
    expandEnabled: postArrivalExpandEnabled,
    expanded: expandedPostArrivalPlants,
    toggleExpand: togglePostArrivalPlant,
    shipmentsByGroup: postArrivalShipmentsByGroup,
    loadingGroups: postArrivalLoadingGroups,
    errorsByGroup: postArrivalErrorsByGroup,
  } = usePostArrivalPlantExpand(analyticsQuery, accessToken);

  const logisticsModePct = useMemo(() => {
    const air = summary?.logistics.air ?? 0;
    const sea = summary?.logistics.sea ?? 0;
    const total = Math.max(1, air + sea);
    return {
      airPct: (air / total) * 100,
      seaPct: (sea / total) * 100,
    };
  }, [summary?.logistics.air, summary?.logistics.sea]);

  const seaLoadCounts = useMemo(() => {
    const sl = summary?.sea_logistics;
    const upperMap = new Map(
      (sl?.by_ship_by ?? []).map((r) => [r.ship_by.toUpperCase(), r.count])
    );
    return SEA_LOAD_TYPES.map((t) => ({
      ...t,
      count: upperMap.get(t.key) ?? 0,
    })).filter((t) => t.count > 0);
  }, [summary?.sea_logistics]);


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

  useEffect(() => {
    if (drill) drillCloseRef.current?.focus();
  }, [drill]);

  useEffect(() => {
    if (logisticsModalOpen) logisticsCloseRef.current?.focus();
  }, [logisticsModalOpen]);

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

        <div className={styles.analyticsTopBar}>
          <button
            type="button"
            className={styles.analyticsFilterPrimaryBtn}
            onClick={() => { setDraft({ ...applied }); setFilterOpen(true); }}
          >
            <Filter size={18} strokeWidth={2} aria-hidden />
            Filter
          </button>
          <button type="button" className={styles.filterOpenBtn} onClick={loadSummary} disabled={loading}>
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
              PT: {displayPtShortName(pt)}
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
          <h3 className={styles.sectionDividerLabel}>Shipment Performance</h3>
          <ShipmentPerformanceCard />
        </div>

        {error && <p className={styles.specError}>{error}</p>}

      {loading && !summary ? (
        <LoadingSkeleton lines={8} />
      ) : (
        <>
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
                  className={styles.tableViewBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDrill({ kind: "plant", plant: "__ALL__" });
                  }}
                >
                  <BarChart2 size={13} aria-hidden />
                  Details
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
                  className={styles.tableViewBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDrill({ kind: "classification", classification: "__ALL__" });
                  }}
                >
                  <BarChart2 size={13} aria-hidden />
                  Details
                </button>
              </div>
              <div className={styles.analyticsKpiHero}>
                <span className={styles.analyticsKpiNumber}>{summary?.total_shipments ?? 0}</span>
                <span className={styles.analyticsKpiSuffixLarge}>shipments</span>
              </div>
              {(summary?.by_classification ?? []).length > 0 && (() => {
                const rows = summary!.by_classification;
                const total = rows.reduce((s, r) => s + r.count, 0) || 1;
                return (
                  <div className={styles.classStackBar} role="img" aria-label="Classification mix">
                    {rows.map((r, i) => (
                      <div
                        key={r.classification}
                        className={styles.classStackSegment}
                        style={{ width: `${(r.count / total) * 100}%`, background: CLASS_COLORS[i % CLASS_COLORS.length] }}
                        title={`${displayProductClassification(r.classification)}: ${r.count}`}
                      />
                    ))}
                  </div>
                );
              })()}
              <div className={styles.analyticsPillRow} style={{ marginTop: 10 }}>
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
                    <span className={styles.analyticsPillDot} style={{ background: CLASS_COLORS[i % CLASS_COLORS.length] }} />
                    {displayProductClassification(r.classification)} · {r.count}
                  </button>
                ))}
              </div>
              {classificationQty.length > 0 && (
                <div className={styles.classificationQtyList} onClick={(e) => e.stopPropagation()}>
                  <p className={styles.classificationQtyLabel}>Delivered qty (in date range)</p>
                  {classificationQty.map((row) => (
                    <div key={row.classification} className={styles.classificationQtyRow}>
                      <span className={styles.classificationQtyName}>
                        {displayProductClassification(row.classification)}
                      </span>
                      <span className={styles.classificationQtyValue}>
                        {new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(row.total_qty)}
                        <span className={styles.classificationQtyUnit}>{row.unit}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
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
                <button
                  type="button"
                  className={styles.tableViewBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    goLogisticsDetail("AIR");
                  }}
                >
                  <BarChart2 size={13} aria-hidden />
                  Details
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
                  {summary && (
                    <p className={styles.logisticsTilePct}>{logisticsModePct.airPct.toFixed(0)}%</p>
                  )}
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
                  {summary && (
                    <p className={styles.logisticsTilePct}>{logisticsModePct.seaPct.toFixed(0)}%</p>
                  )}
                </button>
              </div>
              {summary?.sea_logistics && (summary.logistics.sea ?? 0) > 0 && (
                <div className={styles.seaLoadSection} onClick={(e) => e.stopPropagation()}>
                  <p className={styles.seaLoadLabel}>Sea — load type (shipments)</p>
                  <div className={styles.seaLoadTypeGrid}>
                    {seaLoadCounts.map(({ key, label, icon: Icon, count, tab }) => (
                      <button
                        key={key}
                        type="button"
                        className={styles.seaLoadTypeItem}
                        onClick={(e) => {
                          e.stopPropagation();
                          goLogisticsDetail(tab);
                        }}
                      >
                        <Icon size={18} strokeWidth={1.75} aria-hidden />
                        <span className={styles.seaLoadTypeLabel}>{label}</span>
                        <span className={styles.seaLoadTypeValue}>{count}</span>
                      </button>
                    ))}
                  </div>
                  <div className={styles.seaLoadMetrics}>
                    {summary.sea_logistics.bulk_cargo?.map((bc) => (
                      <div key={bc.item_description} className={styles.seaLoadMetricRow}>
                        <span className={styles.seaLoadMetricBadge} style={{ background: "#f1f5f9", color: "#475569" }}>Bulk</span>
                        <span className={styles.seaLoadMetricLabel}>{displayBulkCargoName(bc.item_description)}</span>
                        <span className={styles.seaLoadMetricValue}>
                          {bc.shipment_count.toLocaleString()}
                          <span className={styles.seaLoadMetricUnit}>Vessel</span>
                        </span>
                      </div>
                    ))}
                    {summary.sea_logistics.fcl_containers.map((fc) => (
                      <div key={fc.slug} className={styles.seaLoadMetricRow}>
                        <span className={styles.seaLoadMetricBadge} style={{ background: "#e0f2fe", color: "#0369a1" }}>FCL</span>
                        <span className={styles.seaLoadMetricLabel}>
                          {fc.label}
                          <span className={styles.seaLoadMetricShipmentCount}>
                            ({formatFclShipmentCount(fc.shipment_count)})
                          </span>
                        </span>
                        <span className={styles.seaLoadMetricValue}>
                          {fc.count.toLocaleString()}
                          <span className={styles.seaLoadMetricUnit}>{fclContainerCountUnit(fc.slug)}</span>
                        </span>
                      </div>
                    ))}
                    {summary.sea_logistics.lcl_package_count_total > 0 && (
                      <div className={styles.seaLoadMetricRow}>
                        <span className={styles.seaLoadMetricBadge} style={{ background: "#eef2ff", color: "#4338ca" }}>LCL</span>
                        <span className={styles.seaLoadMetricLabel}>Packages</span>
                        <span className={styles.seaLoadMetricValue}>
                          {summary.sea_logistics.lcl_package_count_total.toLocaleString()}
                          <span className={styles.seaLoadMetricUnit}>PKG</span>
                        </span>
                      </div>
                    )}
                    {summary.sea_logistics.lcl_cbm_total > 0 && (
                      <div className={styles.seaLoadMetricRow}>
                        <span className={styles.seaLoadMetricBadge} style={{ background: "#eef2ff", color: "#4338ca" }}>LCL</span>
                        <span className={styles.seaLoadMetricLabel}>CBM</span>
                        <span className={styles.seaLoadMetricValue}>
                          {summary.sea_logistics.lcl_cbm_total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          <span className={styles.seaLoadMetricUnit}>m³</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          </div>

          <div
            className={`${styles.financialPostArrivalRow} ${
              postArrivalLead.length === 0 ? styles.financialPostArrivalRowSingle : ""
            }`}
          >
            <Card className={styles.managerialCard}>
              <div className={styles.managerialTitleRow}>
                <div className={styles.managerialTitleLeft}>
                  <h3 className={styles.analyticsCardTitle}>Financial visibility</h3>
                  {loading && <span className={styles.analyticsTrendHint}>Updating…</span>}
                </div>
                <DashboardUsdRateBar compact />
              </div>
              <ScalingFinancialValue
                className={styles.bigNumber}
                valueText={formatUsd(idrToDashboardUsd(financialSummary?.total_idr ?? 0, idrPerUsd))}
              />
              <div className={styles.financialBreakdownList}>
                {[
                  { label: "Import Value", value: financialSummary?.import_value_idr ?? 0 },
                  { label: "Bea Masuk", value: financialSummary?.bm_idr ?? 0 },
                  { label: "PPH", value: financialSummary?.pph_idr ?? 0 },
                  { label: "PPN", value: financialSummary?.ppn_idr ?? 0 },
                  { label: "Freight Charge", value: financialSummary?.freight_idr ?? 0 },
                ].map(({ label, value }) => (
                  <div key={label} className={styles.financialBreakdownRow}>
                    <span className={styles.financialBreakdownLabel}>{label}</span>
                    <span className={styles.financialBreakdownValue}>
                      {formatUsd(idrToDashboardUsd(value, idrPerUsd))}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            {postArrivalLead.length > 0 && (
              <Card className={styles.postArrivalCard}>
                <div className={styles.postArrivalCardHeader}>
                  <div>
                    <h3 className={styles.analyticsCardTitle} style={{ margin: 0 }}>Post-Arrival Lead Time</h3>
                    <p className={styles.postArrivalCardSubtitle}>
                      Business days from ATA to delivery · Air (warn &gt;2d) · Sea FCL/LCL (warn &gt;5d)
                    </p>
                  </div>
                </div>
                <div className={styles.postArrivalCardPanels}>
                  {(() => {
                    const maxDays = Math.max(...postArrivalLead.map((r) => r.avg_days), 1);
                    return postArrivalLead.map((item) => {
                      const isExpanded = expandedLoadTypes.has(item.load_type);
                      const warnDays = postArrivalLeadWarnThresholdDays(item.load_type);
                      const overThreshold = item.avg_days > warnDays;
                      return (
                        <div key={item.load_type} className={styles.postArrivalPanel}>
                          <div className={styles.postArrivalPanelTop}>
                            <span className={styles.postArrivalPanelBadge}>{formatPostArrivalLoadType(item.load_type)}</span>
                            <span className={`${styles.postArrivalPanelAvg} ${overThreshold ? styles.postArrivalDaysWarn : styles.postArrivalDaysOk}`}>
                              {item.avg_days.toFixed(1)}d
                            </span>
                            <span className={styles.postArrivalPanelCount}>{item.shipment_count} shipments</span>
                          </div>
                          <div className={styles.postArrivalBarTrack}>
                            <div
                              className={`${styles.postArrivalBarFill} ${overThreshold ? styles.postArrivalBarWarn : styles.postArrivalBarOk}`}
                              style={{ width: `${(item.avg_days / maxDays) * 100}%` }}
                            />
                          </div>
                          <button
                            type="button"
                            className={styles.postArrivalExpandBtn}
                            onClick={() => toggleLoadType(item.load_type)}
                            aria-expanded={isExpanded}
                          >
                            {isExpanded ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
                            {isExpanded ? "Hide plants" : "By plant"}
                          </button>
                          {isExpanded && (
                            <ul className={styles.postArrivalPlantList}>
                              {item.by_plant.map((p) => {
                                const plantOver = p.avg_days > warnDays;
                                const plantMax = Math.max(...item.by_plant.map((r) => r.avg_days), 1);
                                const plantKey = postArrivalPlantGroupKey(item.load_type, p.plant);
                                const plantExpanded = expandedPostArrivalPlants.has(plantKey);
                                const plantShipments = postArrivalShipmentsByGroup.get(plantKey) ?? [];
                                const plantLoading = postArrivalLoadingGroups.has(plantKey);
                                const plantError = postArrivalErrorsByGroup.get(plantKey) ?? null;
                                return (
                                  <li key={p.plant} className={styles.postArrivalPlantGroup}>
                                    <div className={styles.postArrivalPlantRow}>
                                      {postArrivalExpandEnabled ? (
                                        <button
                                          type="button"
                                          className={expandStyles.expandBtn}
                                          aria-expanded={plantExpanded}
                                          aria-label={plantExpanded ? "Collapse shipments" : "Expand shipments"}
                                          onClick={() => togglePostArrivalPlant(item.load_type, p.plant)}
                                        />
                                      ) : (
                                        <span className={styles.postArrivalPlantExpandSpacer} aria-hidden />
                                      )}
                                      <span className={styles.postArrivalPlantName}>{displayPtPlantLabel(p.plant)}</span>
                                      <div className={styles.postArrivalBarTrack}>
                                        <div
                                          className={`${styles.postArrivalBarFill} ${plantOver ? styles.postArrivalBarWarn : styles.postArrivalBarOk}`}
                                          style={{ width: `${(p.avg_days / plantMax) * 100}%` }}
                                        />
                                      </div>
                                      <span className={`${styles.postArrivalDays} ${plantOver ? styles.postArrivalDaysWarn : styles.postArrivalDaysOk}`}>
                                        {p.avg_days.toFixed(1)}d
                                      </span>
                                      <span className={styles.postArrivalCount}>{p.shipment_count}</span>
                                    </div>
                                    {postArrivalExpandEnabled && plantExpanded ? (
                                      plantLoading ? (
                                        <p className={styles.postArrivalShipmentHint}>Loading shipments…</p>
                                      ) : plantError ? (
                                        <p className={styles.postArrivalShipmentError}>{plantError}</p>
                                      ) : plantShipments.length === 0 ? (
                                        <p className={styles.postArrivalShipmentHint}>No shipments for this group.</p>
                                      ) : (
                                        <ul className={styles.postArrivalShipmentList}>
                                          {plantShipments.map((s) => {
                                            const shipmentOver = s.lead_days > warnDays;
                                            return (
                                              <li key={s.id} className={styles.postArrivalShipmentRow}>
                                                <Link
                                                  href={`/dashboard/shipments/${s.id}`}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className={expandStyles.shipmentLink}
                                                >
                                                  {s.shipment_number}
                                                </Link>
                                                {s.current_status ? (
                                                  <span className={styles.postArrivalShipmentStatus}>
                                                    {formatShipmentStatusTitleCase(s.current_status)}
                                                  </span>
                                                ) : null}
                                                <span
                                                  className={`${styles.postArrivalShipmentDays} ${shipmentOver ? styles.postArrivalDaysWarn : styles.postArrivalDaysOk}`}
                                                >
                                                  {s.lead_days}d
                                                </span>
                                              </li>
                                            );
                                          })}
                                        </ul>
                                      )
                                    ) : null}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </Card>
            )}
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
                    ref={logisticsCloseRef}
                    type="button"
                    className={styles.analyticsDrillClose}
                    aria-label="Close logistics detail"
                    onClick={() => setLogisticsModalOpen(false)}
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className={styles.analyticsDrillBody}>
                  <LogisticsDetailTable
                    rows={logisticsRows}
                    navigate={logisticsNavigate}
                    detailRootId={null}
                    variant="modal"
                    analyticsQuery={buildAnalyticsQueryPayload(applied)}
                    accessToken={accessToken}
                    shipmentDetailBasePath="/dashboard/shipments"
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
                  <div>
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
                    {!detailLoading && drillShipmentCount != null && (
                      <p className={styles.subsectionHint} style={{ margin: "4px 0 0" }}>
                        {drillShipmentCount} delivered shipment{drillShipmentCount === 1 ? "" : "s"}
                        {lineAggRows.length > 0
                          ? ` · ${lineAggRows.length} PO line group${lineAggRows.length === 1 ? "" : "s"}`
                          : drillShipmentCount > 0
                            ? " · no received PO lines on file"
                            : ""}
                        {drillExpectedCount != null && drillExpectedCount !== drillShipmentCount
                          ? ` (card shows ${drillExpectedCount})`
                          : ""}
                      </p>
                    )}
                  </div>
                  <button
                    ref={drillCloseRef}
                    type="button"
                    className={styles.analyticsDrillClose}
                    aria-label="Close drill-down"
                    onClick={() => setDrill(null)}
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className={`${styles.analyticsDrillBody} ${styles.analyticsDrillBodyFill}`}>
              {detailLoading ? (
                <p className={styles.subsectionHint}>Loading…</p>
              ) : lineAggRows.length === 0 ? (
                <EmptyState
                  title={drillShipmentCount ? "No PO line receipts" : "No shipments"}
                  description={
                    drillShipmentCount
                      ? `${drillShipmentCount} delivered shipment${drillShipmentCount === 1 ? "" : "s"} match this slice, but none have received PO line data for the selected period and filters.`
                      : "No delivered shipments match this slice for the selected period and filters."
                  }
                />
              ) : drillLinesQuery ? (
                <AnalyticsDrillLineTable
                  rows={lineAggRows}
                  linesQuery={drillLinesQuery}
                  accessToken={accessToken}
                  shipmentDetailBasePath="/dashboard/shipments"
                  idrPerUsd={idrPerUsd}
                  formatUsd={formatUsd}
                  tableWrapClassName={styles.procurementTableWrap}
                  tdNumClassName={styles.procurementTdNum}
                />
              ) : null}
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
                aria-label="Close filters"
                onClick={() => setFilterOpen(false)}
              >
                <X size={20} aria-hidden />
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
                <div className={styles.filterSectionHeader}>
                  <span className={styles.filterSectionLabel}>PT (company entity)</span>
                  <span className={styles.filterSectionActions}>
                    <button
                      type="button"
                      className={styles.filterSectionAction}
                      disabled={draft.pts.length === PT_OPTION_LABELS.length}
                      onClick={() => setDraft((d) => ({ ...d, pts: [...PT_OPTION_LABELS] }))}
                    >
                      Select all
                    </button>
                    <span className={styles.filterSectionActionSep}>|</span>
                    <button
                      type="button"
                      className={styles.filterSectionAction}
                      disabled={draft.pts.length === 0}
                      onClick={() => setDraft((d) => ({ ...d, pts: [] }))}
                    >
                      Clear
                    </button>
                  </span>
                </div>
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
                      {displayPtShortName(pt)}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className={styles.filterSectionHeader}>
                  <span className={styles.filterSectionLabel}>Plant</span>
                  <span className={styles.filterSectionActions}>
                    <button
                      type="button"
                      className={styles.filterSectionAction}
                      disabled={draft.plants.length === plantsSorted.length}
                      onClick={() => setDraft((d) => ({ ...d, plants: [...plantsSorted] }))}
                    >
                      Select all
                    </button>
                    <span className={styles.filterSectionActionSep}>|</span>
                    <button
                      type="button"
                      className={styles.filterSectionAction}
                      disabled={draft.plants.length === 0}
                      onClick={() => setDraft((d) => ({ ...d, plants: [] }))}
                    >
                      Clear
                    </button>
                  </span>
                </div>
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
                {(() => {
                  const vendorOptions = summary?.vendor_options ?? [];
                  return (
                    <>
                      <div className={styles.filterSectionHeader}>
                        <span className={styles.filterSectionLabel}>Vendor</span>
                        {vendorOptions.length > 0 && (
                          <span className={styles.filterSectionActions}>
                            <button
                              type="button"
                              className={styles.filterSectionAction}
                              disabled={draft.vendors.length === vendorOptions.length}
                              onClick={() => setDraft((d) => ({ ...d, vendors: [...vendorOptions] }))}
                            >
                              Select all
                            </button>
                            <span className={styles.filterSectionActionSep}>|</span>
                            <button
                              type="button"
                              className={styles.filterSectionAction}
                              disabled={draft.vendors.length === 0}
                              onClick={() => setDraft((d) => ({ ...d, vendors: [] }))}
                            >
                              Clear
                            </button>
                          </span>
                        )}
                      </div>
                      <div className={styles.analyticsCheckboxScroll}>
                        {vendorOptions.length === 0 ? (
                          <span className={styles.subsectionHint}>Load analytics once to populate vendors.</span>
                        ) : (
                          vendorOptions.map((v) => (
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
                    </>
                  );
                })()}
              </div>
              <div>
                <div className={styles.filterSectionHeader}>
                  <span className={styles.filterSectionLabel}>Product classification</span>
                  <span className={styles.filterSectionActions}>
                    <button
                      type="button"
                      className={styles.filterSectionAction}
                      disabled={draft.productClassifications.length === PRODUCT_CLASSIFICATION_OPTIONS.length}
                      onClick={() => setDraft((d) => ({ ...d, productClassifications: [...PRODUCT_CLASSIFICATION_OPTIONS] }))}
                    >
                      Select all
                    </button>
                    <span className={styles.filterSectionActionSep}>|</span>
                    <button
                      type="button"
                      className={styles.filterSectionAction}
                      disabled={draft.productClassifications.length === 0}
                      onClick={() => setDraft((d) => ({ ...d, productClassifications: [] }))}
                    >
                      Clear
                    </button>
                  </span>
                </div>
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
              <button type="button" className={styles.btnPrimary} style={{ flex: 1 }} onClick={applyFilters}>
                Apply filters
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

