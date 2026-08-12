import type { Step } from "react-joyride";

/** Routes that have a guided tour configuration. */
export const GUIDE_TOUR_ROUTES = [
  "dashboard",
  "poDetail",
  "shipmentList",
  "shipmentDetail",
  "exportBulkingList",
  "exportBulkingDetail",
] as const;

export type GuideTourRouteHooks = {
  /** Called before a step is shown (0-based index). */
  onBeforeStep?: (stepIndex: number) => void;
  /** Called when the tour ends (finish or skip). */
  onTourEnd?: () => void;
};

export type GuideTourRoute = (typeof GUIDE_TOUR_ROUTES)[number];

/** Type-safe step lists per route (targets use `[data-tour="…"]` selectors). */
export type GuideTourStepsByRoute = Record<GuideTourRoute, Step[]>;
