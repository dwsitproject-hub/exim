"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** Used only until DHM rate is loaded from the API (matches backend env fallback default). */
export const DEFAULT_IDR_PER_USD = 16_500;

/**
 * Convert a monetary amount to dashboard USD using PO/shipment currency.
 * IDR/RP amounts are divided by `idrPerUsd`. USD (and other non-IDR) amounts are treated as USD.
 */
export function amountToDashboardUsd(
  amount: number,
  currency: string | null | undefined,
  idrPerUsd: number
): number {
  const c = (currency ?? "").trim().toUpperCase();
  if (c === "IDR" || c === "RP") {
    return idrPerUsd > 0 ? amount / idrPerUsd : 0;
  }
  return amount;
}

export function idrToDashboardUsd(amountIdr: number, idrPerUsd: number): number {
  if (!Number.isFinite(amountIdr)) return 0;
  return idrPerUsd > 0 ? amountIdr / idrPerUsd : 0;
}

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const usdFormatterDecimals = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatDashboardUsd(amount: number, decimals?: boolean): string {
  if (decimals) return usdFormatterDecimals.format(amount);
  return usdFormatter.format(amount);
}

export type DashboardExchangeRateMeta = {
  idrPerUsd: number;
  exchangeRateDate: string | null;
};

type DashboardCurrencyContextValue = {
  idrPerUsd: number;
  exchangeRateDate: string | null;
  /** Sync USD display rate from financial-summary / DHM master lookup. */
  applyMasterExchangeRate: (meta: DashboardExchangeRateMeta) => void;
  formatUsd: (amount: number, decimals?: boolean) => string;
};

const DashboardCurrencyContext = createContext<DashboardCurrencyContextValue | null>(null);

export function DashboardCurrencyProvider({ children }: { children: ReactNode }) {
  const [idrPerUsd, setIdrPerUsd] = useState(DEFAULT_IDR_PER_USD);
  const [exchangeRateDate, setExchangeRateDate] = useState<string | null>(null);

  const applyMasterExchangeRate = useCallback((meta: DashboardExchangeRateMeta) => {
    const v = Number.isFinite(meta.idrPerUsd) && meta.idrPerUsd > 0 ? meta.idrPerUsd : DEFAULT_IDR_PER_USD;
    setIdrPerUsd(v);
    setExchangeRateDate(meta.exchangeRateDate ?? null);
  }, []);

  const value = useMemo(
    (): DashboardCurrencyContextValue => ({
      idrPerUsd,
      exchangeRateDate,
      applyMasterExchangeRate,
      formatUsd: formatDashboardUsd,
    }),
    [idrPerUsd, exchangeRateDate, applyMasterExchangeRate]
  );

  return (
    <DashboardCurrencyContext.Provider value={value}>{children}</DashboardCurrencyContext.Provider>
  );
}

export function useDashboardCurrency(): DashboardCurrencyContextValue {
  const ctx = useContext(DashboardCurrencyContext);
  if (!ctx) {
    throw new Error("useDashboardCurrency must be used within DashboardCurrencyProvider");
  }
  return ctx;
}

/** Safe hook when provider may be absent (e.g. tests) — falls back to defaults. */
export function useDashboardCurrencyOptional(): DashboardCurrencyContextValue {
  const ctx = useContext(DashboardCurrencyContext);
  return (
    ctx ?? {
      idrPerUsd: DEFAULT_IDR_PER_USD,
      exchangeRateDate: null,
      applyMasterExchangeRate: () => {},
      formatUsd: formatDashboardUsd,
    }
  );
}
