"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  buildExportCompletionSummary,
  type ExportCompletionListInput,
} from "@/lib/export-bulking-completion";
import styles from "./ProcessChecklist.module.css";

export function ProcessChecklist({
  input,
  compact = false,
  collapsible = false,
  defaultExpanded = false,
}: {
  input: ExportCompletionListInput;
  compact?: boolean;
  /** When true (detail page), checklist steps can be toggled; progress bar stays visible. */
  collapsible?: boolean;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const summary = buildExportCompletionSummary(input);
  const barTone =
    summary.percent >= 70 ? styles.barFillHigh : summary.percent >= 30 ? styles.barFillMid : styles.barFillLow;

  const isCollapsible = collapsible && !compact;
  const showList = !compact && (!isCollapsible || expanded);

  const meta = !compact && (
    <span className={styles.meta}>
      {summary.doneCount}/{summary.totalCount}
      {summary.isBusinessComplete && (
        <span className={styles.completeBadge}>Complete</span>
      )}
    </span>
  );

  const title = (
    <span className={styles.titleRow}>
      {isCollapsible && (
        <span className={styles.chevron} aria-hidden>
          {expanded ? <ChevronDown size={16} strokeWidth={2} /> : <ChevronRight size={16} strokeWidth={2} />}
        </span>
      )}
      <span className={styles.title}>{compact ? `${summary.percent}%` : "Process checklist"}</span>
    </span>
  );

  return (
    <div
      className={`${styles.wrap} ${compact ? styles.wrapCompact : ""} ${isCollapsible && !expanded ? styles.wrapCollapsed : ""}`}
      aria-label={`Process completion ${summary.percent}%`}
    >
      {isCollapsible ? (
        <button
          type="button"
          className={styles.headerButton}
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-controls="process-checklist-items"
        >
          {title}
          {meta}
        </button>
      ) : (
        <div className={styles.header}>
          {title}
          {meta}
        </div>
      )}
      <div
        className={styles.bar}
        role="progressbar"
        aria-valuenow={summary.percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`${styles.barFill} ${barTone}`} style={{ width: `${summary.percent}%` }} />
      </div>
      {showList && (
        <ul id="process-checklist-items" className={styles.list}>
          {summary.items.map((item) => (
            <li key={item.id} className={item.done ? styles.itemDone : styles.itemPending}>
              <span className={styles.check} aria-hidden>
                {item.done ? "✓" : "○"}
              </span>
              <span className={styles.itemLabel}>
                {item.label}
                {item.hint && !item.done && (
                  <span className={styles.hint}> — {item.hint}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
