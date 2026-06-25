"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { can } from "@/lib/permissions";
import { listShipments } from "@/services/shipments-service";
import { isApiError } from "@/types/api";
import type { ApiSuccess } from "@/types/api";
import type { ShipmentListItem } from "@/types/shipments";
import { formatShipmentStatusTitleCase } from "@/lib/shipment-status-title-case";
import { getShipmentTimelineAccent } from "@/lib/shipment-timeline-status-accent";
import { formatDayMonthYear } from "@/lib/format-date";
import { computeOnTimeStatus } from "@/lib/shipment-performance-on-time";
import { getShipmentEtaOverdueDays } from "@/lib/shipment-eta-overdue";
import { Card } from "@/components/cards";
import {
  SHIPMENT_PERFORMANCE_TIMELINE_ORDER,
  type ShipmentPerformanceModalRow,
} from "@/types/shipment-performance";
import type { ShipmentPerformanceDeepLinkPreview } from "@/lib/shipment-performance-deep-link";
import {
  buildShipmentPerformanceDeepLinkHref,
  filterShipmentListItemsForPerformancePreview,
  performanceCompletionRateTooltip,
  performanceLateDelayedTooltip,
  performanceStatusFilterTooltip,
  shipmentPerformanceDeepLinkPreviewTitle,
} from "@/lib/shipment-performance-deep-link";
import styles from "./ShipmentPerformanceCard.module.css";

const VIEW_SHIPMENTS = "VIEW_SHIPMENTS";
const FETCH_LIMIT = 100;
const MAX_PAGES = 50;
const VIRTUAL_THRESHOLD = 100;
const ROW_HEIGHT = 52;

function accentSegmentClass(a: ReturnType<typeof getShipmentTimelineAccent>): string {
  if (a === "red") return styles.accentRed;
  if (a === "green") return styles.accentGreen;
  if (a === "blue") return styles.accentBlue;
  return styles.accentSlate;
}

function accentTopBorderClass(a: ReturnType<typeof getShipmentTimelineAccent>): string {
  if (a === "red") return styles.statusTopRed;
  if (a === "green") return styles.statusTopGreen;
  if (a === "blue") return styles.statusTopBlue;
  return styles.statusTopSlate;
}

function toModalRow(item: ShipmentListItem): ShipmentPerformanceModalRow {
  const pos = item.linked_pos ?? [];
  const poNumber =
    pos.length === 0
      ? "—"
      : pos.length === 1
        ? pos[0].po_number
        : pos.map((p) => p.po_number.trim()).filter(Boolean).join(", ");
  return {
    id: item.id,
    shipmentNumber: item.shipment_number,
    status: item.current_status,
    pt: item.display_pt,
    plant: item.display_plant,
    poNumber,
    vendor: item.vendor_name ?? item.supplier_name,
    forwarder: item.forwarder_name?.trim() ?? "",
    eta: item.eta,
  };
}

async function fetchAllShipments(accessToken: string): Promise<ShipmentListItem[]> {
  const all: ShipmentListItem[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await listShipments({ page, limit: FETCH_LIMIT }, accessToken);
    if (isApiError(res) || !res.success) break;
    const chunk = (res as ApiSuccess<ShipmentListItem[]>).data ?? [];
    all.push(...chunk);
    if (chunk.length < FETCH_LIMIT) break;
  }
  return all;
}

function OnTimeTag({ display }: { display: ReturnType<typeof computeOnTimeStatus> }) {
  if (display.kind === "muted") {
    return <span className={`${styles.tag} ${styles.tagMuted}`}>—</span>;
  }
  const cls =
    display.kind === "late"
      ? styles.tagLate
      : display.kind === "at_risk"
        ? styles.tagAtRisk
        : styles.tagOnTime;
  return <span className={`${styles.tag} ${cls}`}>{display.label}</span>;
}

function ModalTableRow({
  row,
  trStyle,
}: {
  row: ShipmentPerformanceModalRow;
  trStyle?: CSSProperties;
}) {
  const ots = computeOnTimeStatus(row.status, row.eta);
  const overdueDays = getShipmentEtaOverdueDays(row.status, row.eta);
  const empty = styles.emptyCell;
  const etaIso =
    row.eta != null && String(row.eta).trim() !== ""
      ? row.eta instanceof Date
        ? row.eta.toISOString().slice(0, 10)
        : String(row.eta)
      : null;

  return (
    <tr style={trStyle}>
      <td className={styles.td}>
        <Link href={`/dashboard/shipments/${row.id}`} className={styles.shipLink} onClick={(e) => e.stopPropagation()}>
          {row.shipmentNumber}
        </Link>
      </td>
      <td className={styles.td}>{formatShipmentStatusTitleCase(row.status)}</td>
      <td className={styles.td}>
        <span className={styles.truncate} title={row.pt ?? undefined}>
          {row.pt?.trim() ? row.pt : <span className={empty}>—</span>}
        </span>
      </td>
      <td className={styles.td}>{row.plant?.trim() ? row.plant : <span className={empty}>—</span>}</td>
      <td className={styles.td}>
        <span className={styles.truncate} title={row.poNumber}>
          {row.poNumber}
        </span>
      </td>
      <td className={styles.td}>
        <span className={styles.truncate} title={row.vendor ?? undefined}>
          {row.vendor?.trim() ? row.vendor : <span className={empty}>—</span>}
        </span>
      </td>
      <td className={styles.td}>
        <span className={styles.truncate} title={row.forwarder || undefined}>
          {row.forwarder ? row.forwarder : <span className={empty}>—</span>}
        </span>
      </td>
      <td className={`${styles.td} ${styles.tdRight}`}>
        <div className={styles.etaCell}>
          {etaIso ? (
            <>
              <span>{formatDayMonthYear(etaIso)}</span>
              {overdueDays != null && (
                <span className={styles.etaOverdue}>
                  (Overdue {overdueDays} {overdueDays === 1 ? "day" : "days"})
                </span>
              )}
            </>
          ) : (
            <span className={empty}>—</span>
          )}
        </div>
      </td>
      <td className={styles.td}>
        <OnTimeTag display={ots} />
      </td>
    </tr>
  );
}

export function ShipmentPerformanceCard() {
  const { user, accessToken } = useAuth();
  const allowed = can(user, VIEW_SHIPMENTS);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ShipmentListItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [deepLinkPreview, setDeepLinkPreview] = useState<ShipmentPerformanceDeepLinkPreview | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [previewSearch, setPreviewSearch] = useState("");
  const scrollParentRef = useRef<HTMLDivElement>(null);
  const previewScrollParentRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!accessToken || !allowed) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchAllShipments(accessToken);
      setItems(rows);
    } catch {
      setError("Failed to load shipments");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, allowed]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!modalOpen && !deepLinkPreview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (deepLinkPreview) setDeepLinkPreview(null);
      else setModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, deepLinkPreview]);

  useEffect(() => {
    if (!modalOpen) setSearch("");
  }, [modalOpen]);

  useEffect(() => {
    if (!deepLinkPreview) setPreviewSearch("");
  }, [deepLinkPreview]);

  const countsByStatus = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of SHIPMENT_PERFORMANCE_TIMELINE_ORDER) m.set(s, 0);
    for (const row of items) {
      const key = row.current_status;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [items]);

  const total = items.length;

  const metrics = useMemo(() => {
    let delivered = 0;
    let late = 0;
    for (const row of items) {
      if (row.current_status === "DELIVERED") delivered += 1;
      const ots = computeOnTimeStatus(row.current_status, row.eta);
      if (ots.kind === "late") late += 1;
    }
    const completionRate = total > 0 ? (delivered / total) * 100 : 0;
    const lateRate = total > 0 ? (late / total) * 100 : 0;
    return { delivered, late, completionRate, lateRate };
  }, [items, total]);

  const modalRows: ShipmentPerformanceModalRow[] = useMemo(() => items.map(toModalRow), [items]);

  const filteredModalRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return modalRows;
    return modalRows.filter((r) => {
      const idMatch = r.id.toLowerCase().includes(q);
      const shipMatch = r.shipmentNumber.toLowerCase().includes(q);
      const vendorMatch = (r.vendor ?? "").toLowerCase().includes(q);
      return idMatch || shipMatch || vendorMatch;
    });
  }, [modalRows, search]);

  const previewBaseItems = useMemo(() => {
    if (!deepLinkPreview) return [];
    return filterShipmentListItemsForPerformancePreview(items, deepLinkPreview);
  }, [items, deepLinkPreview]);

  const previewModalRows = useMemo(() => previewBaseItems.map(toModalRow), [previewBaseItems]);

  const previewFilteredModalRows = useMemo(() => {
    const q = previewSearch.trim().toLowerCase();
    if (!q) return previewModalRows;
    return previewModalRows.filter((r) => {
      const idMatch = r.id.toLowerCase().includes(q);
      const shipMatch = r.shipmentNumber.toLowerCase().includes(q);
      const vendorMatch = (r.vendor ?? "").toLowerCase().includes(q);
      return idMatch || shipMatch || vendorMatch;
    });
  }, [previewModalRows, previewSearch]);

  const useVirtual = modalOpen && filteredModalRows.length > VIRTUAL_THRESHOLD;

  const rowVirtualizer = useVirtualizer({
    count: useVirtual ? filteredModalRows.length : 0,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const virtualItems = useVirtual ? rowVirtualizer.getVirtualItems() : [];
  const totalVirtualSize = useVirtual ? rowVirtualizer.getTotalSize() : 0;

  const useVirtualPreview = deepLinkPreview != null && previewFilteredModalRows.length > VIRTUAL_THRESHOLD;

  const previewRowVirtualizer = useVirtualizer({
    count: useVirtualPreview ? previewFilteredModalRows.length : 0,
    getScrollElement: () => previewScrollParentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const previewVirtualItems = useVirtualPreview ? previewRowVirtualizer.getVirtualItems() : [];
  const previewTotalVirtualSize = useVirtualPreview ? previewRowVirtualizer.getTotalSize() : 0;

  if (!allowed) return null;

  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const lastVi = virtualItems.length > 0 ? virtualItems[virtualItems.length - 1] : null;
  const paddingBottom =
    useVirtual && lastVi != null ? Math.max(0, totalVirtualSize - lastVi.end) : 0;

  const previewPaddingTop =
    previewVirtualItems.length > 0 ? previewVirtualItems[0].start : 0;
  const previewLastVi =
    previewVirtualItems.length > 0 ? previewVirtualItems[previewVirtualItems.length - 1] : null;
  const previewPaddingBottom =
    useVirtualPreview && previewLastVi != null
      ? Math.max(0, previewTotalVirtualSize - previewLastVi.end)
      : 0;

  return (
    <>
      <Card
        className={styles.card}
        role="button"
        tabIndex={0}
        onClick={() => {
          setDeepLinkPreview(null);
          setModalOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setDeepLinkPreview(null);
            setModalOpen(true);
          }
        }}
        aria-label="Open shipment performance detail"
      >
        <div className={styles.cardInner}>
          <h3 className={styles.title}>Shipment performance</h3>
          <p className={styles.hint}>
            Status mix aligned with the operational timeline. Click for the full shipment list.
          </p>
          {error && <p className={styles.hint}>{error}</p>}
          {loading && !items.length ? (
            <p className={styles.hint}>Loading…</p>
          ) : (
            <>
              <div className={styles.summaryRow}>
                <div className={styles.summaryBlock}>
                  <p className={styles.summaryValue}>{total}</p>
                  <p className={styles.summaryLabel}>Total shipments</p>
                </div>
                <button
                  type="button"
                  className={`${styles.summaryBlock} ${styles.summaryBlockBtn}`}
                  title={performanceCompletionRateTooltip(metrics.delivered)}
                  aria-label={`Open shipment list: ${metrics.delivered} delivered`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setModalOpen(false);
                    setDeepLinkPreview({ kind: "completion" });
                  }}
                >
                  <p className={`${styles.summaryValue} ${styles.summaryValueGreen}`}>
                    {metrics.completionRate.toFixed(0)}%
                  </p>
                  <p className={styles.summaryLabel}>Completion rate</p>
                </button>
                <button
                  type="button"
                  className={`${styles.summaryBlock} ${styles.summaryBlockBtn}`}
                  title={performanceLateDelayedTooltip(metrics.late)}
                  aria-label={`Open shipment list: ${metrics.late} late or delayed by ETA`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setModalOpen(false);
                    setDeepLinkPreview({ kind: "late" });
                  }}
                >
                  <p className={`${styles.summaryValue} ${styles.summaryValueRed}`}>
                    {metrics.lateRate.toFixed(0)}%
                  </p>
                  <p className={styles.summaryLabel}>Late / delayed rate</p>
                </button>
              </div>

              <div className={styles.segmentBar} aria-hidden={total === 0}>
                {SHIPMENT_PERFORMANCE_TIMELINE_ORDER.map((status) => {
                  const c = countsByStatus.get(status) ?? 0;
                  const pct = total > 0 ? (c / total) * 100 : 0;
                  const accent = getShipmentTimelineAccent(status);
                  const label = formatShipmentStatusTitleCase(status);
                  return (
                    <button
                      key={status}
                      type="button"
                      className={`${styles.segment} ${styles.segmentBtn} ${accentSegmentClass(accent)}`}
                      style={{ width: `${pct}%` }}
                      title={performanceStatusFilterTooltip(c, label)}
                      aria-label={`Open shipment list filtered by ${label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setModalOpen(false);
                        setDeepLinkPreview({ kind: "status", status });
                      }}
                    />
                  );
                })}
              </div>

              <div className={styles.statusGrid}>
                {SHIPMENT_PERFORMANCE_TIMELINE_ORDER.map((status) => {
                  const c = countsByStatus.get(status) ?? 0;
                  const accent = getShipmentTimelineAccent(status);
                  const empty = c === 0;
                  const label = formatShipmentStatusTitleCase(status);
                  return (
                    <button
                      key={status}
                      type="button"
                      className={`${styles.statusBox} ${styles.statusBoxBtn} ${accentTopBorderClass(accent)} ${empty ? styles.statusBoxEmpty : ""}`}
                      title={performanceStatusFilterTooltip(c, label)}
                      aria-label={`Open shipment list filtered by ${label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setModalOpen(false);
                        setDeepLinkPreview({ kind: "status", status });
                      }}
                    >
                      <p className={styles.statusBoxCount}>{c}</p>
                      <p className={styles.statusBoxLabel}>{label}</p>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </Card>

      {deepLinkPreview && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setDeepLinkPreview(null)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shipment-performance-preview-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <h2 id="shipment-performance-preview-modal-title" className={styles.modalTitle}>
                  {shipmentPerformanceDeepLinkPreviewTitle(deepLinkPreview)}
                </h2>
                <p className={styles.modalHint}>
                  {previewBaseItems.length} shipment(s) in this snapshot match the filter you chose. Use
                  the Shipments page for pagination, sorting, and column filters.
                </p>
              </div>
              <div className={styles.modalHeaderActions}>
                <Link
                  href={buildShipmentPerformanceDeepLinkHref(deepLinkPreview)}
                  className={styles.openListLink}
                  onClick={() => setDeepLinkPreview(null)}
                >
                  Open in Shipments page
                </Link>
                <button
                  type="button"
                  className={styles.modalClose}
                  aria-label="Close"
                  onClick={() => setDeepLinkPreview(null)}
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className={styles.modalToolbar}>
              <label className={styles.searchLabel}>
                <span className={styles.searchLabelText}>Search</span>
                <input
                  type="search"
                  className={styles.searchInput}
                  placeholder="Shipment ID, number, or vendor"
                  value={previewSearch}
                  onChange={(e) => setPreviewSearch(e.target.value)}
                  aria-label="Filter preview by shipment ID or vendor"
                />
              </label>
            </div>
            <div ref={previewScrollParentRef} className={`${styles.tableScroll} ${styles.tableFont}`}>
              <table className={styles.table}>
                <thead className={styles.thead}>
                  <tr>
                    <th className={styles.th}>Shipment (ID)</th>
                    <th className={styles.th}>Status</th>
                    <th className={styles.th}>PT</th>
                    <th className={styles.th}>Plant</th>
                    <th className={styles.th}>PO number</th>
                    <th className={styles.th}>Vendor</th>
                    <th className={styles.th}>Forwarder</th>
                    <th className={`${styles.th} ${styles.thRight}`}>ETA</th>
                    <th className={styles.th}>On time status</th>
                  </tr>
                </thead>
                <tbody>
                  {previewFilteredModalRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className={styles.tdEmpty}>
                        {previewModalRows.length === 0
                          ? "No shipments match this filter in the current snapshot."
                          : "No rows match your search."}
                      </td>
                    </tr>
                  ) : useVirtualPreview ? (
                    <>
                      {previewPaddingTop > 0 && (
                        <tr aria-hidden>
                          <td colSpan={9} className={styles.tdSpacer} style={{ height: previewPaddingTop }} />
                        </tr>
                      )}
                      {previewVirtualItems.map((vi) => (
                        <ModalTableRow
                          key={previewFilteredModalRows[vi.index].id}
                          row={previewFilteredModalRows[vi.index]}
                          trStyle={{ height: vi.size }}
                        />
                      ))}
                      {previewPaddingBottom > 0 && (
                        <tr aria-hidden>
                          <td
                            colSpan={9}
                            className={styles.tdSpacer}
                            style={{ height: previewPaddingBottom }}
                          />
                        </tr>
                      )}
                    </>
                  ) : (
                    previewFilteredModalRows.map((row) => <ModalTableRow key={row.id} row={row} />)
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setModalOpen(false)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shipment-performance-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2 id="shipment-performance-modal-title" className={styles.modalTitle}>
                Detailed shipment list
              </h2>
              <div className={styles.modalHeaderActions}>
                <Link href="/dashboard/shipments" className={styles.openListLink} onClick={() => setModalOpen(false)}>
                  Open in Shipments page
                </Link>
                <button
                  type="button"
                  className={styles.modalClose}
                  aria-label="Close"
                  onClick={() => setModalOpen(false)}
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className={styles.modalToolbar}>
              <label className={styles.searchLabel}>
                <span className={styles.searchLabelText}>Search</span>
                <input
                  type="search"
                  className={styles.searchInput}
                  placeholder="Shipment ID, number, or vendor"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Filter by shipment ID or vendor"
                />
              </label>
            </div>
            <div ref={scrollParentRef} className={`${styles.tableScroll} ${styles.tableFont}`}>
              <table className={styles.table}>
                <thead className={styles.thead}>
                  <tr>
                    <th className={styles.th}>Shipment (ID)</th>
                    <th className={styles.th}>Status</th>
                    <th className={styles.th}>PT</th>
                    <th className={styles.th}>Plant</th>
                    <th className={styles.th}>PO number</th>
                    <th className={styles.th}>Vendor</th>
                    <th className={styles.th}>Forwarder</th>
                    <th className={`${styles.th} ${styles.thRight}`}>ETA</th>
                    <th className={styles.th}>On time status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredModalRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className={styles.tdEmpty}>
                        No rows match your search.
                      </td>
                    </tr>
                  ) : useVirtual ? (
                    <>
                      {paddingTop > 0 && (
                        <tr aria-hidden>
                          <td colSpan={9} className={styles.tdSpacer} style={{ height: paddingTop }} />
                        </tr>
                      )}
                      {virtualItems.map((vi) => (
                        <ModalTableRow
                          key={filteredModalRows[vi.index].id}
                          row={filteredModalRows[vi.index]}
                          trStyle={{ height: vi.size }}
                        />
                      ))}
                      {paddingBottom > 0 && (
                        <tr aria-hidden>
                          <td colSpan={9} className={styles.tdSpacer} style={{ height: paddingBottom }} />
                        </tr>
                      )}
                    </>
                  ) : (
                    filteredModalRows.map((row) => <ModalTableRow key={row.id} row={row} />)
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
