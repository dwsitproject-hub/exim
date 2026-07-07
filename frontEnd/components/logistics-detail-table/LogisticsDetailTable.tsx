"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { Download } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildCsv,
  filterByTab,
  groupAirRows,
  groupBulkRows,
  groupFclRows,
  groupLclRows,
} from "./group-logistics-rows";
import type { FclSubType, LogisticsDetailSourceRow, TransportTab } from "./types";
import { displayPtPlantLabel } from "@/lib/pt-display";
import type { ShipmentAnalyticsQuery } from "@/types/analytics";
import { logisticsLineGroupKey } from "@/types/analytics";
import { LogisticsExpandableGroupRow } from "./LogisticsExpandableGroupRow";
import { useLogisticsGroupExpand } from "./useLogisticsGroupExpand";

const TAB_VALUES: TransportTab[] = ["AIR", "LCL", "FCL", "BULK"];

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Increment `token` to apply `tab` (and optional FCL chip), e.g. from analytics Logistics split. */
export interface LogisticsNavigateSync {
  token: number;
  tab: TransportTab;
  fclSubType?: FclSubType;
}

export interface LogisticsDetailTableProps {
  /** Rows from API; omit for empty state until wired. */
  rows?: LogisticsDetailSourceRow[];
  className?: string;
  /** Programmatic tab switch (and optional FCL chip). */
  navigate?: LogisticsNavigateSync | null;
  /**
   * Root element id. Use default for standalone blocks. Pass `null` when a parent supplies
   * `#logistics-detail-root` (e.g. modal shell).
   */
  detailRootId?: string | null;
  /** `modal`: compact chrome when embedded in a dialog. */
  variant?: "default" | "modal";
  /** When set with `accessToken`, grouped rows can expand to list shipments. */
  analyticsQuery?: ShipmentAnalyticsQuery | null;
  accessToken?: string | null;
  shipmentDetailBasePath?: string;
}

export function LogisticsDetailTable({
  rows = [],
  className = "",
  navigate = null,
  detailRootId,
  variant = "default",
  analyticsQuery = null,
  accessToken = null,
  shipmentDetailBasePath = "/dashboard/shipments",
}: LogisticsDetailTableProps) {
  const [tab, setTab] = useState<TransportTab>("AIR");
  const [fclSize, setFclSize] = useState<FclSubType>("");

  // Derive available FCL chip options from actual data so new container types
  // appear automatically without any frontend code changes.
  const fclChips = useMemo(() => {
    const seen = new Map<string, string>(); // slug → label (containerSpec)
    for (const r of rows) {
      if (r.transportMode === "FCL" && !seen.has(r.fclSubType)) {
        seen.set(r.fclSubType, r.containerSpec);
      }
    }
    return [...seen.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([id, label]) => ({ id, label }));
  }, [rows]);

  // Keep selected chip valid: default to first available when chips change.
  useEffect(() => {
    if (fclChips.length > 0 && !fclChips.find((c) => c.id === fclSize)) {
      setFclSize(fclChips[0].id);
    }
  }, [fclChips, fclSize]);

  useEffect(() => {
    if (!navigate || navigate.token < 1) return;
    setTab(navigate.tab);
    if (navigate.tab === "FCL" && navigate.fclSubType != null) {
      setFclSize(navigate.fclSubType);
    }
  }, [navigate?.token, navigate?.tab, navigate?.fclSubType]);

  const resolvedRootId =
    detailRootId === null ? undefined : detailRootId === undefined ? "logistics-detail-root" : detailRootId;
  const rootClass =
    variant === "modal"
      ? `bg-transparent ${className}`.trim()
      : `rounded-xl border border-slate-200 bg-white shadow-sm ${className}`.trim();

  const filtered = useMemo(() => filterByTab(rows, tab, fclSize), [rows, tab, fclSize]);

  const airRows = useMemo(() => {
    if (tab !== "AIR") return [];
    return groupAirRows(filtered.filter((r): r is Extract<typeof r, { transportMode: "AIR" }> => r.transportMode === "AIR"));
  }, [filtered, tab]);

  const lclRows = useMemo(() => {
    if (tab !== "LCL") return [];
    return groupLclRows(filtered.filter((r): r is Extract<typeof r, { transportMode: "LCL" }> => r.transportMode === "LCL"));
  }, [filtered, tab]);

  const fclRows = useMemo(() => {
    if (tab !== "FCL") return [];
    return groupFclRows(filtered.filter((r): r is Extract<typeof r, { transportMode: "FCL" }> => r.transportMode === "FCL"));
  }, [filtered, tab]);

  const bulkRows = useMemo(() => {
    if (tab !== "BULK") return [];
    return groupBulkRows(
      filtered.filter((r): r is Extract<typeof r, { transportMode: "BULK" }> => r.transportMode === "BULK")
    );
  }, [filtered, tab]);

  const handleExportCsv = useCallback(() => {
    const suffix = tab === "FCL" ? `_${fclSize}` : "";
    const name = `logistics-detail_${tab}${suffix}_${new Date().toISOString().slice(0, 10)}.csv`;
    if (tab === "AIR") {
      const headers = ["PT – Plant", "Item Description", "Shipment count", "Forwarder"];
      const data = airRows.map((r) => [displayPtPlantLabel(r.ptPlant), r.itemDescription, String(r.shipmentCount), r.forwarder]);
      downloadBlob(name, "\uFEFF" + buildCsv(headers, data), "text/csv;charset=utf-8");
      return;
    }
    if (tab === "LCL") {
      const headers = ["PT – Plant", "Item Description", "Package", "CBM (m³)", "Forwarder"];
      const data = lclRows.map((r) => [displayPtPlantLabel(r.ptPlant), r.itemDescription, r.packageDisplay, r.cbmDisplay, r.forwarder]);
      downloadBlob(name, "\uFEFF" + buildCsv(headers, data), "text/csv;charset=utf-8");
      return;
    }
    if (tab === "FCL") {
      const headers = ["PT – Plant", "Item Description", "Container", "Forwarder"];
      const data = fclRows.map((r) => [displayPtPlantLabel(r.ptPlant), r.itemDescription, r.containerDisplay, r.forwarder]);
      downloadBlob(name, "\uFEFF" + buildCsv(headers, data), "text/csv;charset=utf-8");
      return;
    }
    const headers = ["PT – Plant", "Item Description", "Volume / Weight", "Forwarder"];
    const data = bulkRows.map((r) => [displayPtPlantLabel(r.ptPlant), r.itemDescription, r.volumeWeightDisplay, r.forwarder]);
    downloadBlob(name, "\uFEFF" + buildCsv(headers, data), "text/csv;charset=utf-8");
  }, [tab, fclSize, airRows, lclRows, fclRows, bulkRows]);

  const tableEmpty = useMemo(() => {
    if (tab === "AIR") return airRows.length === 0;
    if (tab === "LCL") return lclRows.length === 0;
    if (tab === "FCL") return fclRows.length === 0;
    return bulkRows.length === 0;
  }, [tab, airRows.length, lclRows.length, fclRows.length, bulkRows.length]);

  const {
    expandEnabled,
    expanded,
    toggleExpand,
    shipmentsByGroup,
    loadingGroups,
    errorsByGroup,
  } = useLogisticsGroupExpand(
    analyticsQuery,
    accessToken,
    tab,
    tab === "FCL" ? fclSize : undefined
  );

  const expandHeader = expandEnabled ? (
    <th className="w-10 px-2 py-3" aria-label="Expand" />
  ) : null;

  return (
    <div {...(resolvedRootId ? { id: resolvedRootId } : {})} className={rootClass}>
      {variant === "modal" ? (
        <div className="flex justify-end border-b border-slate-200 px-4 py-2 sm:px-5">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={tableEmpty}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50"
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden />
            Download CSV
          </button>
        </div>
      ) : (
        <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Logistics detail</h3>
              <p className="text-xs text-slate-500">
                Grouped by item description per PT–Plant. Populate via API when available.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={tableEmpty}
              className="mt-2 inline-flex items-center justify-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50 sm:mt-0"
            >
              <Download className="h-4 w-4 shrink-0" aria-hidden />
              Download CSV
            </button>
          </div>
        </div>
      )}

      <Tabs.Root
        value={tab}
        onValueChange={(v) => {
          setTab(v as TransportTab);
        }}
        className="px-4 pb-4 pt-3 sm:px-5"
      >
        <Tabs.List
          className="flex flex-wrap gap-1 border-b border-slate-200"
          aria-label="Transport mode"
        >
          {TAB_VALUES.map((t) => (
            <Tabs.Trigger
              key={t}
              value={t}
              className="relative -mb-px border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-slate-500 transition hover:text-slate-800 data-[state=active]:border-[#c43a31] data-[state=active]:text-[#c43a31]"
            >
              {t === "AIR" ? "Air" : t === "LCL" ? "LCL" : t === "FCL" ? "FCL" : "Bulk"}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="AIR" className="pt-4 outline-none">
          <div className="overflow-auto rounded-lg border border-slate-200 max-h-[min(70vh,560px)]">
            <table className="min-w-full border-collapse text-left text-sm text-slate-800">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100/95 backdrop-blur supports-[backdrop-filter]:bg-slate-100/80">
                <tr>
                  {expandHeader}
                  <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    PT – Plant
                  </th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Item description
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Shipments
                  </th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Forwarder
                  </th>
                </tr>
              </thead>
              <tbody>
                {airRows.map((r) => {
                  const groupKey = logisticsLineGroupKey(r.ptPlant, r.itemDescription);
                  return (
                    <LogisticsExpandableGroupRow
                      key={`${r.ptPlant}|${r.itemDescription}`}
                      rowKey={`${r.ptPlant}|${r.itemDescription}`}
                      ptPlantLabel={displayPtPlantLabel(r.ptPlant)}
                      itemDescription={r.itemDescription}
                      metricCells={[r.shipmentCount.toLocaleString()]}
                      forwarder={r.forwarder}
                      expanded={expanded.has(groupKey)}
                      expandEnabled={expandEnabled}
                      loading={loadingGroups.has(groupKey)}
                      error={errorsByGroup.get(groupKey) ?? null}
                      shipments={shipmentsByGroup.get(groupKey) ?? []}
                      shipmentDetailBasePath={shipmentDetailBasePath}
                      onToggle={() => toggleExpand(r.ptPlant, r.itemDescription)}
                      colSpan={6}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
          {airRows.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">No air rows for this dataset.</p>
          )}
        </Tabs.Content>

        <Tabs.Content value="LCL" className="pt-4 outline-none">
          <div className="overflow-auto rounded-lg border border-slate-200 max-h-[min(70vh,560px)]">
            <table className="min-w-full border-collapse text-left text-sm text-slate-800">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100/95 backdrop-blur supports-[backdrop-filter]:bg-slate-100/80">
                <tr>
                  {expandHeader}
                  <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    PT – Plant
                  </th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Item description
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Package
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    CBM (m³)
                  </th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Forwarder
                  </th>
                </tr>
              </thead>
              <tbody>
                {lclRows.map((r) => {
                  const groupKey = logisticsLineGroupKey(r.ptPlant, r.itemDescription);
                  return (
                    <LogisticsExpandableGroupRow
                      key={`${r.ptPlant}|${r.itemDescription}`}
                      rowKey={`${r.ptPlant}|${r.itemDescription}`}
                      ptPlantLabel={displayPtPlantLabel(r.ptPlant)}
                      itemDescription={r.itemDescription}
                      metricCells={[r.packageDisplay, r.cbmDisplay]}
                      forwarder={r.forwarder}
                      expanded={expanded.has(groupKey)}
                      expandEnabled={expandEnabled}
                      loading={loadingGroups.has(groupKey)}
                      error={errorsByGroup.get(groupKey) ?? null}
                      shipments={shipmentsByGroup.get(groupKey) ?? []}
                      shipmentDetailBasePath={shipmentDetailBasePath}
                      onToggle={() => toggleExpand(r.ptPlant, r.itemDescription)}
                      colSpan={7}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
          {lclRows.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">No LCL rows for this dataset.</p>
          )}
        </Tabs.Content>

        <Tabs.Content value="FCL" className="pt-4 outline-none">
          {fclChips.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2" role="toolbar" aria-label="FCL container type">
              {fclChips.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setFclSize(c.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    fclSize === c.id
                      ? "border-[#c43a31] bg-[#c43a31]/10 text-[#9e2c25]"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          <div className="overflow-auto rounded-lg border border-slate-200 max-h-[min(70vh,520px)]">
            <table className="min-w-full border-collapse text-left text-sm text-slate-800">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100/95 backdrop-blur supports-[backdrop-filter]:bg-slate-100/80">
                <tr>
                  {expandHeader}
                  <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    PT – Plant
                  </th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Item description
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Container
                  </th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Forwarder
                  </th>
                </tr>
              </thead>
              <tbody>
                {fclRows.map((r) => {
                  const groupKey = logisticsLineGroupKey(r.ptPlant, r.itemDescription);
                  return (
                    <LogisticsExpandableGroupRow
                      key={`${r.ptPlant}|${r.itemDescription}`}
                      rowKey={`${r.ptPlant}|${r.itemDescription}`}
                      ptPlantLabel={displayPtPlantLabel(r.ptPlant)}
                      itemDescription={r.itemDescription}
                      metricCells={[r.containerDisplay]}
                      forwarder={r.forwarder}
                      expanded={expanded.has(groupKey)}
                      expandEnabled={expandEnabled}
                      loading={loadingGroups.has(groupKey)}
                      error={errorsByGroup.get(groupKey) ?? null}
                      shipments={shipmentsByGroup.get(groupKey) ?? []}
                      shipmentDetailBasePath={shipmentDetailBasePath}
                      onToggle={() => toggleExpand(r.ptPlant, r.itemDescription)}
                      colSpan={6}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
          {fclRows.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">
              No FCL rows for {fclChips.find((x) => x.id === fclSize)?.label ?? fclSize}.
            </p>
          )}
        </Tabs.Content>

        <Tabs.Content value="BULK" className="pt-4 outline-none">
          <div className="overflow-auto rounded-lg border border-slate-200 max-h-[min(70vh,560px)]">
            <table className="min-w-full border-collapse text-left text-sm text-slate-800">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100/95 backdrop-blur supports-[backdrop-filter]:bg-slate-100/80">
                <tr>
                  {expandHeader}
                  <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    PT – Plant
                  </th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Item description
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Volume / Weight
                  </th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Forwarder
                  </th>
                </tr>
              </thead>
              <tbody>
                {bulkRows.map((r) => {
                  const groupKey = logisticsLineGroupKey(r.ptPlant, r.itemDescription);
                  return (
                    <LogisticsExpandableGroupRow
                      key={`${r.ptPlant}|${r.itemDescription}`}
                      rowKey={`${r.ptPlant}|${r.itemDescription}`}
                      ptPlantLabel={displayPtPlantLabel(r.ptPlant)}
                      itemDescription={r.itemDescription}
                      metricCells={[r.volumeWeightDisplay]}
                      forwarder={r.forwarder}
                      expanded={expanded.has(groupKey)}
                      expandEnabled={expandEnabled}
                      loading={loadingGroups.has(groupKey)}
                      error={errorsByGroup.get(groupKey) ?? null}
                      shipments={shipmentsByGroup.get(groupKey) ?? []}
                      shipmentDetailBasePath={shipmentDetailBasePath}
                      onToggle={() => toggleExpand(r.ptPlant, r.itemDescription)}
                      colSpan={6}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
          {bulkRows.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">No bulk rows for this dataset.</p>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
