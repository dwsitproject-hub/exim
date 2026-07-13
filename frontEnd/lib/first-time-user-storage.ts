/** When set, export bulking list auto-starts the guided tour once (per user). */
export const FIRST_TIME_USER_STORAGE_KEY = "isFirstTimeUser";

function perUserKey(userId: string): string {
  return `${FIRST_TIME_USER_STORAGE_KEY}:${userId}`;
}

export function isFirstTimeUser(userId?: string | null): boolean {
  if (typeof window === "undefined") return false;
  if (userId) {
    return window.localStorage.getItem(perUserKey(userId)) === "true";
  }
  return window.localStorage.getItem(FIRST_TIME_USER_STORAGE_KEY) === "true";
}

/** Mark that this user should see the export bulking onboarding tour on first visit. */
export function markFirstTimeUser(userId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(perUserKey(userId), "true");
  window.localStorage.setItem(FIRST_TIME_USER_STORAGE_KEY, "true");
}

export function setFirstTimeUser(value: boolean, userId?: string | null): void {
  if (typeof window === "undefined") return;
  if (value && userId) {
    markFirstTimeUser(userId);
    return;
  }
  clearFirstTimeUser(userId);
}

export function clearFirstTimeUser(userId?: string | null): void {
  if (typeof window === "undefined") return;
  if (userId) {
    window.localStorage.removeItem(perUserKey(userId));
  }
  window.localStorage.removeItem(FIRST_TIME_USER_STORAGE_KEY);
}
