import type { FclMixedCombination } from "@/types/analytics";

/**
 * Human-readable label for a single FCL combination.
 *
 * 2 types  → "20′ & 40′ Mixed"
 * 3+ types → "20′, 40′ & 20′ ISO tank Mixed"
 */
export function fclComboLabel(combination: FclMixedCombination): string {
  const labels = combination.labels;
  if (labels.length === 0) return "Other Mixed";
  if (labels.length === 1) return labels[0]!;
  const last = labels[labels.length - 1];
  const rest = labels.slice(0, -1);
  return `${rest.join(", ")} & ${last} Mixed`;
}

export function formatFclShipmentUnit(count: number): string {
  return count === 1 ? "Shipment" : "Shipments";
}

/**
 * Container unit label for FCL rows.
 *
 * Exclusive type:  ISO → "ISO Tank", others → "Container"
 * Mixed combos:    contains ISO alongside other types → "Unit" (mixed equipment),
 *                  pure non-ISO mix → "Container"
 */
export function fclContainerUnit(slugs: string[]): string {
  const hasIso = slugs.includes("ISO");
  if (!hasIso) return "Container";
  if (slugs.length === 1) return "ISO Tank";
  return "Unit";
}
