"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./DateRangeField.module.css";

export type DateRangeFieldProps = {
  id?: string;
  label?: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseIsoDate(iso: string): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDisplayDate(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function formatRangeLabel(from: string, to: string, placeholder: string): string {
  if (from && to) return `${formatDisplayDate(from)} - ${formatDisplayDate(to)}`;
  if (from) return `${formatDisplayDate(from)} - …`;
  return placeholder;
}

function compareIso(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function getMonthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const startPad = (first.getDay() + 6) % 7;
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= lastDay; d++) cells.push(new Date(year, month, d));
  return cells;
}

export function DateRangeField({
  id: idProp,
  label,
  from,
  to,
  onChange,
  placeholder = "Select date range…",
  disabled = false,
  className,
}: DateRangeFieldProps) {
  const reactId = useId().replace(/:/g, "");
  const fieldId = idProp ?? `daterange-${reactId}`;
  const popoverId = `${fieldId}-popover`;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [hoverIso, setHoverIso] = useState<string | null>(null);

  const anchor = parseIsoDate(from) ?? parseIsoDate(to) ?? new Date();
  const [viewYear, setViewYear] = useState(anchor.getFullYear());
  const [viewMonth, setViewMonth] = useState(anchor.getMonth());

  useEffect(() => {
    if (!open) {
      setDraftFrom(from);
      setDraftTo(to);
      setHoverIso(null);
    }
  }, [open, from, to]);

  useEffect(() => {
    if (!open) return;
    const anchorDate = parseIsoDate(from) ?? parseIsoDate(to);
    if (anchorDate) {
      setViewYear(anchorDate.getFullYear());
      setViewMonth(anchorDate.getMonth());
    }
  }, [open, from, to]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const monthLabel = useMemo(
    () => new Date(viewYear, viewMonth, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    [viewYear, viewMonth],
  );

  const grid = useMemo(() => getMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const rangeEndPreview = draftFrom && !draftTo && hoverIso && compareIso(hoverIso, draftFrom) >= 0
    ? hoverIso
    : draftTo;

  const rangeStart = draftFrom && rangeEndPreview && compareIso(rangeEndPreview, draftFrom) < 0
    ? rangeEndPreview
    : draftFrom;
  const rangeEnd = draftFrom && rangeEndPreview && compareIso(rangeEndPreview, draftFrom) < 0
    ? draftFrom
    : rangeEndPreview;

  const applyRange = useCallback(
    (nextFrom: string, nextTo: string) => {
      setDraftFrom(nextFrom);
      setDraftTo(nextTo);
      onChange(nextFrom, nextTo);
      if (nextFrom && nextTo) setOpen(false);
    },
    [onChange],
  );

  function handleDayClick(day: Date) {
    const iso = toIsoDate(day);
    if (!draftFrom || (draftFrom && draftTo)) {
      applyRange(iso, "");
      return;
    }
    if (compareIso(iso, draftFrom) < 0) {
      applyRange(iso, draftFrom);
      return;
    }
    applyRange(draftFrom, iso);
  }

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  function dayInRange(iso: string): boolean {
    if (!rangeStart || !rangeEnd) return false;
    return compareIso(iso, rangeStart) >= 0 && compareIso(iso, rangeEnd) <= 0;
  }

  const displayText = formatRangeLabel(from, to, placeholder);
  const hasValue = Boolean(from && to);

  return (
    <div className={`${styles.wrap} ${className ?? ""}`} ref={wrapRef}>
      {label ? (
        <label className={styles.label} htmlFor={fieldId}>
          {label}
        </label>
      ) : null}
      <button
        id={fieldId}
        type="button"
        className={`${styles.trigger} ${hasValue ? styles.triggerFilled : ""}`}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => !disabled && setOpen((p) => !p)}
      >
        <Calendar size={18} strokeWidth={2} className={styles.triggerIcon} aria-hidden />
        <span className={hasValue ? styles.triggerText : styles.triggerPlaceholder}>{displayText}</span>
      </button>

      {open && (
        <div id={popoverId} className={styles.popover} role="dialog" aria-label={label ?? "Date range"}>
          <div className={styles.popoverHeader}>
            <button type="button" className={styles.navBtn} onClick={() => shiftMonth(-1)} aria-label="Previous month">
              <ChevronLeft size={18} />
            </button>
            <span className={styles.monthLabel}>{monthLabel}</span>
            <button type="button" className={styles.navBtn} onClick={() => shiftMonth(1)} aria-label="Next month">
              <ChevronRight size={18} />
            </button>
          </div>

          <div className={styles.weekdayRow}>
            {WEEKDAYS.map((d) => (
              <span key={d} className={styles.weekday}>
                {d}
              </span>
            ))}
          </div>

          <div className={styles.dayGrid}>
            {grid.map((day, idx) => {
              if (!day) return <span key={`empty-${idx}`} className={styles.dayEmpty} aria-hidden />;
              const iso = toIsoDate(day);
              const isStart = iso === rangeStart;
              const isEnd = iso === rangeEnd;
              const inRange = dayInRange(iso);
              const isToday = iso === toIsoDate(new Date());

              return (
                <button
                  key={iso}
                  type="button"
                  className={[
                    styles.dayBtn,
                    inRange ? styles.dayInRange : "",
                    isStart ? styles.dayStart : "",
                    isEnd ? styles.dayEnd : "",
                    isToday ? styles.dayToday : "",
                  ].filter(Boolean).join(" ")}
                  onMouseEnter={() => draftFrom && !draftTo && setHoverIso(iso)}
                  onMouseLeave={() => setHoverIso(null)}
                  onClick={() => handleDayClick(day)}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          <p className={styles.hint}>
            {!draftFrom || draftTo
              ? "Click a start date, then an end date."
              : "Now click the end date."}
          </p>

          {(draftFrom || draftTo) && (
            <div className={styles.popoverActions}>
              <button
                type="button"
                className={styles.clearBtn}
                onClick={() => {
                  applyRange("", "");
                  setOpen(false);
                }}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
