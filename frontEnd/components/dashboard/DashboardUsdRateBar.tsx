"use client";

import { useDashboardCurrency } from "@/lib/dashboard-currency-context";
import styles from "./DashboardUsdRateBar.module.css";

/** Read-only: USD dashboard amounts use the DHM USD→IDR rate for the report period. */
export function DashboardUsdRateBar({
  embedded,
  compact,
}: {
  embedded?: boolean;
  compact?: boolean;
  hint?: string;
}) {
  const { idrPerUsd, exchangeRateDate } = useDashboardCurrency();

  const wrapClass = compact
    ? styles.wrapCompact
    : embedded
      ? styles.wrapEmbedded
      : styles.wrap;

  const rateLabel = Number.isFinite(idrPerUsd)
    ? Math.round(idrPerUsd).toLocaleString("en-US")
    : "—";

  return (
    <div className={wrapClass} aria-label="Dashboard USD conversion rate from master data">
      <div className={styles.row}>
        <span className={styles.label}>{compact ? "IDR/USD" : "IDR per 1 USD"}</span>
        <span className={styles.rateValue} title="From DHM exchange rate master">
          {rateLabel}
        </span>
        {exchangeRateDate && (
          <span className={styles.rateDate} title="Rate effective date">
            {exchangeRateDate}
          </span>
        )}
      </div>
      {!compact && (
        <p className={styles.hint}>
          Rate from master data (USD→IDR, on or before the report end date). Amounts in IDR convert to
          USD using this value.
        </p>
      )}
    </div>
  );
}
