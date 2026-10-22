/**
 * PO list: distinguish newly detected POs (integration) from POs already in workflow.
 */

import type { PoListItem } from "@/types/po";

export type PoIntakeKind = "new" | "existing";

const NEW_STATUS = "NEW_PO_DETECTED";

export function getPoIntakeKind(intakeStatus: string | null | undefined): PoIntakeKind {
  return intakeStatus?.trim().toUpperCase() === NEW_STATUS ? "new" : "existing";
}

export function isNewPoRow(row: Pick<PoListItem, "intake_status">): boolean {
  return getPoIntakeKind(row.intake_status) === "new";
}

/** Days to show new-PO dot / row highlight after detection if the user has not opened the PO. */
export const NEW_PO_ATTENTION_DAYS = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isWithinNewPoAttentionWindow(createdAt: string | null | undefined): boolean {
  if (!createdAt?.trim()) return false;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  return Date.now() - created.getTime() < NEW_PO_ATTENTION_DAYS * MS_PER_DAY;
}

/** Dot + row highlight: new status, not opened by this user, and detected within the last 3 days. */
export function shouldShowNewPoAttention(
  row: Pick<PoListItem, "intake_status" | "created_at" | "viewed_by_me">
): boolean {
  if (!isNewPoRow(row)) return false;
  if (row.viewed_by_me) return false;
  return isWithinNewPoAttentionWindow(row.created_at);
}

export function isSynceraPo(externalId: string | null | undefined): boolean {
  return (externalId ?? "").trim().toLowerCase().startsWith("syncera:");
}

export function poIntakeKindLabel(kind: PoIntakeKind): string {
  return kind === "new" ? "New" : "Existing";
}

export function poIntakeKindTooltip(row: Pick<PoListItem, "intake_status" | "external_id">): string {
  if (!isNewPoRow(row)) {
    return "PO is already in the import workflow (claimed, allocated, or shipped).";
  }
  if (isSynceraPo(row.external_id)) {
    return "New PO auto-imported from Syncera — not yet claimed.";
  }
  return "New PO detected — not yet claimed.";
}

/** Statuses for “Existing only” list filter (all known except NEW_PO_DETECTED). */
export function existingIntakeStatuses(allStatuses: string[]): string[] {
  return allStatuses.filter((s) => s.trim().toUpperCase() !== NEW_STATUS);
}
