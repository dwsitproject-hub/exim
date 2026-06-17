"use client";

import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
import type { BadgeVariant } from "../Badge";
import {
  getExportBulkingShortLabel,
  getExportBulkingTone,
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
  /** badge = filled chip; pill = export list; text = shipment list text color; pillDetail = export detail header */
  visual?: StatusVisual;
  /** Use compact export list labels */
  shortLabel?: boolean;
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

const EXPORT_TONE_CLASS = {
  planning: styles.tonePlanning,
  nomination: styles.toneNomination,
  siReceive: styles.toneSiReceive,
  arrival: styles.toneArrival,
  atBerth: styles.toneAtBerth,
  loading: styles.toneLoading,
  npe: styles.toneNpe,
  caseOff: styles.toneCaseOff,
} as const;

function resolveLabel(
  domain: StatusDomain,
  status: string | null | undefined,
  shortLabel: boolean
): string {
  if (!status) return "—";
  if (domain === "export-bulking" && shortLabel) {
    return getExportBulkingShortLabel(status);
  }
  return getStatusLabel(domain, status);
}

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

  if (visual === "pill" || visual === "pillDetail") {
    classes.push(visual === "pillDetail" ? styles.pillDetail : styles.pill);
    classes.push(EXPORT_TONE_CLASS[getExportBulkingTone(status)]);
    return classes;
  }

  classes.push(styles.badge);
  const variant =
    domain === "po-intake"
      ? getPoIntakeBadgeVariant(status ?? "")
      : domain === "shipment"
        ? getShipmentBadgeVariant(status ?? "")
        : "neutral";
  classes.push(BADGE_VARIANT_CLASS[variant]);
  return classes;
}

export function StatusBadge({
  domain,
  status,
  visual = domain === "export-bulking" ? "pill" : domain === "shipment" ? "text" : "badge",
  shortLabel = domain === "export-bulking" && (visual === "pill" || visual === "pillDetail"),
  className = "",
  children,
  ...props
}: StatusBadgeProps) {
  const label = children ?? resolveLabel(domain, status, shortLabel);
  const classNames = [...resolveClasses(domain, status, visual), className].filter(Boolean).join(" ");

  return (
    <span className={classNames} {...props}>
      {label}
    </span>
  );
}

export interface StatusFilterPillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  domain: "export-bulking";
  status: string;
  active?: boolean;
  shortLabel?: boolean;
}

/** Toggleable status filter pill (export bulking list toolbar). */
export function StatusFilterPill({
  domain,
  status,
  active = false,
  shortLabel = true,
  className = "",
  type = "button",
  children,
  ...props
}: StatusFilterPillProps) {
  const label = children ?? resolveLabel(domain, status, shortLabel);
  const tone = EXPORT_TONE_CLASS[getExportBulkingTone(status)];
  const classNames = [
    styles.root,
    styles.pill,
    styles.filterBtn,
    tone,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classNames} aria-pressed={active} {...props}>
      {label}
    </button>
  );
}
