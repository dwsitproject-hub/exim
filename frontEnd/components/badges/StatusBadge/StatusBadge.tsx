"use client";

import type { HTMLAttributes } from "react";
import type { BadgeVariant } from "../Badge";
import {
  getPoIntakeBadgeVariant,
  getShipmentBadgeVariant,
  getShipmentTextTone,
  getStatusLabel,
  type StatusDomain,
  type StatusVisual,
} from "@/lib/entity-status";
import styles from "./StatusBadge.module.css";

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  domain: StatusDomain;
  status: string | null | undefined;
  /** badge = filled chip; text = shipment list text color */
  visual?: StatusVisual;
}

const BADGE_VARIANT_CLASS: Record<BadgeVariant, string> = {
  default: styles.variantDefault,
  success: styles.variantSuccess,
  warning: styles.variantWarning,
  neutral: styles.variantNeutral,
  info: styles.variantInfo,
  accent: styles.variantAccent,
  muted: styles.variantMuted,
};

const SHIPMENT_TONE_CLASS = {
  delivered: styles.toneDelivered,
  green: styles.toneGreen,
  early: styles.toneEarly,
} as const;

function resolveClasses(
  domain: StatusDomain,
  status: string | null | undefined,
  visual: StatusVisual
): string[] {
  const classes = [styles.root];

  if (visual === "text") {
    classes.push(styles.text, SHIPMENT_TONE_CLASS[getShipmentTextTone(status)]);
    return classes;
  }

  classes.push(styles.badge);
  const variant =
    domain === "po-intake"
      ? getPoIntakeBadgeVariant(status ?? "")
      : getShipmentBadgeVariant(status ?? "");
  classes.push(BADGE_VARIANT_CLASS[variant]);
  return classes;
}

export function StatusBadge({
  domain,
  status,
  visual = domain === "shipment" ? "text" : "badge",
  className = "",
  children,
  ...props
}: StatusBadgeProps) {
  const label = children ?? getStatusLabel(domain, status);
  const classNames = [...resolveClasses(domain, status, visual), className].filter(Boolean).join(" ");

  return (
    <span className={classNames} {...props}>
      {label}
    </span>
  );
}
