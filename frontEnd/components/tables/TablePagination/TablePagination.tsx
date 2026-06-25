"use client";

import styles from "./TablePagination.module.css";

export interface TablePaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Optional total row count shown after page info */
  totalItems?: number;
  /** Noun after total count, e.g. "shipments" → " (42 shipments total)" */
  itemNoun?: string;
  /** When true, pagination remains visible on a single page */
  showWhenSinglePage?: boolean;
  className?: string;
  previousLabel?: string;
  nextLabel?: string;
}

export function TablePagination({
  page,
  totalPages,
  onPageChange,
  totalItems,
  itemNoun,
  showWhenSinglePage = false,
  className = "",
  previousLabel = "Previous",
  nextLabel = "Next",
}: TablePaginationProps) {
  if (totalPages <= 0) return null;
  if (totalPages <= 1 && !showWhenSinglePage) return null;

  const totalSuffix =
    totalItems != null
      ? itemNoun
        ? ` · ${totalItems} ${itemNoun}`
        : ` (${totalItems} total)`
      : "";

  return (
    <nav className={`${styles.bar} ${className}`.trim()} aria-label="Pagination">
      <button
        type="button"
        className={styles.button}
        disabled={page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
      >
        {previousLabel}
      </button>
      <span className={styles.info}>
        Page {page} of {totalPages}
        {totalSuffix}
      </span>
      <button
        type="button"
        className={styles.button}
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        {nextLabel}
      </button>
    </nav>
  );
}
