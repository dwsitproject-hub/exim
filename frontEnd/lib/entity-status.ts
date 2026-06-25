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
import { shipmentTimelineStatusTone } from "@/lib/shipment-timeline-status";

export type StatusDomain = "po-intake" | "shipment";

export type StatusVisual = "badge" | "text";

export type ShipmentStatusTone = "delivered" | "green" | "early";

export function getStatusLabel(domain: StatusDomain, status: string | null | undefined): string {
  if (!status) return "—";
  switch (domain) {
    case "po-intake":
      return formatPoStatusLabel(status);
    case "shipment":
      return formatStatusLabel(status);
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
