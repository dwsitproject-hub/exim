import type { GuideTourRoute } from "@/types/guide-tour";

const STORAGE_KEY_PREFIX = "eos.guide.dismissed.";

export function getGuideTourDismissedKey(route: GuideTourRoute): string {
  return `${STORAGE_KEY_PREFIX}${route}`;
}

/** Persisted when the user checks “Don’t show this again” on the last step. */
export function setGuideTourDismissed(route: GuideTourRoute, dismissed: boolean): void {
  if (typeof window === "undefined") return;
  if (dismissed) {
    window.localStorage.setItem(getGuideTourDismissedKey(route), "1");
  } else {
    window.localStorage.removeItem(getGuideTourDismissedKey(route));
  }
}

export function isGuideTourDismissed(route: GuideTourRoute): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(getGuideTourDismissedKey(route)) === "1";
}
