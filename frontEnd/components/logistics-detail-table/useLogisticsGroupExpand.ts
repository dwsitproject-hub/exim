"use client";

import { useCallback, useEffect, useState } from "react";
import { getLogisticsGroupShipments } from "@/services/dashboard-service";
import { isApiError } from "@/types/api";
import type { ApiSuccess } from "@/types/api";
import {
  logisticsLineGroupKey,
  type ShipmentAnalyticsGroupShipmentRow,
  type ShipmentAnalyticsQuery,
} from "@/types/analytics";
import type { FclSubType, TransportTab } from "./types";

export function useLogisticsGroupExpand(
  analyticsQuery: ShipmentAnalyticsQuery | null | undefined,
  accessToken: string | null | undefined,
  transportMode: TransportTab,
  fclSubType?: FclSubType
) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [shipmentsByGroup, setShipmentsByGroup] = useState<
    Map<string, ShipmentAnalyticsGroupShipmentRow[]>
  >(() => new Map());
  const [loadingGroups, setLoadingGroups] = useState<Set<string>>(() => new Set());
  const [errorsByGroup, setErrorsByGroup] = useState<Map<string, string>>(() => new Map());

  const expandEnabled = Boolean(analyticsQuery && accessToken);

  useEffect(() => {
    setExpanded(new Set());
    setShipmentsByGroup(new Map());
    setLoadingGroups(new Set());
    setErrorsByGroup(new Map());
  }, [transportMode, fclSubType, analyticsQuery?.date_from, analyticsQuery?.date_to]);

  const toggleExpand = useCallback(
    async (ptPlant: string, itemDescription: string) => {
      if (!expandEnabled || !analyticsQuery || !accessToken) return;

      const key = logisticsLineGroupKey(ptPlant, itemDescription);
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
        const res = await getLogisticsGroupShipments(
          {
            ...analyticsQuery,
            group_pt_plant: ptPlant,
            group_item_description: itemDescription,
            transport_mode: transportMode,
            ...(transportMode === "FCL" && fclSubType ? { fcl_sub_type: fclSubType } : {}),
          },
          accessToken
        );
        if (isApiError(res) || !res.success) {
          setErrorsByGroup((prev) => new Map(prev).set(key, res.message ?? "Failed to load shipments"));
          return;
        }
        setShipmentsByGroup((prev) =>
          new Map(prev).set(key, (res as ApiSuccess<ShipmentAnalyticsGroupShipmentRow[]>).data ?? [])
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
    [accessToken, analyticsQuery, expandEnabled, expanded, fclSubType, shipmentsByGroup, transportMode]
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
