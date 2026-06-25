"use client";

import { useEffect, useState } from "react";
import { useDashboardCurrency } from "@/lib/dashboard-currency-context";
import styles from "./DashboardUsdRateBar.module.css";

export function DashboardUsdRateBar({
  embedded,
  compact,
  hint = "All dashboard money values use USD. Amounts stored in IDR (shipments, IDR POs) convert using this rate.",
}: {
  embedded?: boolean;
  compact?: boolean;
  hint?: string;
}) {
  const { idrPerUsd, applyIdrPerUsd } = useDashboardCurrency();
  const [draft, setDraft] = useState(String(idrPerUsd));
  const [error, setError] = useState<string | null>(null);
  const inputId = compact ? "financial-idr-per-usd" : "dashboard-idr-per-usd";
  const showHint = !compact;

  useEffect(() => {
    setDraft(String(Math.round(idrPerUsd)));
  }, [idrPerUsd]);

  function handleApply() {
    if (applyIdrPerUsd(draft)) {
      setError(null);
      return;
    }
    setError("Enter a positive number (e.g. 16000).");
    setDraft(String(Math.round(idrPerUsd)));
  }

  const wrapClass = compact
    ? styles.wrapCompact
    : embedded
      ? styles.wrapEmbedded
      : styles.wrap;

  return (
    <div className={wrapClass} aria-label="Dashboard USD conversion">
      <div className={styles.row}>
        <label className={styles.label} htmlFor={inputId}>
          {compact ? "IDR/USD" : "IDR per 1 USD"}
        </label>
        <input
          id={inputId}
          className={`${styles.input} ${error ? styles.inputError : ""}`.trim()}
          type="number"
          min={1}
          step={1}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          aria-describedby={showHint ? "dashboard-usd-rate-hint" : undefined}
          aria-invalid={error ? true : undefined}
          title={error ?? "IDR per 1 USD"}
        />
        <button type="button" className={styles.apply} onClick={handleApply}>
          Apply
        </button>
      </div>
      {error && compact && (
        <p className={styles.errorCompact} role="alert">
          {error}
        </p>
      )}
      {error && !compact && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {showHint && (
        <p id="dashboard-usd-rate-hint" className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}
