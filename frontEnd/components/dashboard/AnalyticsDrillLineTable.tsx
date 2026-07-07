"use client";

import { Fragment, useCallback, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/tables";
import { getShipmentAnalyticsLineGroupShipments } from "@/services/dashboard-service";
import { isApiError } from "@/types/api";
import type { ApiSuccess } from "@/types/api";
import {
  analyticsLineGroupKey,
  type ShipmentAnalyticsGroupShipmentRow,
  type ShipmentAnalyticsLineAggRow,
  type ShipmentAnalyticsLinesQuery,
} from "@/types/analytics";
import { idrToDashboardUsd } from "@/lib/dashboard-currency-context";
import { displayPtPlantLabel } from "@/lib/pt-display";
import { GroupedShipmentExpandRows } from "./GroupedShipmentExpandRows";
import expandStyles from "./GroupedShipmentExpandRows.module.css";
import styles from "./AnalyticsDrillLineTable.module.css";

function formatQtyDelivered(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(n);
}

function linePtPlantLabel(row: Pick<ShipmentAnalyticsLineAggRow, "pt" | "plant">): string {
  const pt = row.pt?.trim() ?? "";
  const plant = row.plant?.trim() ?? "";
  if (!pt && !plant) return "—";
  if (!pt) return plant;
  if (!plant) return displayPtPlantLabel(pt);
  return displayPtPlantLabel(`${pt} – ${plant}`);
}

export interface AnalyticsDrillLineTableProps {
  rows: ShipmentAnalyticsLineAggRow[];
  linesQuery: ShipmentAnalyticsLinesQuery;
  accessToken: string | null;
  shipmentDetailBasePath: string;
  idrPerUsd: number;
  formatUsd: (n: number) => string;
  tableWrapClassName?: string;
  tdNumClassName?: string;
}

export function AnalyticsDrillLineTable({
  rows,
  linesQuery,
  accessToken,
  shipmentDetailBasePath,
  idrPerUsd,
  formatUsd,
  tableWrapClassName = "",
  tdNumClassName = "",
}: AnalyticsDrillLineTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [shipmentsByGroup, setShipmentsByGroup] = useState<
    Map<string, ShipmentAnalyticsGroupShipmentRow[]>
  >(() => new Map());
  const [loadingGroups, setLoadingGroups] = useState<Set<string>>(() => new Set());
  const [errorsByGroup, setErrorsByGroup] = useState<Map<string, string>>(() => new Map());

  const toggleExpand = useCallback(
    async (row: ShipmentAnalyticsLineAggRow) => {
      const key = analyticsLineGroupKey(row);
      if (expanded.has(key)) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        return;
      }

      setExpanded((prev) => new Set(prev).add(key));

      if (shipmentsByGroup.has(key) || !accessToken) return;

      setLoadingGroups((prev) => new Set(prev).add(key));
      setErrorsByGroup((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });

      try {
        const res = await getShipmentAnalyticsLineGroupShipments(
          {
            ...linesQuery,
            group_item_description: row.item_description,
            ...(row.pt ? { group_pt: row.pt } : {}),
            ...(row.plant ? { group_plant: row.plant } : {}),
          },
          accessToken
        );
        if (isApiError(res) || !res.success) {
          setErrorsByGroup((prev) => new Map(prev).set(key, res.message ?? "Failed to load shipments"));
          return;
        }
        setShipmentsByGroup((prev) =>
          new Map(prev).set(key, (res as ApiSuccess<ShipmentAnalyticsGroupShipmentRow[]>).data ?? [])
        );
      } catch {
        setErrorsByGroup((prev) => new Map(prev).set(key, "Failed to load shipments"));
      } finally {
        setLoadingGroups((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [accessToken, expanded, linesQuery, shipmentsByGroup]
  );

  const colSpan = 6;

  return (
    <div className={`${styles.scrollWrap} ${tableWrapClassName}`.trim()}>
      <Table wrapperClassName={styles.tableInner}>
        <TableHead>
          <TableRow>
            <TableHeaderCell className={styles.headCell} aria-label="Expand" style={{ width: 40 }} />
            <TableHeaderCell className={styles.headCell}>PT – Plant</TableHeaderCell>
            <TableHeaderCell className={styles.headCell}>Item description</TableHeaderCell>
            <TableHeaderCell className={styles.headCell}>Unit</TableHeaderCell>
            <TableHeaderCell className={styles.headCell}>Total qty delivered</TableHeaderCell>
            <TableHeaderCell className={styles.headCell}>Total price (USD)</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const key = analyticsLineGroupKey(row);
            const isOpen = expanded.has(key);
            return (
              <Fragment key={key}>
                <TableRow>
                  <TableCell>
                    <button
                      type="button"
                      className={expandStyles.expandBtn}
                      aria-expanded={isOpen}
                      aria-label={isOpen ? "Collapse shipments" : "Expand shipments"}
                      onClick={() => toggleExpand(row)}
                    >
                      {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </button>
                  </TableCell>
                  <TableCell style={{ fontWeight: 600 }}>{linePtPlantLabel(row)}</TableCell>
                  <TableCell>{row.item_description}</TableCell>
                  <TableCell>{row.unit?.trim() ? row.unit.trim() : "—"}</TableCell>
                  <TableCell>{formatQtyDelivered(row.total_qty_delivered)}</TableCell>
                  <TableCell className={tdNumClassName}>
                    {formatUsd(idrToDashboardUsd(row.total_price_idr, idrPerUsd))}
                  </TableCell>
                </TableRow>
                {isOpen ? (
                  <GroupedShipmentExpandRows
                    shipments={shipmentsByGroup.get(key) ?? []}
                    loading={loadingGroups.has(key)}
                    error={errorsByGroup.get(key) ?? null}
                    shipmentDetailBasePath={shipmentDetailBasePath}
                    idrPerUsd={idrPerUsd}
                    formatUsd={formatUsd}
                    colSpan={colSpan}
                    showQtyValue
                    alignColumns
                    tdNumClassName={tdNumClassName}
                  />
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
