import type { GuideTourRoute } from "@/types/guide-tour";

/**
 * Map the current pathname to a tour route.
 * PO detail is `/import/po/:id` only (not `/edit` or `/new`).
 */
export function getGuideTourRouteForPathname(pathname: string): GuideTourRoute | null {
  const p = pathname.replace(/\/$/, "") || "/";
  if (p === "/import/dashboard") return "dashboard";
  if (p === "/import/shipments") return "shipmentList";
  const shipmentDetail = /^\/import\/shipments\/([^/]+)$/.exec(p);
  if (shipmentDetail && shipmentDetail[1] !== "") return "shipmentDetail";
  const poDetail = /^\/import\/po\/([^/]+)$/.exec(p);
  if (poDetail && poDetail[1] !== "new") return "poDetail";
  return null;
}
