"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "eos.dashboard.idrPerUsd.v1";

/** Default IDR per 1 USD when none stored (user should set a current market rate). */
export const DEFAULT_IDR_PER_USD = 16_000;

export function readStoredIdrPerUsd(): number {
  if (typeof window === "undefined") return DEFAULT_IDR_PER_USD;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null || raw === "") return DEFAULT_IDR_PER_USD;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_IDR_PER_USD;
  } catch {
    return DEFAULT_IDR_PER_USD;
  }
}

export function writeStoredIdrPerUsd(n: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, String(n));
}

/**
 * Convert a monetary amount to dashboard USD using PO/shipment currency.
 * IDR/RP amounts are divided by `idrPerUsd`. USD (and other non-IDR) amounts are treated as USD.
 */
export function amountToDashboardUsd(
  amount: number,
  currency: string | null | undefined,
  idrPerUsd: number
): number {
  if (!Number.isFinite(amount)) return 0;
  const c = (currency ?? "").trim().toUpperCase();
  if (c === "IDR" || c === "RP") {
    return idrPerUsd > 0 ? amount / idrPerUsd : 0;
  }
  return amount;
}

/** Shipment `total_items_amount` and analytics line totals are stored in IDR. */
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

type DashboardCurrencyContextValue = {
  idrPerUsd: number;
  setIdrPerUsd: (n: number) => void;
  applyIdrPerUsd: (raw: string) => void;
  formatUsd: (amount: number, decimals?: boolean) => string;
};

const DashboardCurrencyContext = createContext<DashboardCurrencyContextValue | null>(null);

export function DashboardCurrencyProvider({ children }: { children: ReactNode }) {
  const [idrPerUsd, setIdrPerUsdState] = useState(DEFAULT_IDR_PER_USD);

  useEffect(() => {
    setIdrPerUsdState(readStoredIdrPerUsd());
  }, []);

  const setIdrPerUsd = useCallback((n: number) => {
    const v = Number.isFinite(n) && n > 0 ? n : DEFAULT_IDR_PER_USD;
    setIdrPerUsdState(v);
    writeStoredIdrPerUsd(v);
  }, []);

  const applyIdrPerUsd = useCallback((raw: string) => {
    const n = Number.parseFloat(raw.replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) setIdrPerUsd(n);
  }, [setIdrPerUsd]);

  const value = useMemo(
    (): DashboardCurrencyContextValue => ({
      idrPerUsd,
      setIdrPerUsd,
      applyIdrPerUsd,
      formatUsd: formatDashboardUsd,
    }),
    [idrPerUsd, setIdrPerUsd, applyIdrPerUsd]
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
      setIdrPerUsd: () => {},
      applyIdrPerUsd: () => {},
      formatUsd: formatDashboardUsd,
    }
  );
}
