"use client";

import {
  buildExportCompletionSummary,
  type ExportCompletionListInput,
} from "@/lib/export-bulking-completion";
import styles from "./ProcessChecklist.module.css";

export function ProcessChecklist({
  input,
  compact = false,
}: {
  input: ExportCompletionListInput;
  compact?: boolean;
}) {
  const summary = buildExportCompletionSummary(input);

  return (
    <div
      className={`${styles.wrap} ${compact ? styles.wrapCompact : ""}`}
      aria-label={`Process completion ${summary.percent}%`}
    >
      <div className={styles.header}>
        <span className={styles.title}>{compact ? `${summary.percent}%` : "Process checklist"}</span>
        {!compact && (
          <span className={styles.meta}>
            {summary.doneCount}/{summary.totalCount}
            {summary.isBusinessComplete && (
              <span className={styles.completeBadge}>Complete</span>
            )}
          </span>
        )}
      </div>
      <div
        className={styles.bar}
        role="progressbar"
        aria-valuenow={summary.percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={styles.barFill} style={{ width: `${summary.percent}%` }} />
      </div>
      {!compact && (
        <ul className={styles.list}>
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
