import { FCL_CONTAINER_REGISTRY, type FclContainerType } from "./fcl-container-registry.js";

/**
 * Classify one FCL shipment from per-type container counts.
 *
 * Mixed shipments (2+ types present) are a single L2 category so shipment
 * counts are a partition of the FCL tile — they must not appear in every
 * matching type row.
 */
export type FclShipmentClass =
  | { kind: "empty" }
  | { kind: "exclusive"; slug: string }
  | { kind: "mixed"; slugs: string[] };

export function classifyFclShipment(countsBySlug: Record<string, number>): FclShipmentClass {
  const present = FCL_CONTAINER_REGISTRY.filter((t) => (countsBySlug[t.slug] ?? 0) > 0).map((t) => t.slug);
  if (present.length === 0) return { kind: "empty" };
  if (present.length === 1) return { kind: "exclusive", slug: present[0]! };
  return { kind: "mixed", slugs: present };
}

export function parseFclComboKey(key: string): { slugs: string[]; labels: string[] } {
  const bySlug = new Map(FCL_CONTAINER_REGISTRY.map((t) => [t.slug, t]));
  const slugs = key
    .split("+")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return {
    slugs,
    labels: slugs.map((s) => bySlug.get(s)?.label ?? s),
  };
}

/** How many registered FCL types have qty > 0. Used in exclusive vs mixed SQL. */
export function fclTypePresentSql(columnPrefix = ""): string {
  return FCL_CONTAINER_REGISTRY.map(
    (t) => `(CASE WHEN COALESCE(${columnPrefix}${t.column}, 0) > 0 THEN 1 ELSE 0 END)`
  ).join(" + ");
}

/** True when this shipment has only `type` (unduplicated L2 bucket). */
export function fclExclusiveSql(type: FclContainerType, columnPrefix = ""): string {
  return `(COALESCE(${columnPrefix}${type.column}, 0) > 0 AND (${fclTypePresentSql(columnPrefix)}) = 1)`;
}

/** True when this shipment has two or more FCL types. */
export function fclMixedSql(columnPrefix = ""): string {
  return `((${fclTypePresentSql(columnPrefix)}) >= 2)`;
}

/** Stable combo key in registry order, e.g. `20FT+ISO`. */
export function fclComboKeySql(columnPrefix = ""): string {
  return `CONCAT_WS('+', ${FCL_CONTAINER_REGISTRY.map(
    (t) => `CASE WHEN COALESCE(${columnPrefix}${t.column}, 0) > 0 THEN '${t.slug}' END`
  ).join(", ")})`;
}

export function fclTotalEquipmentSql(columnPrefix = ""): string {
  return FCL_CONTAINER_REGISTRY.map((t) => `COALESCE(${columnPrefix}${t.column}, 0)`).join(" + ");
}
