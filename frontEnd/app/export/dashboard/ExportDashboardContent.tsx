"use client";



import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { useAuth } from "@/hooks/use-auth";

import {

  getExportBulkingFilterOptions,

  listExportBulkingShipments,

} from "@/services/export-bulking-service";

import { StatsCard } from "@/components/cards";

import { LoadingSkeleton } from "@/components/feedback";

import { PageHeader } from "@/components/navigation";

import { IconShip, IconClock, IconCheck, IconDocument } from "@/components/icons/KpiIcons";

import { isApiError } from "@/types/api";

import type { ApiSuccess } from "@/types/api";

import type { ExportBulkingListItem } from "@/types/export-bulking";

import {

  EXPORT_BULKING_STATUSES,

  EXPORT_BULKING_STATUS_LABELS,

} from "@/types/export-bulking";

import {

  computeDocBacklogCounts,

  getDocsAttentionReason,

  getOpsAttentionReason,

} from "@/lib/export-bulking-backlog";

import styles from "./ExportDashboardContent.module.css";



const STATUS_PILL_CLASS: Record<string, string> = {
  SHIPMENT_PLANNING: "#52525b",
  NOMINATION: "#1d4ed8",
  SI_RECEIVE: "#92400e",
  ARRIVAL: "#283593",
  AT_BERTH: "#00695c",
  LOADING: "#e65100",
  NPE: "#ad1457",
  CASE_OFF: "#1b5e20",
};



export function ExportDashboardContent() {

  const { user, accessToken, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});

  const [shipments, setShipments] = useState<ExportBulkingListItem[]>([]);



  useEffect(() => {

    if (!accessToken) {

      setLoading(false);

      return;

    }

    let cancelled = false;

    setLoading(true);

    setError(null);



    Promise.all([

      getExportBulkingFilterOptions(accessToken),

      listExportBulkingShipments({ page: 1, limit: 100, sort_by: "eta", sort_dir: "asc" }, accessToken),

    ])

      .then(([optsRes, listRes]) => {

        if (cancelled) return;

        if (!isApiError(optsRes) && optsRes.data?.status_counts) {

          setStatusCounts(optsRes.data.status_counts);

        }

        if (!isApiError(listRes)) {

          const success = listRes as ApiSuccess<ExportBulkingListItem[]>;

          setShipments(success.data ?? []);

        } else {

          setError("Failed to load export dashboard");

        }

      })

      .catch(() => {

        if (!cancelled) setError("Failed to load export dashboard");

      })

      .finally(() => {

        if (!cancelled) setLoading(false);

      });



    return () => {

      cancelled = true;

    };

  }, [accessToken]);



  const totalActive = useMemo(

    () => Object.values(statusCounts).reduce((a, b) => a + b, 0),

    [statusCounts],

  );



  const etaThisWeek = useMemo(() => {

    const now = Date.now();

    const week = 7 * 24 * 60 * 60 * 1000;

    return shipments.filter((s) => {

      if (!s.eta) return false;

      const d = new Date(s.eta).getTime() - now;

      return d >= 0 && d <= week;

    }).length;

  }, [shipments]);



  const overdue = useMemo(() => {

    const now = Date.now();

    return shipments.filter((s) => s.eta && new Date(s.eta).getTime() < now).length;

  }, [shipments]);



  const voyageCount = (statusCounts.ARRIVAL ?? 0) + (statusCounts.AT_BERTH ?? 0) + (statusCounts.LOADING ?? 0) + (statusCounts.NPE ?? 0) + (statusCounts.CASE_OFF ?? 0);



  const docBacklog = useMemo(() => computeDocBacklogCounts(shipments), [shipments]);



  const opsAttentionRows = useMemo(() => {

    return shipments

      .map((row) => ({ row, reason: getOpsAttentionReason(row) }))

      .filter((x): x is { row: ExportBulkingListItem; reason: string } => x.reason != null)

      .slice(0, 8);

  }, [shipments]);



  const docsAttentionRows = useMemo(() => {

    return shipments

      .map((row) => ({ row, reason: getDocsAttentionReason(row) }))

      .filter((x): x is { row: ExportBulkingListItem; reason: string } => x.reason != null)

      .slice(0, 8);

  }, [shipments]);



  const maxStatusCount = Math.max(1, ...Object.values(statusCounts));



  if (authLoading) return <LoadingSkeleton lines={5} className={styles.loading} />;

  if (error) return <p className={styles.error}>{error}</p>;



  return (

    <section>

      <PageHeader

        title="Export Dashboard"

        subtitle={user ? `Welcome, ${user.name}. Overview of export bulking operations and documentation.` : undefined}

        backHref="/"

        backLabel="Hub"

      />



      {loading ? (

        <LoadingSkeleton lines={4} className={styles.loading} />

      ) : (

        <>

          <div className={styles.kpiBand}>

            <h2 className={styles.kpiBandLabel}>Operations</h2>

            <div className={styles.summaryGrid}>

              <StatsCard

                label="Active shipments"

                value={totalActive}

                href="/export/bulking?view=operations"

                icon={<IconShip />}

              />

              <StatsCard

                label="ETA this week"

                value={etaThisWeek}

                href="/export/bulking?view=operations"

                icon={<IconClock />}

              />

              <StatsCard

                label="ETA overdue"

                value={overdue}

                href="/export/bulking?view=operations&backlog=eta_overdue"

                icon={<IconDocument />}

              />

              <StatsCard

                label="Port operations"

                value={voyageCount}

                href="/export/bulking?view=operations&statuses=ARRIVAL,AT_BERTH,LOADING,NPE,CASE_OFF"

                icon={<IconCheck />}

              />

            </div>

          </div>



          <div className={styles.kpiBand}>

            <h2 className={styles.kpiBandLabel}>Documentation</h2>

            <div className={styles.summaryGrid}>

              <StatsCard

                label="Missing SI"

                value={docBacklog.missingSi}

                href="/export/bulking?view=documentation&backlog=missing_si"

                icon={<IconDocument />}

              />

              <StatsCard

                label="Missing invoice"

                value={docBacklog.missingInvoice}

                href="/export/bulking?view=documentation&backlog=missing_invoice"

                icon={<IconDocument />}

              />

              <StatsCard

                label="Missing packing list"

                value={docBacklog.missingPl}

                href="/export/bulking?view=documentation&backlog=missing_pl"

                icon={<IconDocument />}

              />

              <StatsCard

                label="Docs complete"

                value={docBacklog.docsComplete}

                href="/export/bulking?view=documentation&backlog=docs_complete"

                icon={<IconCheck />}

              />

            </div>

          </div>



          <div className={styles.quickActions}>

            <span className={styles.quickActionsLabel}>Quick actions</span>

            <div className={styles.quickActionsButtons}>

              <Link href="/export/bulking?create=1" className={styles.btnPrimary}>

                New shipment

              </Link>

              <Link href="/export/bulking" className={styles.btnSecondary}>

                View all bulking

              </Link>

            </div>

          </div>



          <div className={styles.statusBreakdown}>

            <h2 className={styles.statusBreakdownTitle}>Shipments by status</h2>

            {EXPORT_BULKING_STATUSES.map((status) => {

              const count = statusCounts[status] ?? 0;

              const pct = Math.round((count / maxStatusCount) * 100);

              return (

                <div key={status} className={styles.statusRow}>

                  <span

                    className={styles.statusPill}

                    style={{

                      background: `${STATUS_PILL_CLASS[status]}22`,

                      color: STATUS_PILL_CLASS[status],

                    }}

                  >

                    {EXPORT_BULKING_STATUS_LABELS[status]}

                  </span>

                  <div className={styles.statusBar}>

                    <div

                      className={styles.statusBarFill}

                      style={{

                        width: `${pct}%`,

                        background: STATUS_PILL_CLASS[status],

                      }}

                    />

                  </div>

                  <span style={{ fontSize: 12, color: "#6b6b6b", minWidth: 72 }}>

                    {count} {count === 1 ? "shipment" : "shipments"}

                  </span>

                </div>

              );

            })}

          </div>



          <div className={styles.attentionGrid}>

            <div className={styles.attentionSection}>

              <h2 className={styles.attentionTitle}>Needs attention — Operations</h2>

              {opsAttentionRows.length === 0 ? (

                <p className={styles.attentionEmpty}>No urgent operations items.</p>

              ) : (

                <ul className={styles.attentionList}>

                  {opsAttentionRows.map(({ row, reason }) => (

                    <li key={row.id} className={styles.attentionItem}>

                      <span>

                        <strong>{row.shipment_no}</strong>

                        {" · "}

                        {row.vessel_name ?? "—"}

                        {" — "}

                        <span style={{ color: "#6b6b6b" }}>{reason}</span>

                      </span>

                      <Link href={`/export/bulking/${row.id}`} className={styles.attentionLink}>

                        Open →

                      </Link>

                    </li>

                  ))}

                </ul>

              )}

            </div>



            <div className={styles.attentionSection}>

              <h2 className={styles.attentionTitle}>Needs attention — Documentation</h2>

              {docsAttentionRows.length === 0 ? (

                <p className={styles.attentionEmpty}>No urgent documentation items.</p>

              ) : (

                <ul className={styles.attentionList}>

                  {docsAttentionRows.map(({ row, reason }) => (

                    <li key={row.id} className={styles.attentionItem}>

                      <span>

                        <strong>{row.shipment_no}</strong>

                        {" · "}

                        {row.vessel_name ?? "—"}

                        {" — "}

                        <span style={{ color: "#6b6b6b" }}>{reason}</span>

                      </span>

                      <Link href={`/export/bulking/${row.id}?focus=documents`} className={styles.attentionLink}>

                        Open →

                      </Link>

                    </li>

                  ))}

                </ul>

              )}

            </div>

          </div>

        </>

      )}

    </section>

  );

}

