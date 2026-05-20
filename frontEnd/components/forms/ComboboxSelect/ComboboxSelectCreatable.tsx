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

export type ComboboxSelectCreatableProps = {
  id?: string;
  options: readonly string[];
  value: string;
  onChange: (next: string) => void;
  onCreateOption?: (value: string) => Promise<boolean> | boolean;
  placeholder?: string;
  disabled?: boolean;
  /**
   * When true the component won't reset the typed query on blur even if the
   * value isn't in the options list yet. Use this when a parent component is
   * managing an async "confirm creation" flow — e.g. showing an inline confirm
   * card while the new option name is being confirmed.
   */
  externallyManaged?: boolean;
  className?: string;
  inputClassName?: string;
  "aria-label"?: string;
};

/**
 * Like ComboboxSelect but allows creating new options.
 * When the user types a value not in the list and selects the
 * "+ Add ..." option, calls onCreateOption. If it returns true
 * the value is accepted; otherwise it is left for the parent to manage.
 */
export function ComboboxSelectCreatable({
  id: idProp,
  options,
  value,
  onChange,
  onCreateOption,
  placeholder = "Type to search…",
  disabled = false,
  externallyManaged = false,
  className,
  inputClassName,
  "aria-label": ariaLabel,
}: ComboboxSelectCreatableProps) {
  const reactId = useId().replace(/:/g, "");
  const inputId = idProp ?? `creatablecombo-${reactId}`;
  const listboxId = `creatablelistbox-${reactId}`;

  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep a ref to externallyManaged so blur timer (closure) always sees latest value
  const externallyManagedRef = useRef(externallyManaged);
  externallyManagedRef.current = externallyManaged;

  useEffect(() => {
    setQuery(value);
  }, [value]);

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
    const base = options.filter((o) => o.trim() !== "");
    if (!q) return base;
    return base.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  const showCreateOption = useMemo(() => {
    if (!onCreateOption) return false;
    const q = query.trim();
    if (!q) return false;
    return !options.some((o) => o.toLowerCase() === q.toLowerCase());
  }, [options, query, onCreateOption]);

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
      if (t && options.some((o) => o.toLowerCase() === t.toLowerCase())) {
        const exact = options.find((o) => o.toLowerCase() === t.toLowerCase()) ?? t;
        // Only fire onChange if value actually changed — prevents re-triggering
        // parent side-effects (e.g. clearing dependent dropdowns) after pick().
        if (exact !== value) onChange(exact);
        setQuery(exact);
        return;
      }
      // If a parent confirm flow is active, don't reset the query —
      // the parent will update the value prop when the flow completes.
      if (!externallyManagedRef.current) {
        setQuery(value);
      }
    }, 150);
  }

  function pick(next: string) {
    cancelBlur();
    onChange(next);
    setQuery(next);
    setOpen(false);
  }

  async function handleCreateOption() {
    cancelBlur();
    const q = query.trim();
    if (!q || !onCreateOption) return;
    // Close the dropdown immediately so the parent confirm UI is unobstructed
    setOpen(false);
    const ok = await onCreateOption(q);
    if (ok) {
      // Creation confirmed synchronously or via resolved promise
      onChange(q);
      setQuery(q);
    }
    // If ok=false: the parent manages the value (e.g. via inline confirm card).
    // Don't reset the query here — parent will update via the value prop.
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
    if (e.key === "Enter" && showCreateOption) {
      e.preventDefault();
      handleCreateOption();
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
        {showCreateOption && (
          <li role="presentation" className={styles.li}>
            <button
              type="button"
              role="option"
              tabIndex={-1}
              className={`${styles.option} ${styles.optionCreate}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleCreateOption}
            >
              + Add &ldquo;{query.trim()}&rdquo;
            </button>
          </li>
        )}
        {filtered.length === 0 && !showCreateOption && (
          <li className={styles.emptyHint} role="presentation">
            No matches
          </li>
        )}
      </ul>,
      document.body,
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
