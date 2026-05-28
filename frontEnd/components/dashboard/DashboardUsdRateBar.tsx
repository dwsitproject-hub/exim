"use client";

import { useEffect, useState } from "react";
import { useDashboardCurrency } from "@/lib/dashboard-currency-context";
import styles from "./DashboardUsdRateBar.module.css";

export function DashboardUsdRateBar({ embedded }: { embedded?: boolean }) {
  const { idrPerUsd, applyIdrPerUsd } = useDashboardCurrency();
  const [draft, setDraft] = useState(String(idrPerUsd));

  useEffect(() => {
    setDraft(String(Math.round(idrPerUsd)));
  }, [idrPerUsd]);

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
          className={styles.input}
          type="number"
          min={1}
          step={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-describedby="dashboard-usd-rate-hint"
        />
        <button
          type="button"
          className={styles.apply}
          onClick={() => applyIdrPerUsd(draft)}
        >
          Apply
        </button>
      </div>
      <p id="dashboard-usd-rate-hint" className={styles.hint}>
        All dashboard money values use USD. Amounts stored in IDR (shipments, IDR POs) convert using this
        rate.
      </p>
    </div>
  );
}
