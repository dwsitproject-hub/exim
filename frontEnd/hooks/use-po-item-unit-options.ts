"use client";

import { useEffect, useMemo, useState } from "react";
import { PO_ITEM_UNIT_OPTIONS } from "@/lib/po-create-constants";
import { listPoItemUnitOptions } from "@/services/po-service";
import { isApiError } from "@/types/api";

const NBSP = "\u00a0";

function mergeUnitCodes(apiUnits: string[], extra: string[] = []): string[] {
  const set = new Set<string>();
  for (const u of PO_ITEM_UNIT_OPTIONS) {
    const t = u.trim();
    if (t && !t.includes(NBSP)) set.add(t);
  }
  for (const u of apiUnits) {
    const t = u.trim();
    if (t) set.add(t);
  }
  for (const u of extra) {
    const t = u.trim();
    if (t) set.add(t);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/**
 * Unit dropdown options = seed list + GET /po/unit-options (includes Syncera-registered codes).
 */
export function usePoItemUnitOptions(accessToken: string | null, extraUnits: string[] = []) {
  const [apiUnits, setApiUnits] = useState<string[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    listPoItemUnitOptions(accessToken).then((res) => {
      if (cancelled || isApiError(res)) return;
      const units = res.data?.units;
      if (Array.isArray(units)) setApiUnits(units);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const options = useMemo(
    () => mergeUnitCodes(apiUnits, extraUnits),
    [apiUnits, extraUnits.join("|")]
  );

  const optionSet = useMemo(() => new Set(options), [options]);

  return { unitOptions: options, unitOptionSet: optionSet };
}
