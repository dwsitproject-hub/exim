"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import styles from "./ComboboxSelect.module.css";

export type ComboboxSelectByIdOption = {
  id: string;
  label: string;
  sublabel?: string;
};

export type ComboboxSelectByIdProps = {
  id?: string;
  options: readonly ComboboxSelectByIdOption[];
  value: string;
  onChange: (nextId: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  listClassName?: string;
  /** Dropdown panel is at least this wide (defaults to input width). */
  listMinWidth?: number;
  "aria-label"?: string;
  onClick?: (e: MouseEvent) => void;
};

function labelForValue(options: readonly ComboboxSelectByIdOption[], value: string): string {
  if (!value) return "";
  return options.find((o) => o.id === value)?.label ?? "";
}

export function ComboboxSelectById({
  id: idProp,
  options,
  value,
  onChange,
  allowEmpty = false,
  emptyLabel = "— Select —",
  placeholder = "Type to search…",
  disabled = false,
  className,
  inputClassName,
  listClassName,
  listMinWidth,
  "aria-label": ariaLabel,
  onClick,
}: ComboboxSelectByIdProps) {
  const reactId = useId().replace(/:/g, "");
  const inputId = idProp ?? `combobox-id-${reactId}`;
  const listboxId = `listbox-id-${reactId}`;

  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(() => labelForValue(options, value));
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(labelForValue(options, value));
  }, [options, value]);

  useEffect(
    () => () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    },
    [],
  );

  useLayoutEffect(() => {
    if (!open || disabled) {
      setMenuPos(null);
      return;
    }
    function measure() {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const margin = 8;
      const maxH = Math.max(120, Math.min(320, window.innerHeight - r.bottom - 12));
      const width = Math.max(r.width, listMinWidth ?? r.width);
      let left = r.left;
      if (left + width > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - width - margin);
      }
      setMenuPos({ top: r.bottom + 4, left, width, maxH });
    }
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, disabled, listMinWidth]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = options.filter((o) => o.id.trim() !== "" && o.label.trim() !== "");
    if (!q) return base;
    return base.filter((o) => {
      const hay = `${o.label} ${o.sublabel ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, query]);

  function cancelBlur() {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  }

  function scheduleBlurClose() {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => {
      blurTimer.current = null;
      setOpen(false);
      const t = query.trim();
      if (allowEmpty && t === "") {
        if (value !== "") onChange("");
        setQuery("");
        return;
      }
      const exact = options.find((o) => o.label.toLowerCase() === t.toLowerCase());
      if (exact) {
        if (exact.id !== value) onChange(exact.id);
        setQuery(exact.label);
        return;
      }
      setQuery(labelForValue(options, value));
    }, 120);
  }

  function pick(next: ComboboxSelectByIdOption | null) {
    cancelBlur();
    const nextId = next?.id ?? "";
    onChange(nextId);
    setQuery(next?.label ?? "");
    setOpen(false);
  }

  function onInputChange(next: string) {
    setQuery(next);
    setOpen(true);
  }

  function onFocus() {
    cancelBlur();
    setOpen(true);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery(labelForValue(options, value));
    }
  }

  const portal =
    open &&
    !disabled &&
    menuPos &&
    typeof document !== "undefined" &&
    createPortal(
      <ul
        id={listboxId}
        role="listbox"
        className={`${styles.list} ${listClassName ?? ""}`.trim()}
        style={{
          position: "fixed",
          top: menuPos.top,
          left: menuPos.left,
          width: menuPos.width,
          maxHeight: menuPos.maxH,
        }}
      >
        {allowEmpty && (
          <li key="__empty" role="presentation" className={styles.li}>
            <button
              type="button"
              role="option"
              tabIndex={-1}
              className={styles.option}
              aria-selected={value === ""}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(null)}
            >
              {emptyLabel}
            </button>
          </li>
        )}
        {filtered.map((opt) => (
          <li key={opt.id} role="presentation" className={styles.li}>
            <button
              type="button"
              role="option"
              tabIndex={-1}
              className={styles.option}
              aria-selected={opt.id === value}
              title={opt.sublabel ? `${opt.label} — ${opt.sublabel}` : opt.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(opt)}
            >
              <span className={styles.optionLabel}>{opt.label}</span>
              {opt.sublabel ? (
                <span className={styles.optionSublabel}>{opt.sublabel}</span>
              ) : null}
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className={styles.emptyHint} role="presentation">
            No matches
          </li>
        )}
      </ul>,
      document.body,
    );

  return (
    <div
      className={`${styles.wrap} ${className ?? ""}`}
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        className={`${styles.input} ${inputClassName ?? ""}`}
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => onInputChange(e.target.value)}
        onFocus={onFocus}
        onBlur={scheduleBlurClose}
        onKeyDown={onKeyDown}
      />
      {portal}
    </div>
  );
}
