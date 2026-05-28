"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./TableColumnFilterPicker.module.css";

type Props = {
  columnLabel: string;
  /** Unique values already normalized to display strings. */
  options: readonly string[];
  selected: readonly string[];
  onChange: (nextSelected: string[]) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When true, filter icon is hidden until the parent header cell is hovered or focused within. */
  revealIconOnHover?: boolean;
  /** Render option label in the list (value remains `options` item for selection). */
  formatOptionLabel?: (value: string) => string;
};

function FilterIcon({ active }: { active: boolean }) {
  const stroke = active ? "#c43a31" : "#6b6b6b";
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden focusable="false">
      <path
        d="M4 6h16M7 12h10M10 18h4"
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TableColumnFilterPicker({
  columnLabel,
  options,
  selected,
  onChange,
  open,
  onOpenChange,
  revealIconOnHover = false,
  formatOptionLabel,
}: Props) {
  const baseId = useId();
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((v) => v.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const anchor = rootRef.current;
      const panel = panelRef.current;
      if (!anchor) return;
      if (!(e.target instanceof Node)) return;
      const insideAnchor = anchor.contains(e.target);
      const insidePanel = panel ? panel.contains(e.target) : false;
      if (!insideAnchor && !insidePanel) {
        onOpenChange(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const anchor = rootRef.current;
    if (!anchor) return;

    const update = () => {
      const rect = anchor.getBoundingClientRect();
      // initial guess: right-align panel to icon button
      const panel = panelRef.current;
      const panelWidth = panel?.offsetWidth ?? 320;
      const panelHeight = panel?.offsetHeight ?? 260;

      const margin = 8;
      let left = rect.right - panelWidth;
      let top = rect.bottom + 6;

      // Keep inside viewport horizontally
      left = Math.max(margin, Math.min(left, window.innerWidth - panelWidth - margin));

      // If dropdown would go below viewport, flip above
      if (top + panelHeight + margin > window.innerHeight) {
        top = rect.top - panelHeight - 6;
      }
      top = Math.max(margin, Math.min(top, window.innerHeight - panelHeight - margin));

      setPanelPos({ top, left });
    };

    // Wait a tick so panelRef has size
    const raf = window.requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  function toggleValue(v: string) {
    if (selectedSet.has(v)) onChange(selected.filter((x) => x !== v));
    else onChange([...selected, v]);
  }

  function clear() {
    onChange([]);
  }

  function selectAllVisible() {
    const next = Array.from(new Set([...selected, ...filteredOptions]));
    onChange(next);
  }

  const activeCount = selected.length;

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={`${styles.iconBtn} ${revealIconOnHover ? styles.iconBtnReveal : ""}`.trim()}
        data-filter-column-icon={revealIconOnHover ? "true" : undefined}
        aria-label={`Filter ${columnLabel}`}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <FilterIcon active={activeCount > 0} />
        {activeCount > 0 ? <span className={styles.badge}>{activeCount}</span> : null}
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            className={styles.panel}
            role="group"
            aria-label={`Filter values for ${columnLabel}`}
            style={panelPos ? { top: panelPos.top, left: panelPos.left } : undefined}
          >
            <input
              type="search"
              className={styles.search}
              placeholder="Search values…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={`Search filter values for ${columnLabel}`}
            />
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={selectAllVisible}
                disabled={filteredOptions.length === 0}
              >
                Select all
              </button>
              <button type="button" className={styles.actionBtn} onClick={clear} disabled={activeCount === 0}>
                Clear
              </button>
            </div>
            {filteredOptions.length === 0 ? (
              <p className={styles.empty}>No values.</p>
            ) : (
              <ul className={styles.list}>
                {filteredOptions.map((v) => {
                  const id = `${baseId}-${v}`;
                  const checked = selectedSet.has(v);
                  return (
                    <li key={v} className={styles.item}>
                      <label className={styles.label} htmlFor={id}>
                        <input
                          id={id}
                          type="checkbox"
                          className={styles.checkbox}
                          checked={checked}
                          onChange={() => toggleValue(v)}
                        />
                        <span>{formatOptionLabel ? formatOptionLabel(v) : v}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

