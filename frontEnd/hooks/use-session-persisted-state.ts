"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/**
 * Persist state in sessionStorage for the browser tab session (survives list → detail → list navigation).
 */
export function useSessionPersistedState<T>(
  storageKey: string,
  initialValue: T
): [T, Dispatch<SetStateAction<T>>, hydrated: boolean] {
  const [value, setValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw != null) {
        setValue(JSON.parse(raw) as T);
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* ignore quota / private mode */
    }
  }, [storageKey, value, hydrated]);

  return [value, setValue, hydrated];
}
