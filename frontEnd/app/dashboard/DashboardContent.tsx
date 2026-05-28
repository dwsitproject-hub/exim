"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { getPoDashboardCounts, getShipmentDashboardCounts } from "@/services/dashboard-service";
import { listShipments } from "@/services/shipments-service";
import { StatsCard } from "@/components/cards";
import { LoadingSkeleton } from "@/components/feedback";
import { PageHeader } from "@/components/navigation";
import { IconBox, IconClock, IconShip, IconDocument, IconCheck } from "@/components/icons/KpiIcons";
import { getRecentDateRange } from "@/lib/recent-date-range";
import { can } from "@/lib/permissions";
import { isApiError } from "@/types/api";
import type { ShipmentListItem } from "@/types/shipments";
import type { ApiSuccess } from "@/types/api";
import { DashboardCurrencyProvider } from "@/lib/dashboard-currency-context";
import { DashboardUsdRateBar } from "@/components/dashboard/DashboardUsdRateBar";
import { DashboardAnalyticsSection } from "./DashboardAnalyticsSection";
import { RecentShipmentsCard } from "@/components/dashboard/RecentShipmentsCard";
import styles from "./DashboardContent.module.css";

const RECENT_LIMIT = 5;
const RECENT_PO_DATE_DAYS = 7;
const VIEW_SHIPMENTS = "VIEW_SHIPMENTS";

export function DashboardContent() {
  const { user, accessToken, loading: authLoading } = useAuth();
  const [poCounts, setPoCounts] = useState({ newPoDetected: 0, awaitingAssignment: 0 });
  const [shipmentCounts, setShipmentCounts] = useState({
    activeShipments: 0,
    customsClearance: 0,
    delivered: 0,
  });
  const [recentShipments, setRecentShipments] = useState<ShipmentListItem[]>([]);
  const [countsLoading, setCountsLoading] = useState(true);
  const [recentListLoading, setRecentListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      setCountsLoading(false);
      setRecentListLoading(false);
      return;
    }
    const { from, to } = getRecentDateRange(RECENT_PO_DATE_DAYS);
    setCountsLoading(true);
    setRecentListLoading(true);
    setError(null);

    let cancelled = false;

    Promise.all([getPoDashboardCounts(accessToken), getShipmentDashboardCounts(accessToken)])
      .then(([poRes, shipCountsRes]) => {
        if (cancelled) return;
        if (typeof poRes === "object" && "newPoDetected" in poRes) {
          setPoCounts(poRes);
        }
        if (typeof shipCountsRes === "object" && "activeShipments" in shipCountsRes) {
          setShipmentCounts(shipCountsRes);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load dashboard");
      })
      .finally(() => {
        if (!cancelled) setCountsLoading(false);
      });

    listShipments(
      { page: 1, limit: RECENT_LIMIT, po_from_date: from, po_to_date: to },
      accessToken
    )
      .then((listRes) => {
        if (cancelled) return;
        if (!isApiError(listRes)) {
          const success = listRes as ApiSuccess<ShipmentListItem[]>;
          setRecentShipments(success.data ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load dashboard");
      })
      .finally(() => {
        if (!cancelled) setRecentListLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (authLoading) return <LoadingSkeleton lines={5} className={styles.loading} />;
  if (error) return <p className={styles.error}>{error}</p>;

  const { from: viewAllPoFrom, to: viewAllPoTo } = getRecentDateRange(RECENT_PO_DATE_DAYS);
  const viewAllShipmentsHref = `/dashboard/shipments?po_from_date=${encodeURIComponent(viewAllPoFrom)}&po_to_date=${encodeURIComponent(viewAllPoTo)}`;

  return (
    <DashboardCurrencyProvider>
      <section>
        <PageHeader
          title="Dashboard"
          subtitle={user ? `Welcome, ${user.name} (${user.role})` : undefined}
        />

        {!can(user, VIEW_SHIPMENTS) && <DashboardUsdRateBar />}

        {countsLoading ? (
          <LoadingSkeleton lines={4} className={styles.loading} />
        ) : (
        <div className={styles.summaryGrid}>
        <StatsCard
          label="New Purchase Order detected"
          value={poCounts.newPoDetected}
          href="/dashboard/po?intake_status=NEW_PO_DETECTED"
          icon={<IconBox />}
        />
        <StatsCard
          label="Claimed (awaiting allocation)"
          value={poCounts.awaitingAssignment}
          href="/dashboard/po?intake_status=CLAIMED"
          aria-label="Claimed awaiting allocation"
          icon={<IconClock />}
        />
        <StatsCard
          label="Active shipments"
          value={shipmentCounts.activeShipments}
          href="/dashboard/shipments"
          aria-label="Shipments in progress (not delivered and not closed)"
          icon={<IconShip />}
        />
        <StatsCard
          label="Customs clearance"
          value={shipmentCounts.customsClearance}
          href="/dashboard/shipments?status=CUSTOMS_CLEARANCE"
          aria-label="Customs clearance"
          icon={<IconDocument />}
        />
        <StatsCard
          label="Delivered"
          value={shipmentCounts.delivered}
          href="/dashboard/shipments?status=DELIVERED"
          aria-label="Delivered"
          icon={<IconCheck />}
        />
      </div>
        )}

      <div className={styles.quickActions}>
        <span className={styles.quickActionsLabel}>Quick actions</span>
        <div className={styles.quickActionsButtons}>
          <Link href="/dashboard/po" className={styles.btnPrimary}>
            View Purchase Order
          </Link>
          <Link href="/dashboard/shipments" className={styles.btnSecondary}>
            View shipments
          </Link>
        </div>
      </div>

      {can(user, VIEW_SHIPMENTS) && <DashboardAnalyticsSection />}

      <div className={styles.recentSection} data-tour="dashboard-recent-shipments">
        <RecentShipmentsCard
          rows={recentShipments}
          loading={recentListLoading}
          viewAllHref={viewAllShipmentsHref}
        />
        </div>
      </section>
    </DashboardCurrencyProvider>
  );
}
