"use client";

import Link from "next/link";
import { formatShipmentStatusTitleCase } from "@/lib/shipment-status-title-case";
import { idrToDashboardUsd } from "@/lib/dashboard-currency-context";
import { TableCell, TableRow } from "@/components/tables";
import type { ShipmentAnalyticsGroupShipmentRow } from "@/types/analytics";
import styles from "./GroupedShipmentExpandRows.module.css";

function formatQtyDelivered(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(n);
}

export interface GroupedShipmentExpandRowsProps {
  shipments: ShipmentAnalyticsGroupShipmentRow[];
  loading?: boolean;
  error?: string | null;
  shipmentDetailBasePath: string;
  idrPerUsd: number;
  formatUsd: (n: number) => string;
  colSpan: number;
  showQtyValue?: boolean;
  /** Match parent table columns (expand, PT–Plant, item, unit, qty, price). */
  alignColumns?: boolean;
  tdNumClassName?: string;
}

export function GroupedShipmentExpandRows({
  shipments,
  loading = false,
  error = null,
  shipmentDetailBasePath,
  idrPerUsd,
  formatUsd,
  colSpan,
  showQtyValue = true,
  alignColumns = false,
  tdNumClassName = "",
}: GroupedShipmentExpandRowsProps) {
  if (loading) {
    return (
      <tr className={styles.subRow}>
        <td colSpan={colSpan} className={styles.subCell}>
          <span className={styles.subHint}>Loading shipments…</span>
        </td>
      </tr>
    );
  }

  if (error) {
    return (
      <tr className={styles.subRow}>
        <td colSpan={colSpan} className={styles.subCell}>
          <span className={styles.subError}>{error}</span>
        </td>
      </tr>
    );
  }

  if (shipments.length === 0) {
    return (
      <tr className={styles.subRow}>
        <td colSpan={colSpan} className={styles.subCell}>
          <span className={styles.subHint}>No shipments for this group.</span>
        </td>
      </tr>
    );
  }

  if (alignColumns && showQtyValue) {
    return (
      <>
        {shipments.map((s) => (
          <TableRow key={s.id} className={styles.subRow}>
            <TableCell className={styles.subIndentCell} />
            <TableCell className={styles.subIndentCell} />
            <TableCell className={styles.subShipmentCell}>
              <Link
                href={`${shipmentDetailBasePath}/${s.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.shipmentLink}
              >
                {s.shipment_number}
              </Link>
              {s.current_status ? (
                <span className={styles.subStatus}>{formatShipmentStatusTitleCase(s.current_status)}</span>
              ) : null}
            </TableCell>
            <TableCell className={styles.subMutedCell} />
            <TableCell className={styles.subQtyCell}>{formatQtyDelivered(s.group_qty_delivered)}</TableCell>
            <TableCell className={`${styles.subQtyCell} ${tdNumClassName}`.trim()}>
              {formatUsd(idrToDashboardUsd(s.group_amount_idr, idrPerUsd))}
            </TableCell>
          </TableRow>
        ))}
      </>
    );
  }

  const metaColSpan = showQtyValue ? colSpan - 3 : colSpan - 1;

  return (
    <>
      {shipments.map((s) => (
        <tr key={s.id} className={styles.subRow}>
          <td className={styles.subCell} />
          <td colSpan={metaColSpan} className={styles.subCell}>
            <Link
              href={`${shipmentDetailBasePath}/${s.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.shipmentLink}
            >
              {s.shipment_number}
            </Link>
            {s.current_status ? (
              <span className={styles.subStatus}>{formatShipmentStatusTitleCase(s.current_status)}</span>
            ) : null}
          </td>
          {showQtyValue ? (
            <>
              <td className={styles.subCell}>{formatQtyDelivered(s.group_qty_delivered)}</td>
              <td className={`${styles.subCell} ${styles.subNum}`}>
                {formatUsd(idrToDashboardUsd(s.group_amount_idr, idrPerUsd))}
              </td>
            </>
          ) : null}
        </tr>
      ))}
    </>
  );
}
