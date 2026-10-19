"use client";

import { useEffect, useMemo, useState } from "react";
import { getPtPlantTree } from "@/services/masters-service";
import { isApiError } from "@/types/api";
import type { PtPlantTreeNode } from "@/types/masters";

/**
 * Live Company → Site tree from GET /masters/pt-plant-tree (Plant dropdown = sites).
 * Empty until the first DHM sync populates company_master / site_master.
 */
export function usePtPlantTree(accessToken: string | null) {
  const [tree, setTree] = useState<PtPlantTreeNode[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setLoading(true);
    getPtPlantTree(accessToken)
      .then((res) => {
        if (cancelled) return;
        if (!isApiError(res) && Array.isArray(res.data)) {
          setTree(res.data);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const ptLabels = useMemo(() => tree.map((node) => node.name), [tree]);

  return { tree, ptLabels, loading };
}
