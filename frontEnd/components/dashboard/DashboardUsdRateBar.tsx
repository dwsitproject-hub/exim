"use client";

import { useEffect, useState } from "react";
import { useDashboardCurrency } from "@/lib/dashboard-currency-context";
import styles from "./DashboardUsdRateBar.module.css";

export function DashboardUsdRateBar({ embedded }: { embedded?: boolean }) {
  const { idrPerUsd, applyIdrPerUsd } = useDashboardCurrency();
  const [draft, setDraft] = useState(String(idrPerUsd));
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div
      className={embedded ? styles.wrapEmbedded : styles.wrap}
      aria-label="Dashboard USD conversion"
    >
      <div className={styles.row}>
        <label className={styles.label} htmlFor="dashboard-idr-per-usd">
          IDR per 1 USD
        </label>
        <input
          id="dashboard-idr-per-usd"
          className={`${styles.input} ${error ? styles.inputError : ""}`.trim()}
          type="number"
          min={1}
          step={1}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          aria-describedby="dashboard-usd-rate-hint"
          aria-invalid={error ? true : undefined}
        />
        <button type="button" className={styles.apply} onClick={handleApply}>
          Apply
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <p id="dashboard-usd-rate-hint" className={styles.hint}>
        All dashboard money values use USD. Amounts stored in IDR (shipments, IDR POs) convert using this
        rate.
      </p>
    </div>
  );
}
