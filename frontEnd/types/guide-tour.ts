import type { Step } from "react-joyride";

/** Routes that have a guided tour configuration. */
export const GUIDE_TOUR_ROUTES = ["dashboard", "poDetail", "shipmentList", "shipmentDetail"] as const;

export type GuideTourRoute = (typeof GUIDE_TOUR_ROUTES)[number];

/** Type-safe step lists per route (targets use `[data-tour="…"]` selectors). */
export type GuideTourStepsByRoute = Record<GuideTourRoute, Step[]>;
