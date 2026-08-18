/**
 * Central registry of FCL container types.
 *
 * Add a new entry here when a new FCL container type column is added to the
 * `shipments` table. The dashboard summary totals (including exclusive vs mixed
 * FCL classification), logistics detail rows, and frontend chips all derive
 * their behaviour from this single list — no other code changes are required
 * in the analytics pipeline.
 */
export interface FclContainerType {
  /** Short identifier used as SQL alias and as the `fclSubType` value on the wire. */
  slug: string;
  /** Exact column name on the `shipments` table. */
  column: string;
  /** Human-readable label shown in the UI (chips, metric rows, CSV headers). */
  label: string;
}

export const FCL_CONTAINER_REGISTRY: FclContainerType[] = [
  { slug: "20FT",  column: "container_count_20ft",        label: "20′"           },
  { slug: "40FT",  column: "container_count_40ft",        label: "40′"           },
  { slug: "ISO",   column: "container_count_20_iso_tank", label: "20′ ISO tank"  },
  { slug: "40HC",  column: "container_count_40_hc",       label: "40′ HC"        },
  { slug: "20FR",  column: "container_count_20_fr",       label: "20′ Flat Rack" },
  { slug: "40FR",  column: "container_count_40_fr",       label: "40′ Flat Rack" },
];
