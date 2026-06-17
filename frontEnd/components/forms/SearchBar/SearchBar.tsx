"use client";

import type { FormEvent } from "react";
import { Search } from "lucide-react";
import styles from "./SearchBar.module.css";

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  /** Accessible name when placeholder is not enough */
  ariaLabel?: string;
  submitLabel?: string;
  /** Icon-only submit (export bulking style) */
  iconSubmit?: boolean;
  wide?: boolean;
  /** Fill available width (e.g. inside ActionBar on mobile). */
  fluid?: boolean;
  disabled?: boolean;
  className?: string;
}

export function SearchBar({
  value,
  onChange,
  onSubmit,
  placeholder = "Search…",
  ariaLabel = "Search",
  submitLabel = "Search",
  iconSubmit = false,
  wide = false,
  fluid = false,
  disabled = false,
  className = "",
}: SearchBarProps) {
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`${styles.form} ${wide ? styles.formWide : ""} ${fluid ? styles.formFluid : ""} ${className}`.trim()}
    >
      <input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={styles.input}
        aria-label={ariaLabel}
        disabled={disabled}
      />
      <button
        type="submit"
        className={iconSubmit ? `${styles.submit} ${styles.iconSubmit}` : styles.submit}
        disabled={disabled}
        aria-label={iconSubmit ? submitLabel : undefined}
      >
        {iconSubmit ? <Search size={16} strokeWidth={2} aria-hidden /> : submitLabel}
      </button>
    </form>
  );
}
