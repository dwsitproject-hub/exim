"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchShipperDocumentHeaderBlob,
  findShipperMatch,
  listShippers,
} from "@/services/shipper-service";
import { isApiError } from "@/types/api";

export type ShipperDocumentHeader = {
  /** Object URL for the uploaded header image. */
  imageUrl: string | null;
  /** Company name for footer when using uploaded header. */
  footerCompanyName: string | null;
  loading: boolean;
};

/**
 * Resolve uploaded document header for a shipment shipper short name.
 * Returns a blob object URL when the shipper has a configured header image.
 */
export function useShipperDocumentHeader(
  shipperShortName: string | null | undefined,
  accessToken: string | null,
): ShipperDocumentHeader {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [footerCompanyName, setFooterCompanyName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const normalizedShipper = useMemo(() => shipperShortName?.trim() ?? "", [shipperShortName]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setImageUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setFooterCompanyName(null);

      if (!normalizedShipper || !accessToken) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const res = await listShippers(accessToken);
        if (cancelled) return;
        if (isApiError(res)) {
          setLoading(false);
          return;
        }

        const match = findShipperMatch(normalizedShipper, res.data ?? []);
        if (!match?.has_document_header) {
          setLoading(false);
          return;
        }

        setFooterCompanyName(match.entity_name?.trim() || match.short_name);
        const blob = await fetchShipperDocumentHeaderBlob(match.id, accessToken);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setImageUrl(url);
      } catch {
        if (!cancelled) {
          setFooterCompanyName(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
      setImageUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [normalizedShipper, accessToken]);

  return { imageUrl, footerCompanyName, loading };
}
