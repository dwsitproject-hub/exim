"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatShipmentStatusTitleCase } from "@/lib/shipment-status-title-case";
import type { ShipmentAnalyticsGroupShipmentRow } from "@/types/analytics";
import expandStyles from "@/components/dashboard/GroupedShipmentExpandRows.module.css";

export interface LogisticsExpandableGroupRowProps {
  rowKey: string;
  ptPlantLabel: string;
  itemDescription: string;
  metricCells: ReactNode[];
  forwarder: string;
  expanded: boolean;
  expandEnabled: boolean;
  loading: boolean;
  error: string | null;
  shipments: ShipmentAnalyticsGroupShipmentRow[];
  shipmentDetailBasePath: string;
  onToggle: () => void;
  colSpan: number;
}

export function LogisticsExpandableGroupRow({
  rowKey,
  ptPlantLabel,
  itemDescription,
  metricCells,
  forwarder,
  expanded,
  expandEnabled,
  loading,
  error,
  shipments,
  shipmentDetailBasePath,
  onToggle,
  colSpan,
}: LogisticsExpandableGroupRowProps) {
  return (
    <>
      <tr key={rowKey} className="border-b border-slate-100 transition-colors hover:bg-slate-50/90">
        <td className="whitespace-nowrap px-2 py-2.5">
          {expandEnabled ? (
            <button
              type="button"
              className={expandStyles.expandBtn}
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse shipments" : "Expand shipments"}
              onClick={onToggle}
            >
              {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>
          ) : null}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-900">{ptPlantLabel}</td>
        <td className="px-3 py-2.5 text-slate-700">{itemDescription}</td>
        {metricCells.map((cell, i) => (
          <td key={i} className="whitespace-nowrap px-3 py-2.5 font-mono tabular-nums text-slate-900">
            {cell}
          </td>
        ))}
        <td className="px-3 py-2.5 text-slate-600">{forwarder}</td>
      </tr>
      {expandEnabled && expanded ? (
        loading ? (
          <tr className="bg-slate-50/80">
            <td colSpan={colSpan} className="px-3 py-2 text-sm text-slate-500">
              Loading shipments…
            </td>
          </tr>
        ) : error ? (
          <tr className="bg-slate-50/80">
            <td colSpan={colSpan} className="px-3 py-2 text-sm text-[#c43a31]">
              {error}
            </td>
          </tr>
        ) : shipments.length === 0 ? (
          <tr className="bg-slate-50/80">
            <td colSpan={colSpan} className="px-3 py-2 text-sm text-slate-500">
              No shipments for this group.
            </td>
          </tr>
        ) : (
          shipments.map((s) => (
            <tr key={s.id} className="border-b border-slate-100 bg-slate-50/80">
              <td />
              <td colSpan={colSpan - 1} className="px-3 py-2 text-sm">
                <Link
                  href={`${shipmentDetailBasePath}/${s.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[#c43a31] hover:underline"
                >
                  {s.shipment_number}
                </Link>
                {s.current_status ? (
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {formatShipmentStatusTitleCase(s.current_status)}
                  </span>
                ) : null}
              </td>
            </tr>
          ))
        )
      ) : null}
    </>
  );
}
