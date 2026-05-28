/**
 * Deep links from the Shipment performance card to the shipment list with a status filter.
 */

import { computeOnTimeStatus } from "@/lib/shipment-performance-on-time";
import { formatShipmentStatusTitleCase } from "@/lib/shipment-status-title-case";
import type { ShipmentListItem, ShipmentStatus } from "@/types/shipments";

/** Preview + navigate targets from the Shipment performance card (status tile, KPI, segment). */
export type ShipmentPerformanceDeepLinkPreview =
  | { kind: "status"; status: ShipmentStatus }
  | { kind: "completion" }
  | { kind: "late" };

export function filterShipmentListItemsForPerformancePreview(
  items: ShipmentListItem[],
  preview: ShipmentPerformanceDeepLinkPreview
): ShipmentListItem[] {
  if (preview.kind === "completion") {
    return items.filter((r) => r.current_status === "DELIVERED");
  }
  if (preview.kind === "status") {
    return items.filter((r) => r.current_status === preview.status);
  }
  return items.filter(
    (r) => computeOnTimeStatus(r.current_status, r.eta).kind === "late"
  );
}

export function shipmentPerformanceDeepLinkPreviewTitle(
  preview: ShipmentPerformanceDeepLinkPreview
): string {
  if (preview.kind === "completion") {
    return "Delivered shipments";
  }
  if (preview.kind === "late") {
    return "Late / delayed (overdue ETA)";
  }
  return formatShipmentStatusTitleCase(preview.status);
}

export function buildShipmentPerformanceDeepLinkHref(
  preview: ShipmentPerformanceDeepLinkPreview
): string {
  if (preview.kind === "completion") {
    return buildShipmentListCompletionRateLink();
  }
  if (preview.kind === "late") {
    return buildShipmentListLateDelayedRateLink();
  }
  return buildShipmentListPerformanceStatusLink(preview.status);
}

/** Raw `current_status` value (e.g. CUSTOMS_CLEARANCE). */
export const PERFORMANCE_STATUS_QUERY_PARAM = "performance_status";

/** Matches backend: not delivered, ETA before today (UTC calendar). */
export const PERFORMANCE_ETA_LATE_QUERY_PARAM = "performance_eta_late";

export function buildShipmentListPerformanceStatusLink(status: ShipmentStatus): string {
  const p = new URLSearchParams();
  p.set(PERFORMANCE_STATUS_QUERY_PARAM, status);
  return `/dashboard/shipments?${p.toString()}`;
}

/** Completion rate KPI → delivered shipments only. */
export function buildShipmentListCompletionRateLink(): string {
  return buildShipmentListPerformanceStatusLink("DELIVERED");
}

/** Late / delayed rate KPI → overdue ETA, not delivered (matches `computeOnTimeStatus` “Late”). */
export function buildShipmentListLateDelayedRateLink(): string {
  const p = new URLSearchParams();
  p.set(PERFORMANCE_ETA_LATE_QUERY_PARAM, "true");
  return `/dashboard/shipments?${p.toString()}`;
}

export function performanceStatusFilterTooltip(count: number, statusLabel: string): string {
  return `Preview these ${count} shipments (${statusLabel}), then open the Shipments page with this filter.`;
}

export function performanceCompletionRateTooltip(deliveredCount: number): string {
  return `Preview these ${deliveredCount} delivered shipments, then open the Shipments page with this filter.`;
}

export function performanceLateDelayedTooltip(lateCount: number): string {
  return `Preview these ${lateCount} shipments (overdue ETA, not delivered), then open the Shipments page with this filter.`;
}
