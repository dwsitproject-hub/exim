"use client";

import Link from "next/link";
import { Card } from "@/components/cards";
import { EmptyState } from "@/components/navigation";
import type { ShipmentListItem } from "@/types/shipments";
import { formatDayMonthYear } from "@/lib/format-date";
import { formatShipmentStatusTitleCase } from "@/lib/shipment-status-title-case";
import { getShipmentDashboardTone, type ShipmentDashboardTone } from "@/lib/shipment-dashboard-status-theme";
import { formatDashboardVendorName } from "@/lib/vendor-display-name";
import styles from "./RecentShipmentsCard.module.css";

export interface RecentShipmentsCardProps {
  rows: ShipmentListItem[];
  loading: boolean;
  viewAllHref: string;
}

function formatPoSummaryLine(count: number): string {
  if (count <= 0) return "0 PO";
  if (count === 1) return "1 PO";
  return `${count} POs`;
}

function formatScheduleContext(row: ShipmentListItem): string {
  const etdDisp = formatDayMonthYear(row.etd);
  const etaDisp = formatDayMonthYear(row.eta);
  const hasEtd = Boolean(row.etd?.trim()) && etdDisp !== "—";
  const hasEta = Boolean(row.eta?.trim()) && etaDisp !== "—";
  if (hasEtd && hasEta) return `ETD ${etdDisp} · ETA ${etaDisp}`;
  if (hasEtd) return `ETD ${etdDisp}`;
  if (hasEta) return `ETA ${etaDisp}`;
  const closedDisp = formatDayMonthYear(row.closed_at);
  if (row.closed_at?.trim() && closedDisp !== "—") return `Closed ${closedDisp}`;
  const shipByDisp = formatDayMonthYear(row.ship_by);
  if (row.ship_by?.trim() && shipByDisp !== "—") return `Ship by ${shipByDisp}`;
  return "—";
}

const TONE_CLASS: Record<ShipmentDashboardTone, string> = {
  success: styles.toneSuccess,
  danger: styles.toneDanger,
  actionPrimary: styles.toneActionPrimary,
  accent: styles.toneAccent,
  info: styles.toneInfo,
  neutral: styles.toneNeutral,
  warning: styles.toneWarning,
};

function RecentShipmentsSkeletonRows() {
  return (
    <div className={styles.skeletonBlock} aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className={styles.skeletonRow}>
          <div className={styles.skeletonBar} />
          <div className={styles.skeletonBar} />
          <div className={styles.skeletonBar} />
          <div className={styles.skeletonBar} />
          <div className={styles.skeletonBar} />
        </div>
      ))}
    </div>
  );
}

export function RecentShipmentsCard({ rows, loading, viewAllHref }: RecentShipmentsCardProps) {
  return (
    <Card className={styles.tableCard}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Recent shipments</h2>
        <Link href={viewAllHref} className={styles.viewAll}>
          View all
        </Link>
      </div>

      {loading ? (
        <RecentShipmentsSkeletonRows />
      ) : rows.length === 0 ? (
        <div className={styles.emptyStateWrap}>
          <EmptyState
            title="No recent shipments"
            description="Nothing in this date range yet. Purchase Orders can be grouped into shipments from the Purchase Order screen."
            action={
              <Link href="/dashboard/po" className={styles.btnPrimary}>
                View PO
              </Link>
            }
          />
        </div>
      ) : (
        <div className={styles.tableScroll}>
          <div className={styles.headRow}>
            <div className={styles.grid} role="row">
              <div className={styles.headCell} role="columnheader">
                Shipment ID
              </div>
              <div className={styles.headCell} role="columnheader">
                PO Count
              </div>
              <div className={styles.headCell} role="columnheader">
                Vendor
              </div>
              <div className={styles.headCell} role="columnheader">
                ETD / ETA
              </div>
              <div className={`${styles.headCell} ${styles.headCellRight}`} role="columnheader">
                Status / Action
              </div>
            </div>
          </div>
          <ul className={styles.list}>
            {rows.map((row) => {
              const tone = getShipmentDashboardTone(row.current_status);
              const vendor = formatDashboardVendorName(row.vendor_name ?? row.supplier_name);
              const vendorTitle = vendor === "—" ? undefined : vendor;
              const statusLabel = formatShipmentStatusTitleCase(row.current_status);
              const isActionCta = tone === "actionPrimary";
              return (
                <li key={row.id} className={styles.rowWrap}>
                  <Link href={`/dashboard/shipments/${row.id}`} className={styles.row}>
                    <div className={styles.grid}>
                      <span className={styles.shipmentId}>{row.shipment_number}</span>
                      <span className={styles.poCount}>{formatPoSummaryLine(row.linked_po_count ?? 0)}</span>
                      <span className={styles.vendor} title={vendorTitle}>
                        {vendor}
                      </span>
                      <span className={styles.schedule}>{formatScheduleContext(row)}</span>
                      <div className={styles.statusCell}>
                        <span
                          className={`${styles.statusPill} ${TONE_CLASS[tone]} ${isActionCta ? styles.actionPrimaryPill : ""}`}
                        >
                          {isActionCta ? (
                            <span className={styles.actionPrimaryLabel}>{statusLabel}</span>
                          ) : (
                            statusLabel
                          )}
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
