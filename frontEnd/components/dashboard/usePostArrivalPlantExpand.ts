"use client";

import { useCallback, useEffect, useState } from "react";
import { getPostArrivalLeadShipments } from "@/services/dashboard-service";
import { isApiError } from "@/types/api";
import type { ApiSuccess } from "@/types/api";
import {
  postArrivalPlantGroupKey,
  type PostArrivalLeadShipmentRow,
  type ShipmentAnalyticsQuery,
} from "@/types/analytics";

export function usePostArrivalPlantExpand(
  analyticsQuery: ShipmentAnalyticsQuery | null | undefined,
  accessToken: string | null | undefined
) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [shipmentsByGroup, setShipmentsByGroup] = useState<
    Map<string, PostArrivalLeadShipmentRow[]>
  >(() => new Map());
  const [loadingGroups, setLoadingGroups] = useState<Set<string>>(() => new Set());
  const [errorsByGroup, setErrorsByGroup] = useState<Map<string, string>>(() => new Map());

  const expandEnabled = Boolean(analyticsQuery && accessToken);

  useEffect(() => {
    setExpanded(new Set());
    setShipmentsByGroup(new Map());
    setLoadingGroups(new Set());
    setErrorsByGroup(new Map());
  }, [analyticsQuery?.date_from, analyticsQuery?.date_to]);

  const toggleExpand = useCallback(
    async (loadType: string, plant: string) => {
      if (!expandEnabled || !analyticsQuery || !accessToken) return;

      const key = postArrivalPlantGroupKey(loadType, plant);
      if (expanded.has(key)) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        return;
      }

      setExpanded((prev) => new Set(prev).add(key));
      if (shipmentsByGroup.has(key)) return;

      setLoadingGroups((prev) => new Set(prev).add(key));
      setErrorsByGroup((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });

      try {
        const res = await getPostArrivalLeadShipments(
          {
            ...analyticsQuery,
            load_type: loadType,
            group_pt_plant: plant,
          },
          accessToken
        );
        if (isApiError(res) || !res.success) {
          setErrorsByGroup((prev) => new Map(prev).set(key, res.message ?? "Failed to load shipments"));
          return;
        }
        setShipmentsByGroup((prev) =>
          new Map(prev).set(key, (res as ApiSuccess<PostArrivalLeadShipmentRow[]>).data ?? [])
        );
      } catch {
        setErrorsByGroup((prev) => new Map(prev).set(key, "Failed to load shipments"));
      } finally {
        setLoadingGroups((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [accessToken, analyticsQuery, expandEnabled, expanded, shipmentsByGroup]
  );

  return {
    expandEnabled,
    expanded,
    toggleExpand,
    shipmentsByGroup,
    loadingGroups,
    errorsByGroup,
  };
}
