"use client";

import { Fragment } from "react";
import { MessageSquare } from "lucide-react";
import { formatNumberDisplay } from "@/lib/format-numbers";
import { isReconDiffPctCaution } from "@/lib/export-bulking-loading-validation";
import {
  calcReconciliationDiff,
  calcReconciliationDiffPct,
  resolveInheritedBlFigure,
  type ReconciliationBlSource,
  type ReconciliationLineDraft,
} from "@/lib/export-bulking-reconciliation";
import styles from "./QuantityReconciliationTable.module.css";

function formatPercentDisplay(value: number, maxFractionDigits = 4): string {
  return `${formatNumberDisplay(value, maxFractionDigits)} %`;
}

function formatInheritedDisplay(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "—";
  const n = Number(trimmed.replace(/,/g, ""));
  if (!Number.isNaN(n)) return formatNumberDisplay(n, 4);
  return trimmed;
}

export type QuantityReconciliationTableProps = {
  lines: ReconciliationLineDraft[];
  blSource: ReconciliationBlSource;
  expandedRemarkIds: ReadonlySet<string>;
  onLinesChange: (lines: ReconciliationLineDraft[]) => void;
  onBlSourceChange: (source: ReconciliationBlSource) => void;
  onToggleRemarks: (lineId: string) => void;
};

export function QuantityReconciliationTable({
  lines,
  blSource,
  expandedRemarkIds,
  onLinesChange,
  onBlSourceChange,
  onToggleRemarks,
}: QuantityReconciliationTableProps) {
  const updateLine = (idx: number, patch: Partial<ReconciliationLineDraft>) => {
    onLinesChange(lines.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const blSourceLabel = blSource === "shore" ? "Shore" : "Ship";

  return (
    <div className={styles.reconTableWrap}>
      <table className={styles.reconTable}>
        <thead>
          <tr>
            <th scope="col">Cargo</th>
            <th scope="col" className={`${styles.blHeaderCell} ${styles.numCol}`}>
              <span className={styles.blHeaderLabel}>B/L Figure (MT)</span>
              <div className={styles.blSourceToggle} role="group" aria-label="B/L figure source">
                <button
                  type="button"
                  className={`${styles.blSourceOption}${blSource === "shore" ? ` ${styles.blSourceOptionActive}` : ""}`}
                  aria-pressed={blSource === "shore"}
                  onClick={() => onBlSourceChange("shore")}
                >
                  Shore
                </button>
                <button
                  type="button"
                  className={`${styles.blSourceOption}${blSource === "ship" ? ` ${styles.blSourceOptionActive}` : ""}`}
                  aria-pressed={blSource === "ship"}
                  onClick={() => onBlSourceChange("ship")}
                >
                  Ship
                </button>
              </div>
            </th>
            <th scope="col" className={styles.numCol}>Shore Figure (MT)</th>
            <th scope="col" className={styles.numCol}>Ship Figure (MT)</th>
            <th scope="col" className={styles.numCol}>Diff (MT)</th>
            <th scope="col" className={styles.numCol}>Diff %</th>
            <th scope="col" className={styles.actionsCol}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((row, idx) => {
            const inheritedBl = resolveInheritedBlFigure(row, blSource);
            const diff = calcReconciliationDiff(inheritedBl, row.ship_figure);
            const diffPct = calcReconciliationDiffPct(diff, inheritedBl);
            const caution = isReconDiffPctCaution(diffPct);
            const hasRemarks = row.remarks.trim().length > 0;
            const remarksExpanded = expandedRemarkIds.has(row.id);
            const cargoLabel = row.cargo_name || `Cargo ${idx + 1}`;

            return (
              <Fragment key={row.id}>
                <tr className={`${styles.dataRow}${caution ? ` ${styles.reconRowCaution}` : ""}`}>
                  <td className={styles.reconCargoCell}>
                    <span className={styles.reconCargoName}>
                      {cargoLabel}
                      {row.item_description ? ` / ${row.item_description}` : ""}
                    </span>
                  </td>
                  <td className={`${styles.blInheritedCell} ${styles.numCol}`}>
                    <span className={styles.blInheritedValue}>{formatInheritedDisplay(inheritedBl)}</span>
                    <span className={styles.blInheritedHint}>(Inherited from {blSourceLabel})</span>
                  </td>
                  <td className={styles.numCol}>
                    <input
                      className={styles.reconInput}
                      type="text"
                      inputMode="decimal"
                      value={row.shore_figure}
                      onChange={(e) => updateLine(idx, { shore_figure: e.target.value })}
                      aria-label={`Shore Figure for ${cargoLabel}`}
                    />
                  </td>
                  <td className={styles.numCol}>
                    <input
                      className={styles.reconInput}
                      type="text"
                      inputMode="decimal"
                      value={row.ship_figure}
                      onChange={(e) => updateLine(idx, { ship_figure: e.target.value })}
                      aria-label={`Ship Figure for ${cargoLabel}`}
                    />
                  </td>
                  <td className={styles.numCol}>
                    <span className={`${styles.reconReadonly}${caution ? ` ${styles.reconReadonlyCaution}` : ""}`}>
                      {diff != null ? formatNumberDisplay(diff, 4) : "—"}
                    </span>
                  </td>
                  <td className={styles.numCol}>
                    <span className={`${styles.reconReadonly}${caution ? ` ${styles.reconReadonlyCaution}` : ""}`}>
                      {diffPct != null ? formatPercentDisplay(diffPct, 4) : "—"}
                    </span>
                  </td>
                  <td className={styles.actionsCol}>
                    <button
                      type="button"
                      className={`${styles.remarksToggle}${
                        remarksExpanded
                          ? ` ${styles.remarksToggleExpanded}`
                          : hasRemarks
                            ? ` ${styles.remarksToggleActive}`
                            : ""
                      }`}
                      onClick={() => onToggleRemarks(row.id)}
                      aria-expanded={remarksExpanded}
                      aria-label={
                        hasRemarks
                          ? `Remarks for ${cargoLabel} (has notes)`
                          : `Add remarks for ${cargoLabel}`
                      }
                      title={remarksExpanded ? "Hide remarks" : "Add remarks"}
                    >
                      <MessageSquare size={16} strokeWidth={hasRemarks ? 2.25 : 1.75} aria-hidden />
                    </button>
                  </td>
                </tr>
                <tr className={styles.remarksRow}>
                  <td colSpan={7}>
                    <div
                      className={`${styles.remarksPanelOuter}${
                        remarksExpanded ? ` ${styles.remarksPanelOuterExpanded}` : ` ${styles.remarksPanelOuterCollapsed}`
                      }`}
                    >
                      <div className={styles.remarksPanelInner}>
                        <div className={styles.remarksPanelContent}>
                          <textarea
                            className={styles.remarksTextarea}
                            value={row.remarks}
                            onChange={(e) => updateLine(idx, { remarks: e.target.value })}
                            placeholder="Optional Remarks: Type any additional notes or discrepancies here..."
                            aria-label={`Optional remarks for ${cargoLabel}`}
                            rows={3}
                          />
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
