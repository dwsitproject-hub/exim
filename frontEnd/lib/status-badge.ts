/**
 * Map status to Badge variant — intake (PO) and shipment statuses.
 * Shipment lifecycle uses distinct text/background tones (see Badge variants).
 */

import type { BadgeVariant } from "@/components/badges/Badge";

const SHIPMENT_SUCCESS = "DELIVERED";
const INTAKE_FULFILLED = "FULFILLED";
const INTAKE_SHIPPED = "SHIPPED";
const INTAKE_PARTIAL = "PARTIALLY_SHIPPED";
const INTAKE_ALLOCATION = "ALLOCATION_IN_PROGRESS";
const INTAKE_CLAIMED = "CLAIMED";

/**
 * Shipment + linked intake statuses → colored badge (lists, detail header, timeline).
 * Palette: slate (setup) → amber (attention) → teal (confirmed) → blue (movement) → amber (customs) → green (done).
 */
export function statusToBadgeVariant(status: string): BadgeVariant {
  const s = status.toUpperCase();
  if (s === SHIPMENT_SUCCESS || s === INTAKE_FULFILLED) return "success";
  if (s === "CUSTOMS_CLEARANCE" || s === INTAKE_SHIPPED || s === "BIDDING_TRANSPORTER") return "warning";
  if (s === "INITIATE_SHIPPING_DOCUMENT") return "muted";
  if (s === "TRANSPORT_CONFIRMED") return "accent";
  if (s === "READY_PICKUP" || s === "PICKED_UP" || s === "ON_SHIPMENT") return "info";
  return "neutral";
}

/** PO intake status: lifecycle from detection → claim → allocation → ship → fulfil. */
export function intakeStatusToBadgeVariant(status: string): BadgeVariant {
  const s = status.toUpperCase();
  if (s === "NEW_PO_DETECTED") return "default";
  if (s === INTAKE_CLAIMED) return "accent";
  if (s === INTAKE_ALLOCATION) return "info";
  if (s === INTAKE_PARTIAL) return "warning";
  if (s === INTAKE_SHIPPED) return "warning";
  if (s === INTAKE_FULFILLED) return "success";
  if (s === "NOTIFIED" || s === "TAKEN_BY_EXIM" || s === "GROUPED_TO_SHIPMENT") return "neutral";
  return "neutral";
}

export function formatStatusLabel(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}
