/**
 * Central status label + visual tone mapping for StatusBadge across domains.
 */

import type { BadgeVariant } from "@/components/badges/Badge";
import {
  intakeStatusToBadgeVariant,
  statusToBadgeVariant,
  formatStatusLabel,
} from "@/lib/status-badge";
import { formatPoStatusLabel } from "@/lib/po-status-label";
import { formatExportBulkingStatus } from "@/types/export-bulking";
import { shipmentTimelineStatusTone } from "@/lib/shipment-timeline-status";

export type StatusDomain = "po-intake" | "shipment" | "export-bulking";

export type StatusVisual = "badge" | "pill" | "pillDetail" | "text";

export type ExportBulkingStatusTone =
  | "planning"
  | "nomination"
  | "siReceive"
  | "arrival"
  | "atBerth"
  | "loading"
  | "npe"
  | "caseOff";

export type ShipmentStatusTone = "delivered" | "green" | "early";

export function getStatusLabel(domain: StatusDomain, status: string | null | undefined): string {
  if (!status) return "—";
  switch (domain) {
    case "po-intake":
      return formatPoStatusLabel(status);
    case "shipment":
      return formatStatusLabel(status);
    case "export-bulking":
      return formatExportBulkingStatus(status);
    default:
      return status;
  }
}

export function getPoIntakeBadgeVariant(status: string): BadgeVariant {
  return intakeStatusToBadgeVariant(status);
}

export function getShipmentBadgeVariant(status: string): BadgeVariant {
  return statusToBadgeVariant(status);
}

export function getShipmentTextTone(status: string | null | undefined): ShipmentStatusTone {
  return shipmentTimelineStatusTone(status);
}

export function getExportBulkingTone(status: string | null | undefined): ExportBulkingStatusTone {
  switch (status) {
    case "SHIPMENT_PLANNING":
      return "planning";
    case "NOMINATION":
      return "nomination";
    case "SI_RECEIVE":
      return "siReceive";
    case "ARRIVAL":
      return "arrival";
    case "AT_BERTH":
      return "atBerth";
    case "LOADING":
      return "loading";
    case "NPE":
      return "npe";
    case "CASE_OFF":
      return "caseOff";
    default:
      return "planning";
  }
}

/** Compact labels for dense list columns (export bulking). */
export function getExportBulkingShortLabel(raw: string): string {
  switch (raw) {
    case "SHIPMENT_PLANNING":
      return "Planning";
    case "NOMINATION":
      return "Nomination";
    case "SI_RECEIVE":
      return "SI Recv";
    case "ARRIVAL":
      return "Arrival";
    case "AT_BERTH":
      return "At Berth";
    case "LOADING":
      return "Loading";
    case "NPE":
      return "Pre-ship";
    case "CASE_OFF":
      return "Case Off";
    default:
      return formatExportBulkingStatus(raw);
  }
}

/** Hex accent for dashboard status breakdown bars. */
export const EXPORT_BULKING_STATUS_ACCENT: Record<string, string> = {
  SHIPMENT_PLANNING: "#52525b",
  NOMINATION: "#1d4ed8",
  SI_RECEIVE: "#92400e",
  ARRIVAL: "#283593",
  AT_BERTH: "#00695c",
  LOADING: "#e65100",
  NPE: "#ad1457",
  CASE_OFF: "#1b5e20",
};

export function getExportBulkingAccent(status: string): string {
  return EXPORT_BULKING_STATUS_ACCENT[status] ?? "#52525b";
}
