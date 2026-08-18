"use client";

import { useCallback, useEffect, useState } from "react";
import { getMixedFclComboShipments } from "@/services/dashboard-service";
import { isApiError } from "@/types/api";
import type { ApiSuccess } from "@/types/api";
import type { MixedFclComboShipmentRow, ShipmentAnalyticsQuery } from "@/types/analytics";

export function useMixedFclComboExpand(
  analyticsQuery: ShipmentAnalyticsQuery | null | undefined,
  accessToken: string | null | undefined
) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [shipmentsByCombo, setShipmentsByCombo] = useState<Map<string, MixedFclComboShipmentRow[]>>(
    () => new Map()
  );
  const [loadingCombos, setLoadingCombos] = useState<Set<string>>(() => new Set());
  const [errorsByCombo, setErrorsByCombo] = useState<Map<string, string>>(() => new Map());

  useEffect(() => {
    setExpanded(new Set());
    setShipmentsByCombo(new Map());
    setLoadingCombos(new Set());
    setErrorsByCombo(new Map());
  }, [analyticsQuery?.date_from, analyticsQuery?.date_to]);

  const toggleExpand = useCallback(
    async (comboKey: string) => {
      if (!analyticsQuery || !accessToken) return;

      if (expanded.has(comboKey)) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(comboKey);
          return next;
        });
        return;
      }

      setExpanded((prev) => new Set(prev).add(comboKey));
      if (shipmentsByCombo.has(comboKey)) return;

      setLoadingCombos((prev) => new Set(prev).add(comboKey));
      setErrorsByCombo((prev) => {
        const next = new Map(prev);
        next.delete(comboKey);
        return next;
      });

      try {
        const res = await getMixedFclComboShipments(analyticsQuery, comboKey, accessToken);
        if (isApiError(res) || !res.success) {
          setErrorsByCombo((prev) =>
            new Map(prev).set(comboKey, res.message ?? "Failed to load shipments")
          );
          return;
        }
        setShipmentsByCombo((prev) =>
          new Map(prev).set(comboKey, (res as ApiSuccess<MixedFclComboShipmentRow[]>).data ?? [])
        );
      } catch {
        setErrorsByCombo((prev) => new Map(prev).set(comboKey, "Failed to load shipments"));
      } finally {
        setLoadingCombos((prev) => {
          const next = new Set(prev);
          next.delete(comboKey);
          return next;
        });
      }
    },
    [accessToken, analyticsQuery, expanded, shipmentsByCombo]
  );

  return {
    expanded,
    toggleExpand,
    shipmentsByCombo,
    loadingCombos,
    errorsByCombo,
  };
}
