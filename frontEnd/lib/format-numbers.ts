/** Format a number with grouping; omit decimals when the value is a whole number. */
export function formatNumberDisplay(n: number, maxFractionDigits = 10): string {
  if (Number.isNaN(n)) return String(n);
  const rounded = Math.round(n * 1e12) / 1e12;
  const isWhole = Math.abs(rounded - Math.round(rounded)) < 1e-9;
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: isWhole ? 0 : maxFractionDigits,
  }).format(rounded);
}

/** Currency / unit price: up to 2 decimals, none when whole. */
export function formatMoneyDisplay(n: number): string {
  return formatNumberDisplay(n, 2);
}

/** Quantity: up to 3 decimals, none when whole. */
export function formatQuantityDisplay(n: number): string {
  return formatNumberDisplay(n, 3);
}
