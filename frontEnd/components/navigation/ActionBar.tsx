"use client";

import styles from "./ActionBar.module.css";

export interface ActionBarProps {
  /** Search input (controlled by parent) */
  search?: React.ReactNode;
  /** Filter placeholder or filter UI */
  filters?: React.ReactNode;
  /**
   * Put filters on their own full-width row under search/actions.
   * Use when filter UI is wide (e.g. multiple date ranges) so it cannot overflow the bar or overlap primary actions.
   */
  filtersFullWidth?: boolean;
  /** Primary action (e.g. Create button) */
  primaryAction?: React.ReactNode;
  /** Extra actions on the right */
  children?: React.ReactNode;
}

export function ActionBar({
  search,
  filters,
  filtersFullWidth = false,
  primaryAction,
  children,
}: ActionBarProps) {
  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        {search && <div className={styles.searchSlot}>{search}</div>}
        {filters != null && (
          <div
            className={
              filtersFullWidth ? `${styles.filtersSlot} ${styles.filtersSlotFull}` : styles.filtersSlot
            }
          >
            {filters}
          </div>
        )}
      </div>
      <div className={styles.right}>
        {primaryAction}
        {children}
      </div>
    </div>
  );
}
