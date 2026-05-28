"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import styles from "./ComboboxSelect.module.css";

export type ComboboxSelectProps = {
  id?: string;
  options: readonly string[];
  value: string;
  onChange: (next: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  "aria-label"?: string;
};

export function ComboboxSelect({
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
  "aria-label": ariaLabel,
}: ComboboxSelectProps) {
  const reactId = useId().replace(/:/g, "");
  const inputId = idProp ?? `combobox-${reactId}`;
  const listboxId = `listbox-${reactId}`;

  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(
    () => () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    },
    []
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
      const maxH = Math.max(120, Math.min(320, window.innerHeight - r.bottom - 12));
      setMenuPos({ top: r.bottom + 4, left: r.left, width: r.width, maxH });
    }
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, disabled]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = options.filter(
      (o) => o.trim() !== "" && !o.includes("\u00a0")
    );
    if (!q) return base;
    return base.filter((o) => o.toLowerCase().includes(q));
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
        onChange("");
        setQuery("");
        return;
      }
      if (t && options.includes(t)) {
        onChange(t);
        setQuery(t);
        return;
      }
      if (t && !options.includes(t)) {
        setQuery(value);
      }
      if (!t && !allowEmpty) {
        setQuery(value);
      }
    }, 120);
  }

  function pick(next: string) {
    cancelBlur();
    onChange(next);
    setQuery(next);
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
      setQuery(value);
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
        className={styles.list}
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
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick("")}
            >
              {emptyLabel}
            </button>
          </li>
        )}
        {filtered.map((opt) => (
          <li key={opt} role="presentation" className={styles.li}>
            <button
              type="button"
              role="option"
              tabIndex={-1}
              className={styles.option}
              aria-selected={opt === value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(opt)}
            >
              {opt}
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className={styles.emptyHint} role="presentation">
            No matches
          </li>
        )}
      </ul>,
      document.body
    );

  return (
    <div className={`${styles.wrap} ${className ?? ""}`}>
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
