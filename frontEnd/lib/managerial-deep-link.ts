/**
 * Central URL builders and query keys for dashboard “Exception & alert” deep links.
 * List routes live under `/dashboard/po` and `/dashboard/shipments` (not root `/purchase-orders`).
 */

export const MANAGERIAL_FILTER_PARAM = "filter";
export const MANAGERIAL_DAYS_PARAM = "days";

export const MANAGERIAL_LIST_FILTERS = {
  /** PO list: NEW_PO_DETECTED, unclaimed, detected > N days ago (default 2 ≈ 48h). */
  stale: "stale",
  /** PO list: no active shipment mapping. */
  uncoupled: "uncoupled",
  /** Shipment list: remaining line qty globally > 0, shipment updated > N days ago. */
  dormantRemaining: "dormant_remaining",
} as const;

export type ManagerialListFilter = (typeof MANAGERIAL_LIST_FILTERS)[keyof typeof MANAGERIAL_LIST_FILTERS];

export const DEFAULT_STALE_DAYS = 2;
export const DEFAULT_DORMANT_DAYS = 30;

export function buildPoListDeepLink(
  filter: typeof MANAGERIAL_LIST_FILTERS.stale | typeof MANAGERIAL_LIST_FILTERS.uncoupled,
  days?: number
): string {
  const p = new URLSearchParams();
  p.set(MANAGERIAL_FILTER_PARAM, filter);
  if (filter === MANAGERIAL_LIST_FILTERS.stale) {
    p.set(MANAGERIAL_DAYS_PARAM, String(days ?? DEFAULT_STALE_DAYS));
  }
  return `/dashboard/po?${p.toString()}`;
}

export function buildShipmentListDormantDeepLink(days = DEFAULT_DORMANT_DAYS): string {
  const p = new URLSearchParams();
  p.set(MANAGERIAL_FILTER_PARAM, MANAGERIAL_LIST_FILTERS.dormantRemaining);
  p.set(MANAGERIAL_DAYS_PARAM, String(days));
  return `/dashboard/shipments?${p.toString()}`;
}

export function managerialFilterTooltip(count: number): string {
  return `Click to view these ${count} records in the list view.`;
}
