"use client";

import {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  createContext,
  useContext,
  Children,
  type ReactNode,
} from "react";
import {
  ClipboardList,
  CalendarClock,
  FileText,
  Anchor,
  Ship,
  Package,
  FileCheck,
  Navigation,
  ScrollText,
  Receipt,
  Box,
} from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/navigation";
import { Card } from "@/components/cards";
import { ComboboxSelect } from "@/components/forms/ComboboxSelect/ComboboxSelect";
import { LoadingSkeleton } from "@/components/feedback";
import { useToast } from "@/components/providers/ToastProvider";
import { isApiError } from "@/types/api";
import {
  formatExportBulkingStatus,
  EXPORT_BULKING_STATUSES,
} from "@/types/export-bulking";
import type {
  ExportBulkingShipmentDetail,
  CargoLine,
  ShippingInstruction,
  Invoice,
  InvoiceLine,
  PackingList,
  PackingListLine,
  StatusEvent,
} from "@/types/export-bulking";
import {
  getExportBulkingShipment,
  updateExportBulkingShipment,
  updateExportBulkingStatus,
  upsertCargoLines,
  deleteCargoLine,
  createShippingInstruction,
  updateShippingInstruction,
  deleteShippingInstruction,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  createPackingList,
  updatePackingList,
  deletePackingList,
  getStatusEvents,
} from "@/services/export-bulking-service";
import {
  listShippers,
  listShipperLoadports,
  createShipperLoadport,
  type Shipper,
  type ShipperLoadport,
} from "@/services/shipper-service";
import { listAgents, createAgent, type Agent } from "@/services/agent-service";
import { INCOTERM_OPTIONS } from "@/lib/incoterms";
import { getCountryOptions, getCountryArea } from "@/lib/countries";
import { ComboboxSelectCreatable } from "@/components/forms/ComboboxSelect/ComboboxSelectCreatable";
import { DateRangeField } from "@/components/forms/DateRangeField";
import { Modal } from "@/components/overlays";
import { InvoiceDocument } from "@/components/export-bulking/InvoiceDocument";
import {
  PackingListDocument,
  type PackingListDocumentPreview,
} from "@/components/export-bulking/PackingListDocument";
import { ShippingInstructionDocument } from "@/components/export-bulking/ShippingInstructionDocument";
import { ProcessChecklist } from "@/components/export-bulking/ProcessChecklist";
import {
  canAdvanceExportBulkingStatus,
  getMissingRequirementLabels,
  getMissingVoyageCompletionLabels,
  getNextExportBulkingStatus,
} from "@/lib/export-status-requirements";
import { detailToCompletionInput } from "@/lib/export-bulking-completion";
import { findMatchingOption } from "@/lib/string-match";
import {
  formatMoneyDisplay,
  formatNumberDisplay as formatNumericDisplay,
  formatQuantityDisplay,
} from "@/lib/format-numbers";
import styles from "./ExportBulkingDetail.module.css";

// ─── helpers ────────────────────────────────────────────────────────────────

function toLocalDatetime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

function toLocalDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  } catch {
    return "";
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

function formatDatetime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function cargoQuantitySum(cargoLines: CargoLine[]): number {
  return cargoLines.reduce((sum, l) => sum + (l.quantity ?? 0), 0);
}

/** Shipment total: explicit field, else sum of cargo line quantities. */
function resolveShipmentTotalQuantity(data: Pick<ExportBulkingShipmentDetail, "total_quantity" | "cargo_lines">): number | null {
  if (data.total_quantity != null && !Number.isNaN(Number(data.total_quantity))) {
    return Number(data.total_quantity);
  }
  const sum = cargoQuantitySum(data.cargo_lines);
  return sum > 0 ? sum : null;
}

function formatQuantityFieldValue(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "";
  return formatQuantityDisplay(Number(value));
}

function formatNumericFieldValue(value: number | null | undefined, maxFractionDigits = 10): string {
  if (value == null || Number.isNaN(Number(value))) return "";
  return formatNumericDisplay(Number(value), maxFractionDigits);
}

function formatMoneyFieldValue(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "";
  return formatMoneyDisplay(Number(value));
}

function formatPercentDisplay(value: number, maxFractionDigits = 4): string {
  return `${formatNumericDisplay(value, maxFractionDigits)} %`;
}

function parseQuantityInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

async function syncCargoLinesFromTotalQuantity(
  shipmentId: string,
  totalQty: number,
  cargoLines: CargoLine[],
  previousTotal: number | null,
  accessToken: string,
): Promise<{ ok: boolean; message?: string }> {
  if (cargoLines.length === 0) {
    const res = await upsertCargoLines(
      shipmentId,
      [
        {
          line_order: 1,
          cargo_name: "Cargo 1",
          quantity: totalQty,
          unit: "MT",
          item_description: null,
          destination_port: null,
        },
      ],
      accessToken,
    );
    if (isApiError(res)) return { ok: false, message: res.message };
    return { ok: true };
  }

  if (cargoLines.length === 1) {
    const line = cargoLines[0];
    const lineQty = line.quantity != null ? Number(line.quantity) : null;
    const shouldSync =
      lineQty == null ||
      lineQty === 0 ||
      (previousTotal != null && lineQty === previousTotal);
    if (!shouldSync) return { ok: true };

    const res = await upsertCargoLines(
      shipmentId,
      [
        {
          id: line.id,
          line_order: line.line_order,
          cargo_name: line.cargo_name?.trim() || "Cargo 1",
          quantity: totalQty,
          unit: line.unit?.trim() || "MT",
          item_description: line.item_description,
          destination_port: line.destination_port,
          destination_country: line.destination_country,
          country_area: line.country_area,
          quantity_delivered: line.quantity_delivered ?? null,
          bl_figure: line.bl_figure ?? null,
          ship_figure: line.ship_figure ?? null,
        },
      ],
      accessToken,
    );
    if (isApiError(res)) return { ok: false, message: res.message };
    return { ok: true };
  }

  return { ok: true };
}

function nextStatus(current: string): string | null {
  const idx = EXPORT_BULKING_STATUSES.indexOf(current as never);
  if (idx < 0 || idx >= EXPORT_BULKING_STATUSES.length - 1) return null;
  return EXPORT_BULKING_STATUSES[idx + 1];
}

function statusBadgeClass(s: string): string {
  switch (s) {
    case "SHIPMENT_PLANNING": return styles.statusPlanning;
    case "NOMINATION": return styles.statusNomination;
    case "SI_RECEIVE": return styles.statusSiReceive;
    case "ARRIVAL": return styles.statusArrival;
    case "AT_BERTH": return styles.statusAtBerth;
    case "LOADING": return styles.statusLoading;
    case "NPE": return styles.statusNpe;
    case "CASE_OFF": return styles.statusCaseOff;
    default: return styles.statusPlanning;
  }
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ─── status stepper ──────────────────────────────────────────────────────────

function StatusStepper({
  data,
  onAdvance,
  readOnly = false,
}: {
  data: ExportBulkingShipmentDetail;
  onAdvance: () => void;
  readOnly?: boolean;
}) {
  const current = data.current_status;
  const currentIdx = EXPORT_BULKING_STATUSES.indexOf(current as never);
  const advanceTo = getNextExportBulkingStatus(current);
  const canAdvance = canAdvanceExportBulkingStatus(data);
  const missingLabels = getMissingRequirementLabels(data);
  const voyageCompletionLabels = getMissingVoyageCompletionLabels(data);

  return (
    <div className={styles.stepperWrap}>
      <div className={styles.stepper}>
        {EXPORT_BULKING_STATUSES.map((s, i) => {
          const isDone = i < currentIdx;
          const isActive = i === currentIdx;
          return (
            <div
              key={s}
              className={`${styles.stepItem} ${isDone ? styles.stepDone : ""} ${isActive ? styles.stepActive : ""}`}
            >
              {i > 0 && (
                <div className={`${styles.stepConnector} ${isDone ? styles.stepConnectorDone : ""}`} />
              )}
              <div className={styles.stepDot}>
                {isDone ? (
                  <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
                    <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
                  </svg>
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              <div className={styles.stepLabel}>{formatExportBulkingStatus(s)}</div>
            </div>
          );
        })}
      </div>
      {advanceTo && !readOnly && (
        <div className={styles.stepperActions}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={onAdvance}
            disabled={!canAdvance}
            title={
              !canAdvance && missingLabels.length
                ? `Complete required items: ${missingLabels.join(", ")}`
                : undefined
            }
          >
            Advance to {formatExportBulkingStatus(advanceTo)} →
          </button>
          {!canAdvance && missingLabels.length > 0 && (
            <p className={styles.stepperBlockers}>
              Before advancing: {missingLabels.join(" · ")}
            </p>
          )}
        </div>
      )}
      {!advanceTo && current === "CASE_OFF" && voyageCompletionLabels.length > 0 && (
        <p className={styles.stepperBlockers}>
          Before finishing: {voyageCompletionLabels.join(" · ")}
        </p>
      )}
    </div>
  );
}

// ─── unsaved changes banner ──────────────────────────────────────────────────

function UnsavedBanner({
  dirtySections,
  onSaveAll,
  saving,
}: {
  dirtySections: Record<string, boolean>;
  onSaveAll: () => void;
  saving: boolean;
}) {
  const dirtyKeys = Object.entries(dirtySections)
    .filter(([, v]) => v)
    .map(([k]) => k);
  if (dirtyKeys.length === 0) return null;

  const labels: Record<string, string> = {
    general: "General Info",
    nomination: "Nomination",
    cargo: "Cargo Lines",
    si: "Shipping Instructions",
    invoices: "Invoices",
    packing: "Packing Lists",
  };

  return (
    <div className={styles.unsavedBanner}>
      <span className={styles.unsavedMsg}>
        Unsaved changes in: {dirtyKeys.map((k) => labels[k] ?? k).join(", ")}
      </span>
      <button className={styles.btnPrimary} onClick={onSaveAll} disabled={saving} title="Ctrl+S">
        {saving ? "Saving…" : "Save all changes"}
      </button>
    </div>
  );
}

// ─── summary sidebar ─────────────────────────────────────────────────────────

function SummarySidebar({ data }: { data: ExportBulkingShipmentDetail }) {
  const cargoCounted = data.cargo_lines.reduce((sum, l) => sum + (l.quantity ?? 0), 0);

  return (
    <div className={styles.sidebarCard}>
      <div className={styles.sidebarCardTitle}>Summary</div>
      <div className={styles.summaryRows}>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Cargo Lines</span>
          <strong className={styles.summaryValue}>{data.cargo_lines.length}</strong>
        </div>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Total Quantity</span>
          <strong className={styles.summaryValue}>
            {data.total_quantity != null
              ? `${formatNumericDisplay(data.total_quantity)} MT`
              : cargoCounted > 0
                ? `${formatNumericDisplay(cargoCounted)} MT`
                : "—"}
          </strong>
        </div>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Shipping Instructions</span>
          <strong className={styles.summaryValue}>{data.shipping_instructions.length}</strong>
        </div>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Invoices</span>
          <strong className={styles.summaryValue}>{data.invoices.length}</strong>
        </div>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Packing Lists</span>
          <strong className={styles.summaryValue}>{data.packing_lists.length}</strong>
        </div>
        {(data.ata || data.eta) && (
          <div className={`${styles.summaryRow} ${styles.summaryHighlight}`}>
            <span className={styles.summaryLabel}>{data.ata ? "ATA" : "ETA"}</span>
            <strong className={styles.summaryValue}>{formatDate((data.ata ?? data.eta) as string)}</strong>
          </div>
        )}
        {(data.laycan_from || data.laycan_to || data.laycan) && (
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Laycan</span>
            <span className={styles.summaryValue}>
              {data.laycan_from && data.laycan_to
                ? `${formatDate(data.laycan_from)} — ${formatDate(data.laycan_to)}`
                : data.laycan ?? "—"}
            </span>
          </div>
        )}
        {data.est_cargo_readiness && (
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Est. Cargo Readiness</span>
            <span className={styles.summaryValue}>
              {formatDate(data.est_cargo_readiness)}
              {data.est_cargo_readiness_period ? ` ${data.est_cargo_readiness_period}` : ""}
            </span>
          </div>
        )}
        {data.surveyor && (
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Surveyor</span>
            <span className={styles.summaryValue}>{data.surveyor}</span>
          </div>
        )}
        {data.agent && (
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Agent</span>
            <span className={styles.summaryValue}>{data.agent}</span>
          </div>
        )}
        {data.incoterms && (
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Incoterms</span>
            <span className={styles.summaryValue}>{data.incoterms}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── status history sidebar ──────────────────────────────────────────────────

function StatusHistorySidebar({ events }: { events: StatusEvent[] }) {
  return (
    <div className={styles.sidebarCard}>
      <div className={styles.sidebarCardTitle}>Status History</div>
      {events.length === 0 ? (
        <p className={styles.historyEmpty}>No status events yet.</p>
      ) : (
        <div className={styles.historyList}>
          {events.map((ev, i) => (
            <div key={ev.id} className={styles.historyItem}>
              <div className={`${styles.historyDot} ${i === 0 ? styles.historyDotActive : ""}`} />
              <div className={styles.historyContent}>
                <div className={styles.historyStatus}>
                  {ev.old_status && (
                    <>
                      <span className={styles.historyStatusOld}>{formatExportBulkingStatus(ev.old_status)}</span>
                      <span className={styles.historyArrow}>→</span>
                    </>
                  )}
                  <span className={styles.historyStatusNew}>{formatExportBulkingStatus(ev.new_status)}</span>
                </div>
                <div className={styles.historyMeta}>
                  {ev.changed_by && <span>{ev.changed_by}</span>}
                  <span>·</span>
                  <span>{formatDatetime(ev.changed_at)}</span>
                </div>
                {ev.remarks && <div className={styles.historyRemarks}>{ev.remarks}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Demurrage Simulation sidebar ────────────────────────────────────────────

function formatSimDatetime(d: Date | null): string {
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function DemurrageSimulationSidebar({ data }: { data: ExportBulkingShipmentDetail }) {
  const [laytimeStart, setLaytimeStart] = useState<string>(() => toLocalDatetime(data.ata ?? data.eta));
  const [npeInput, setNpeInput] = useState<string>(() => toLocalDatetime(data.npe_date));

  // These three are always read from the shipment record — not editable in the simulation.
  const qty = data.total_quantity;
  const laytimeRate = data.laytime_rate_mtph;
  const demurrageRate = data.demurrage_rate_pdpr;

  const fmtAmount = (n: number) => formatMoneyDisplay(n);

  const fmtNum = (n: number | null, maxFractionDigits = 2) =>
    n != null ? formatNumericDisplay(n, maxFractionDigits) : "—";

  const result = useMemo(() => {
    const startDate = laytimeStart ? new Date(laytimeStart) : null;
    const npeDate = npeInput ? new Date(npeInput) : null;

    if (!startDate || Number.isNaN(startDate.getTime()) || qty == null || laytimeRate == null || laytimeRate === 0) {
      return { laytimeEndDate: null, timeOnDemurrageDays: null, demurrageAmount: null };
    }

    const durationHours = qty / laytimeRate;
    const laytimeEndDate = new Date(startDate.getTime() + durationHours * 60 * 60 * 1000);

    if (!npeDate || Number.isNaN(npeDate.getTime()) || demurrageRate == null) {
      return { laytimeEndDate, timeOnDemurrageDays: null, demurrageAmount: null };
    }

    const overHours = (npeDate.getTime() - laytimeEndDate.getTime()) / (1000 * 60 * 60);
    const timeOnDemurrageDays = Math.max(0, overHours / 24);
    const demurrageAmount = timeOnDemurrageDays * demurrageRate;

    return { laytimeEndDate, timeOnDemurrageDays, demurrageAmount };
  }, [laytimeStart, npeInput, qty, laytimeRate, demurrageRate]);

  return (
    <div className={styles.sidebarCard}>
      <div className={styles.sidebarCardTitle}>Demurrage Simulation</div>

      <div className={styles.simSection}>
        <div className={styles.simSectionLabel}>Inputs</div>
        <div className={styles.simFieldGroup}>
          <div className={styles.simField}>
            <label className={styles.simLabel}>Laytime Start</label>
            <input
              className={styles.simInput}
              type="datetime-local"
              value={laytimeStart}
              onChange={(e) => setLaytimeStart(e.target.value)}
            />
          </div>
          <div className={styles.simField}>
            <label className={styles.simLabel}>NPE Date</label>
            <input
              className={styles.simInput}
              type="datetime-local"
              value={npeInput}
              onChange={(e) => setNpeInput(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.simLookupGroup}>
          <div className={styles.simLookupRow}>
            <span className={styles.simLookupLabel}>Total Quantity</span>
            <span className={styles.simLookupValue}>{qty != null ? `${fmtNum(qty, 4)} MT` : "—"}</span>
          </div>
          <div className={styles.simLookupRow}>
            <span className={styles.simLookupLabel}>Laytime Rate</span>
            <span className={styles.simLookupValue}>{laytimeRate != null ? `${fmtNum(laytimeRate)} MT/PH` : "—"}</span>
          </div>
          <div className={styles.simLookupRow}>
            <span className={styles.simLookupLabel}>Demurrage Rate</span>
            <span className={styles.simLookupValue}>{demurrageRate != null ? `${fmtAmount(demurrageRate)} / day` : "—"}</span>
          </div>
        </div>
      </div>

      <div className={styles.simDivider} />

      <div className={styles.simSection}>
        <div className={styles.simSectionLabel}>Data Detail</div>
        <div className={styles.simRows}>
          <div className={styles.simRow}>
            <span className={styles.simRowLabel}>Demurrage Rate</span>
            <span className={styles.simRowValue}>
              {demurrageRate != null ? `${fmtAmount(demurrageRate)} / day` : "—"}
            </span>
          </div>
          <div className={styles.simRow}>
            <span className={styles.simRowLabel}>Laytime End Date</span>
            <span className={styles.simRowValue}>
              {result.laytimeEndDate ? formatSimDatetime(result.laytimeEndDate) : "—"}
            </span>
          </div>
          <div className={styles.simRow}>
            <span className={styles.simRowLabel}>Time on Demurrage</span>
            <span className={styles.simRowValue}>
              {result.timeOnDemurrageDays != null
                ? (() => {
                    const totalHours = result.timeOnDemurrageDays * 24;
                    const days = Math.floor(result.timeOnDemurrageDays);
                    const hrs = totalHours - days * 24;
                    return `${days}d : ${formatNumericDisplay(hrs, 2)}h`;
                  })()
                : "—"}
            </span>
          </div>
        </div>
        <div className={styles.simAmountBlock}>
          <span className={styles.simAmountLabel}>Total Demurrage</span>
          <span className={styles.simAmountValue}>
            {result.demurrageAmount != null
              ? `$${fmtAmount(result.demurrageAmount)}`
              : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── shared section props ────────────────────────────────────────────────────

interface SectionProps {
  data: ExportBulkingShipmentDetail;
  accessToken: string;
  open: boolean;
  onToggle: () => void;
  onSaved: () => void;
  toast: ReturnType<typeof useToast>;
  saveTrigger: number;
  onDirtyChange: (key: string, dirty: boolean) => void;
}

function useAggregatedSectionSave(
  sectionKey: string,
  saveTrigger: number,
  onDirtyChange: (key: string, dirty: boolean) => void,
) {
  const dirtyRef = useRef<Record<string, boolean>>({});
  const saveRef = useRef<Record<string, () => Promise<void>>>({});

  const setCardDirty = useCallback(
    (id: string, dirty: boolean) => {
      dirtyRef.current[id] = dirty;
      onDirtyChange(sectionKey, Object.values(dirtyRef.current).some(Boolean));
    },
    [sectionKey, onDirtyChange],
  );

  const registerSave = useCallback((id: string, fn: () => Promise<void>) => {
    saveRef.current[id] = fn;
  }, []);

  useEffect(() => {
    if (saveTrigger === 0) return;
    void Promise.all(
      Object.entries(saveRef.current)
        .filter(([id]) => dirtyRef.current[id])
        .map(([, fn]) => fn()),
    );
  }, [saveTrigger]);

  return { setCardDirty, registerSave };
}

/** When true, the section sits alone inside a stage card and skips its own collapse header. */
const StageCardFlatContext = createContext(false);

function isSingleStageSection(children: ReactNode): boolean {
  return Children.count(children) === 1;
}

function SectionShell({
  title,
  titleIcon,
  open,
  onToggle,
  actions,
  children,
  dirty,
  anchorId,
}: {
  title: string;
  titleIcon?: ReactNode;
  open: boolean;
  onToggle: () => void;
  actions?: ReactNode;
  children: ReactNode;
  dirty?: boolean;
  /** In-page anchor for jump navigation (UX prototype). */
  anchorId?: string;
}) {
  const flat = useContext(StageCardFlatContext);

  if (flat) {
    return (
      <section id={anchorId} className={`${styles.section} ${styles.sectionFlat} ${anchorId ? styles.sectionAnchor : ""}`}>
        {actions ? <div className={styles.sectionFlatActions}>{actions}</div> : null}
        <div className={styles.sectionBody}>{children}</div>
      </section>
    );
  }

  return (
    <section id={anchorId} className={`${styles.section} ${anchorId ? styles.sectionAnchor : ""}`}>
      <div className={styles.sectionHeader} onClick={onToggle}>
        <ChevronIcon open={open} />
        <h2 className={styles.sectionTitle}>
          {titleIcon ? <span className={styles.sectionTitleIcon} aria-hidden>{titleIcon}</span> : null}
          <span className={styles.sectionTitleLabel}>
            {title}
            {dirty && <span className={styles.dirtyDot} title="Unsaved changes" />}
          </span>
        </h2>
        {actions && <div onClick={(e) => e.stopPropagation()}>{actions}</div>}
      </div>
      <div className={`${styles.sectionBody} ${open ? "" : styles.sectionCollapsed}`}>
        {children}
      </div>
    </section>
  );
}

// ─── General Information ──────────────────────────────────────────────────

function GeneralSection({ data, accessToken, open, onToggle, onSaved, toast, saveTrigger, onDirtyChange }: SectionProps) {
  const getOrigForm = useCallback(() => ({
    vessel_name: data.vessel_name ?? "",
    voyage_number: data.voyage_number ?? "",
    shipper: data.shipper ?? "",
    loadport_name: data.loadport_name ?? "",
    total_quantity: formatQuantityFieldValue(resolveShipmentTotalQuantity(data)),
    remarks: data.remarks ?? "",
  }), [data]);

  const [form, setForm] = useState(getOrigForm);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);

  const [shipperList, setShipperList] = useState<Shipper[]>([]);
  const [selectedShipperId, setSelectedShipperId] = useState<string | null>(null);
  const [loadportOptions, setLoadportOptions] = useState<string[]>([]);
  const [pendingLoadportName, setPendingLoadportName] = useState<string | null>(null);

  const shipperNameOptions = shipperList.map((s) => s.name);

  useEffect(() => { setForm(getOrigForm()); }, [getOrigForm]);

  // Dirty tracking
  useEffect(() => {
    const dirty = JSON.stringify(form) !== JSON.stringify(getOrigForm());
    isDirtyRef.current = dirty;
    setIsDirty(dirty);
    onDirtyChange("general", dirty);
  }, [form, getOrigForm, onDirtyChange]);

  useEffect(() => {
    listShippers(accessToken).then((res) => {
      if (!isApiError(res)) {
        const list = (res as { data: Shipper[] }).data ?? [];
        setShipperList(list);
        const match = list.find((s) => s.name.toLowerCase() === (data.shipper ?? "").toLowerCase());
        if (match) setSelectedShipperId(match.id);
      }
    });
  }, [accessToken, data.shipper]);

  useEffect(() => {
    if (!selectedShipperId || !accessToken) { setLoadportOptions([]); return; }
    listShipperLoadports(selectedShipperId, accessToken).then((res) => {
      if (!isApiError(res)) setLoadportOptions((res as { data: ShipperLoadport[] }).data?.map((lp) => lp.name) ?? []);
    });
  }, [selectedShipperId, accessToken]);

  function handleShipperChange(name: string) {
    setForm((prev) => ({ ...prev, shipper: name, loadport_name: "" }));
    const match = shipperList.find((s) => s.name === name);
    setSelectedShipperId(match?.id ?? null);
    setLoadportOptions([]);
  }

  const handleCreateLoadport = useCallback((name: string): boolean => {
    if (!selectedShipperId || !accessToken) return false;
    const canonical = findMatchingOption(loadportOptions, name);
    if (canonical) {
      setForm((prev) => ({ ...prev, loadport_name: canonical }));
      return true;
    }
    setPendingLoadportName(name);
    return false;
  }, [selectedShipperId, accessToken, loadportOptions]);

  const confirmCreateLoadport = useCallback(async () => {
    if (!pendingLoadportName || !selectedShipperId || !accessToken) return;
    const res = await createShipperLoadport(selectedShipperId, { name: pendingLoadportName }, accessToken);
    const ok = !isApiError(res);
    if (ok) {
      const created = (res as { data?: ShipperLoadport }).data;
      const canonicalName = created?.name ?? findMatchingOption(loadportOptions, pendingLoadportName) ?? pendingLoadportName;
      const refreshRes = await listShipperLoadports(selectedShipperId, accessToken);
      if (!isApiError(refreshRes)) setLoadportOptions((refreshRes as { data: ShipperLoadport[] }).data?.map((lp) => lp.name) ?? []);
      setForm((prev) => ({ ...prev, loadport_name: canonicalName }));
    } else {
      toast.pushToast("Failed to create load port", "error");
    }
    setPendingLoadportName(null);
  }, [pendingLoadportName, selectedShipperId, accessToken, loadportOptions, toast]);

  const cancelCreateLoadport = useCallback(() => {
    setPendingLoadportName(null);
    setForm((prev) => ({ ...prev, loadport_name: "" })); // reset field — user cancelled
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const qty = parseQuantityInput(form.total_quantity);
    const previousTotal = data.total_quantity != null ? Number(data.total_quantity) : null;
    const res = await updateExportBulkingShipment(data.id, {
      vessel_name: form.vessel_name,
      voyage_number: form.voyage_number,
      shipper: form.shipper,
      loadport_name: form.loadport_name.trim()
        ? findMatchingOption(loadportOptions, form.loadport_name) ?? form.loadport_name.trim()
        : null,
      total_quantity: qty != null && qty > 0 ? qty : null,
      remarks: form.remarks,
    }, accessToken);
    if (isApiError(res)) {
      toast.pushToast(res.message, "error");
      setSaving(false);
      return;
    }

    if (qty != null && qty > 0) {
      const sync = await syncCargoLinesFromTotalQuantity(
        data.id,
        qty,
        data.cargo_lines,
        previousTotal,
        accessToken,
      );
      if (!sync.ok) {
        toast.pushToast(sync.message ?? "Failed to sync cargo quantity", "error");
        setSaving(false);
        return;
      }
    }

    toast.pushToast("General information saved", "success");
    onSaved();
    setSaving(false);
  }, [data.id, data.cargo_lines, data.total_quantity, form, loadportOptions, accessToken, toast, onSaved]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  useEffect(() => {
    if (saveTrigger === 0) return;
    if (isDirtyRef.current) handleSaveRef.current();
  }, [saveTrigger]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const setTotalQuantity = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9.,]/g, "");
    const normalized = raw.replace(/,/g, "");
    if (!normalized) {
      setForm((prev) => ({ ...prev, total_quantity: "" }));
      return;
    }
    const intPart = normalized.split(".")[0] ?? "";
    const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    setForm((prev) => ({ ...prev, total_quantity: formatted }));
  };

  return (
    <SectionShell
      title="General Information"
      titleIcon={<ClipboardList size={18} strokeWidth={2} />}
      anchorId="export-section-general"
      open={open} onToggle={onToggle} dirty={isDirty}>
      <Card>
        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Vessel Name</label>
            <input className={styles.fieldInput} value={form.vessel_name} onChange={set("vessel_name")} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Voyage Number</label>
            <input className={styles.fieldInput} value={form.voyage_number} onChange={set("voyage_number")} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Shipper</label>
            <ComboboxSelect
              options={shipperNameOptions}
              value={form.shipper}
              onChange={handleShipperChange}
              placeholder="Select shipper…"
              aria-label="Shipper"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Load Port</label>
            <ComboboxSelectCreatable
              options={loadportOptions}
              value={pendingLoadportName ?? form.loadport_name}
              onChange={(val) => {
                const canonical = findMatchingOption(loadportOptions, val) ?? val;
                setForm((prev) => ({ ...prev, loadport_name: canonical }));
              }}
              onCreateOption={handleCreateLoadport}
              placeholder={selectedShipperId ? "Select or type to create…" : "Select a shipper first…"}
              disabled={!selectedShipperId}
              externallyManaged={!!pendingLoadportName}
              aria-label="Load port"
            />
            {pendingLoadportName && (
              <div className={styles.loadportConfirm}>
                <span>Add <strong>&ldquo;{pendingLoadportName}&rdquo;</strong> to <strong>{form.shipper || "this shipper"}</strong>?</span>
                <div className={styles.loadportConfirmActions}>
                  <button type="button" className={styles.btnConfirmSm} onClick={confirmCreateLoadport}>Add port</button>
                  <button type="button" className={styles.btnCancelSm} onClick={cancelCreateLoadport}>Cancel</button>
                </div>
              </div>
            )}
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Total Quantity (MT)</label>
            <input
              className={styles.fieldInput}
              type="text"
              inputMode="decimal"
              value={form.total_quantity}
              onChange={setTotalQuantity}
              placeholder="e.g. 5,000"
              title={
                data.total_quantity == null && cargoQuantitySum(data.cargo_lines) > 0
                  ? "Prefilled from cargo line quantities — save to persist as shipment total"
                  : undefined
              }
            />
          </div>
          <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
            <label className={styles.fieldLabel}>Remarks</label>
            <textarea
              className={`${styles.fieldInput} ${styles.textareaInput}`}
              value={form.remarks}
              onChange={set("remarks")}
              rows={2}
              placeholder="Optional notes…"
            />
          </div>
        </div>
        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={handleSave} disabled={saving || !isDirty}>
            {saving ? "Saving…" : "Save General Info"}
          </button>
        </div>
      </Card>
    </SectionShell>
  );
}

// ─── Nomination ──────────────────────────────────────────────────────────

const NOMINATION_FIELD_LABELS: Record<string, string> = {
  received_nomination: "Received Nomination",
  received_shipping_instruction: "Received Shipping Instruction",
  laycan: "Laycan",
  est_cargo_readiness: "Est. Cargo Readiness",
  eta: "ETA (estimated time of arrival)",
  etb: "ETB (estimated time of berth)",
  etc: "ETC (estimated time of completion)",
  commence_loading: "Commence Loading",
  td: "Time of Departure",
  surveyor: "Surveyor",
  surveyor_reason: "Reason use Surveyor",
  agent: "Agent",
  laytime_rate_mtph: "Laytime Rate (MT/PH)",
  demurrage_rate_pdpr: "Demurrage Rate (PD/PR)",
};

const NOMINATION_DATETIME_FIELDS = ["eta"] as const;

type NominationDatetimeKey = (typeof NOMINATION_DATETIME_FIELDS)[number];

type NominationForm = {
  received_nomination: string;
  eta: string;
  laycan_from: string;
  laycan_to: string;
  est_cargo_readiness_date: string;
  est_cargo_readiness_period: string;
  incoterms: string;
  surveyor: string;
  surveyor_reason: string;
  agent: string;
  laytime_rate_mtph: string;
  demurrage_rate_pdpr: string;
};

function buildNominationForm(d: ExportBulkingShipmentDetail): NominationForm {
  const f: Record<string, string> = {};
  f.received_nomination = toLocalDate(d.received_nomination);
  for (const key of NOMINATION_DATETIME_FIELDS) {
    f[key] = toLocalDatetime(d[key as keyof ExportBulkingShipmentDetail] as string | null);
  }
  f.laycan_from = toLocalDate(d.laycan_from ?? d.laycan);
  f.laycan_to = toLocalDate(d.laycan_to);
  f.est_cargo_readiness_date = toLocalDate(d.est_cargo_readiness);
  f.est_cargo_readiness_period = d.est_cargo_readiness_period ?? "";
  f.incoterms = d.incoterms ?? "";
  f.surveyor = d.surveyor ?? "";
  f.surveyor_reason = d.surveyor_reason ?? "";
  f.agent = d.agent ?? "";
  f.laytime_rate_mtph = formatNumericFieldValue(d.laytime_rate_mtph);
  f.demurrage_rate_pdpr = formatMoneyFieldValue(d.demurrage_rate_pdpr);
  return f as NominationForm;
}

function EstCargoReadinessField({
  date,
  period,
  onChange,
}: {
  date: string;
  period: string;
  onChange: (date: string, period: string) => void;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{NOMINATION_FIELD_LABELS.est_cargo_readiness}</label>
      <div className={styles.dateRangeField}>
        <input
          type="date"
          className={styles.fieldInput}
          value={date}
          onChange={(e) => onChange(e.target.value, period)}
          aria-label="Est. cargo readiness date"
        />
        <select
          className={`${styles.fieldInput} ${styles.periodSelect}`}
          value={period}
          onChange={(e) => onChange(date, e.target.value)}
          aria-label="Est. cargo readiness AM or PM"
        >
          <option value="">—</option>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  );
}

function NominationSection({ data, accessToken, open, onToggle, onSaved, toast, saveTrigger, onDirtyChange }: SectionProps) {
  const [form, setForm] = useState<NominationForm>(() => buildNominationForm(data));
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);
  const [agentList, setAgentList] = useState<Agent[]>([]);
  const [pendingAgentName, setPendingAgentName] = useState<string | null>(null);

  const refreshAgents = useCallback(async () => {
    const res = await listAgents(accessToken);
    if (!isApiError(res)) setAgentList((res as { data: Agent[] }).data ?? []);
  }, [accessToken]);

  useEffect(() => {
    void refreshAgents();
  }, [refreshAgents]);

  const agentNameOptions = agentList.map((a) => a.name);

  const handleCreateAgent = useCallback((name: string): boolean => {
    const canonical = findMatchingOption(agentNameOptions, name);
    if (canonical) {
      setForm((prev) => ({ ...prev, agent: canonical }));
      return true;
    }
    setPendingAgentName(name);
    return false;
  }, [agentNameOptions]);

  const confirmCreateAgent = useCallback(async () => {
    if (!pendingAgentName || !accessToken) return;
    const res = await createAgent({ name: pendingAgentName }, accessToken);
    if (!isApiError(res)) {
      const created = (res as { data?: Agent }).data;
      const canonicalName = created?.name ?? findMatchingOption(agentNameOptions, pendingAgentName) ?? pendingAgentName;
      await refreshAgents();
      setForm((prev) => ({ ...prev, agent: canonicalName }));
      toast.pushToast("Agent added to master", "success");
    } else {
      toast.pushToast(res.message, "error");
    }
    setPendingAgentName(null);
  }, [pendingAgentName, accessToken, agentNameOptions, refreshAgents, toast]);

  const cancelCreateAgent = useCallback(() => {
    setPendingAgentName(null);
    setForm((prev) => ({ ...prev, agent: "" }));
  }, []);

  useEffect(() => {
    setForm(buildNominationForm(data));
  }, [data]);

  useEffect(() => {
    const dirty = JSON.stringify(form) !== JSON.stringify(buildNominationForm(data));
    isDirtyRef.current = dirty;
    setIsDirty(dirty);
    onDirtyChange("nomination", dirty);
  }, [form, data, onDirtyChange]);

  const set = (key: keyof NominationForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSave = useCallback(async () => {
    setSaving(true);
    const body: Record<string, unknown> = {};
    body.received_nomination = form.received_nomination
      ? new Date(`${form.received_nomination}T00:00:00`).toISOString()
      : null;
    for (const key of NOMINATION_DATETIME_FIELDS) {
      body[key] = form[key] ? new Date(form[key]).toISOString() : null;
    }
    body.laycan_from = form.laycan_from || null;
    body.laycan_to = form.laycan_to || null;
    body.laycan =
      form.laycan_from && form.laycan_to ? `${form.laycan_from} — ${form.laycan_to}` : null;
    body.est_cargo_readiness = form.est_cargo_readiness_date || null;
    body.est_cargo_readiness_period = form.est_cargo_readiness_period || null;
    body.incoterms = form.incoterms || null;
    body.surveyor = form.surveyor || null;
    body.surveyor_reason = form.surveyor.trim() ? (form.surveyor_reason.trim() || null) : null;
    body.agent = form.agent.trim()
      ? findMatchingOption(agentNameOptions, form.agent) ?? form.agent.trim()
      : null;
    body.laytime_rate_mtph = parseQuantityInput(form.laytime_rate_mtph);
    body.demurrage_rate_pdpr = parseQuantityInput(form.demurrage_rate_pdpr);
    const res = await updateExportBulkingShipment(data.id, body, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else { toast.pushToast("Nomination details saved", "success"); onSaved(); }
    setSaving(false);
  }, [data.id, form, agentNameOptions, accessToken, toast, onSaved]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  useEffect(() => {
    if (saveTrigger === 0) return;
    if (isDirtyRef.current) handleSaveRef.current();
  }, [saveTrigger]);

  return (
    <SectionShell
      title="Nomination"
      titleIcon={<CalendarClock size={18} strokeWidth={2} />}
      anchorId="export-section-nomination"
      open={open} onToggle={onToggle} dirty={isDirty}>
      <Card>
        <div className={styles.nominationGroup}>
          <div className={styles.nominationGroupLabel}>Document Dates</div>
          <div className={styles.fieldGrid}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>{NOMINATION_FIELD_LABELS.received_nomination}</label>
              <input
                className={styles.fieldInput}
                type="date"
                value={form.received_nomination}
                onChange={set("received_nomination")}
              />
            </div>
          </div>
        </div>

        <div className={styles.nominationGroup}>
          <div className={styles.nominationGroupLabel}>Vessel Schedule</div>
          <div className={styles.fieldGridDates}>
            <div className={styles.fieldSpan2}>
              <DateRangeField
                label={NOMINATION_FIELD_LABELS.laycan}
                from={form.laycan_from}
                to={form.laycan_to}
                onChange={(from, to) => setForm((prev) => ({ ...prev, laycan_from: from, laycan_to: to }))}
                placeholder="Select laycan date range…"
              />
            </div>
            <EstCargoReadinessField
              date={form.est_cargo_readiness_date}
              period={form.est_cargo_readiness_period}
              onChange={(date, period) =>
                setForm((prev) => ({
                  ...prev,
                  est_cargo_readiness_date: date,
                  est_cargo_readiness_period: period,
                }))
              }
            />
            <div className={styles.field}>
              <label className={styles.fieldLabel}>ETA (Estimated Time of Arrival)</label>
              <input
                className={styles.fieldInput}
                type="datetime-local"
                value={form.eta}
                onChange={set("eta")}
              />
            </div>
          </div>
        </div>

        <div className={styles.nominationGroup}>
          <div className={styles.nominationGroupLabel}>Commercial Terms</div>
          <div className={styles.fieldGrid}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Laytime Rate (MT/PH)</label>
              <input className={styles.fieldInput} type="text" inputMode="decimal" value={form.laytime_rate_mtph} onChange={set("laytime_rate_mtph")} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Demurrage Rate (PD/PR)</label>
              <input className={styles.fieldInput} type="text" inputMode="decimal" value={form.demurrage_rate_pdpr} onChange={set("demurrage_rate_pdpr")} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Incoterms</label>
              <select
                className={styles.fieldInput}
                value={form.incoterms}
                onChange={set("incoterms")}
                aria-label="Incoterms"
              >
                <option value="">— Select —</option>
                {INCOTERM_OPTIONS.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>{NOMINATION_FIELD_LABELS.agent}</label>
              <ComboboxSelectCreatable
                options={agentNameOptions}
                value={pendingAgentName ?? form.agent}
                onChange={(val) => {
                  const canonical = findMatchingOption(agentNameOptions, val) ?? val;
                  setForm((prev) => ({ ...prev, agent: canonical }));
                }}
                onCreateOption={handleCreateAgent}
                placeholder="Select or type to create…"
                externallyManaged={!!pendingAgentName}
                aria-label="Agent"
              />
              {pendingAgentName && (
                <div className={styles.loadportConfirm}>
                  <span>
                    Add <strong>&ldquo;{pendingAgentName}&rdquo;</strong> to Master Agent?
                  </span>
                  <div className={styles.loadportConfirmActions}>
                    <button type="button" className={styles.btnConfirmSm} onClick={confirmCreateAgent}>
                      Add agent
                    </button>
                    <button type="button" className={styles.btnCancelSm} onClick={cancelCreateAgent}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Surveyor</label>
              <input
                className={styles.fieldInput}
                value={form.surveyor}
                onChange={(e) => {
                  const value = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    surveyor: value,
                    surveyor_reason: value.trim() ? prev.surveyor_reason : "",
                  }));
                }}
              />
            </div>
            {form.surveyor.trim() ? (
              <div className={styles.field}>
                <label className={styles.fieldLabel}>{NOMINATION_FIELD_LABELS.surveyor_reason}</label>
                <input
                  className={styles.fieldInput}
                  value={form.surveyor_reason}
                  onChange={set("surveyor_reason")}
                  placeholder="Optional"
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={handleSave} disabled={saving || !isDirty}>
            {saving ? "Saving…" : "Save Nomination"}
          </button>
        </div>
      </Card>
    </SectionShell>
  );
}

// ─── Cargo Lines ──────────────────────────────────────────────────────────

const CARGO_UNIT_MT = "MT";

interface LocalCargoLine {
  _key: string;
  id: string;
  cargo_name: string;
  quantity: string;
  unit: string;
  item_description: string;
  destination_port: string;
  destination_country: string;
  country_area: string;
}

let cargoKeyCounter = 0;

function cargoToLocal(c: CargoLine): LocalCargoLine {
  const country = c.destination_country?.trim() ?? "";
  const derivedArea = country ? getCountryArea(country) : "";
  const area = derivedArea || (c.country_area ?? "");
  return {
    _key: c.id || `new-${++cargoKeyCounter}`,
    id: c.id,
    cargo_name: c.cargo_name ?? "",
    quantity: formatQuantityFieldValue(c.quantity),
    unit: CARGO_UNIT_MT,
    item_description: c.item_description ?? "",
    destination_port: c.destination_port ?? "",
    destination_country: country,
    country_area: area,
  };
}

function CargoSection({ data, accessToken, open, onToggle, onSaved, toast, saveTrigger, onDirtyChange }: SectionProps) {
  const [lines, setLines] = useState<LocalCargoLine[]>(() => data.cargo_lines.map(cargoToLocal));
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [confirmRemoveIdx, setConfirmRemoveIdx] = useState<number | null>(null);
  const isDirtyRef = useRef(false);

  useEffect(() => { setLines(data.cargo_lines.map(cargoToLocal)); }, [data]);

  useEffect(() => {
    const origValues = JSON.stringify(data.cargo_lines.map(cargoToLocal).map(({ _key, ...rest }) => rest));
    const currValues = JSON.stringify(lines.map(({ _key, ...rest }) => rest));
    const dirty = origValues !== currValues;
    isDirtyRef.current = dirty;
    setIsDirty(dirty);
    onDirtyChange("cargo", dirty);
  }, [lines, data, onDirtyChange]);

  const addRow = () => {
    const seedQty =
      data.total_quantity != null && data.total_quantity > 0
        ? formatQuantityFieldValue(data.total_quantity)
        : "";
    setLines((prev) => [
      ...prev,
      {
        _key: `new-${++cargoKeyCounter}`,
        id: "",
        cargo_name: prev.length === 0 ? "Cargo 1" : "",
        quantity: prev.length === 0 ? seedQty : "",
        unit: CARGO_UNIT_MT,
        item_description: "",
        destination_port: "",
        destination_country: "",
        country_area: "",
      },
    ]);
  };

  const removeRow = async (idx: number) => {
    const line = lines[idx];
    if (line.id) {
      const res = await deleteCargoLine(data.id, line.id, accessToken);
      if (isApiError(res)) { toast.pushToast(res.message, "error"); return; }
    }
    setLines((prev) => prev.filter((_, i) => i !== idx));
    setConfirmRemoveIdx(null);
  };

  const updateCell = (idx: number, key: keyof LocalCargoLine, value: string) =>
    setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, [key]: value } : row)));

  const updateDestinationCountry = (idx: number, value: string) => {
    setLines((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const area = value.trim() ? getCountryArea(value) : "";
        return { ...row, destination_country: value, country_area: area };
      }),
    );
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    const payload = lines.map((l, idx) => {
      const orig = data.cargo_lines.find((c) => c.id === l.id);
      return {
        ...(l.id ? { id: l.id } : {}),
        line_order: idx + 1,
        cargo_name: l.cargo_name,
        quantity: parseQuantityInput(l.quantity),
        unit: CARGO_UNIT_MT,
        item_description: l.item_description || null,
        destination_port: l.destination_port || null,
        destination_country: l.destination_country || null,
        country_area: l.destination_country?.trim() ? getCountryArea(l.destination_country) : (l.country_area || null),
        quantity_delivered: orig?.quantity_delivered ?? null,
        bl_figure: orig?.bl_figure ?? null,
        ship_figure: orig?.ship_figure ?? null,
      };
    });
    const res = await upsertCargoLines(data.id, payload, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else { toast.pushToast("Cargo lines saved", "success"); onSaved(); }
    setSaving(false);
  }, [data.id, lines, accessToken, toast, onSaved]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  useEffect(() => {
    if (saveTrigger === 0) return;
    if (isDirtyRef.current) handleSaveRef.current();
  }, [saveTrigger]);

  return (
    <SectionShell
      title="Cargo Lines"
      titleIcon={<Package size={18} strokeWidth={2} />}
      anchorId="export-section-cargo"
      open={open}
      onToggle={onToggle}
      dirty={isDirty}
    >
      <Card>
        {lines.length === 0 ? (
          <p className={styles.emptyMsg}>No cargo lines yet.</p>
        ) : (
          <div className={styles.cargoTableWrap}>
            <table className={styles.cargoSpreadsheet}>
              <colgroup>
                <col className={styles.cargoColNum} />
                <col className={styles.cargoColEven} />
                <col className={styles.cargoColQty} />
                <col className={styles.cargoColUnit} />
                <col className={styles.cargoColEven} />
                <col className={styles.cargoColEven} />
                <col className={styles.cargoColEven} />
                <col className={styles.cargoColEven} />
                <col className={styles.cargoColActions} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Cargo Name</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Unit</th>
                  <th scope="col">Description of goods</th>
                  <th scope="col">Dest Port</th>
                  <th scope="col">Dest Country</th>
                  <th scope="col" title="Derived from destination country (continent / region)">
                    Area
                  </th>
                  <th scope="col" className={styles.cargoThActions} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={line._key}>
                    <td className={styles.cargoTdNum}>{idx + 1}</td>
                    <td>
                      <input
                        className={styles.cargoCellInput}
                        value={line.cargo_name}
                        onChange={(e) => updateCell(idx, "cargo_name", e.target.value)}
                        aria-label={`Cargo name row ${idx + 1}`}
                      />
                    </td>
                    <td>
                      <input
                        className={styles.cargoCellInput}
                        type="text"
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={(e) => updateCell(idx, "quantity", e.target.value)}
                        aria-label={`Quantity row ${idx + 1}`}
                      />
                    </td>
                    <td>
                      <span className={styles.cargoCellReadonly}>{CARGO_UNIT_MT}</span>
                    </td>
                    <td>
                      <input
                        className={styles.cargoCellInput}
                        value={line.item_description}
                        onChange={(e) => updateCell(idx, "item_description", e.target.value)}
                        aria-label={`Description row ${idx + 1}`}
                      />
                    </td>
                    <td>
                      <input
                        className={styles.cargoCellInput}
                        value={line.destination_port}
                        onChange={(e) => updateCell(idx, "destination_port", e.target.value)}
                        aria-label={`Destination port row ${idx + 1}`}
                      />
                    </td>
                    <td>
                      <select
                        className={`${styles.cargoCellInput} ${styles.cargoCellSelect}`}
                        value={line.destination_country}
                        onChange={(e) => updateDestinationCountry(idx, e.target.value)}
                        aria-label={`Destination country row ${idx + 1}`}
                      >
                        {getCountryOptions(line.destination_country).map((name) => (
                          <option key={name || "__empty"} value={name}>
                            {name || "— Select —"}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className={styles.cargoCellReadonly} title={line.country_area.trim() || undefined}>
                        {line.country_area.trim() ? line.country_area : "—"}
                      </span>
                    </td>
                    <td className={styles.cargoTdActions}>
                      {confirmRemoveIdx === idx ? (
                        <div className={styles.cargoRowConfirmInline}>
                          <span className={styles.cargoRowConfirmMsg}>Remove row?</span>
                          <button
                            type="button"
                            className={styles.cargoDeleteConfirmBtn}
                            onClick={() => void removeRow(idx)}
                            aria-label={`Confirm remove row ${idx + 1}`}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            className={styles.btnSecondary}
                            onClick={() => setConfirmRemoveIdx(null)}
                            aria-label={`Cancel remove row ${idx + 1}`}
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={styles.cargoRowRemove}
                          onClick={() => setConfirmRemoveIdx(idx)}
                          title="Remove row"
                          aria-label={`Remove row ${idx + 1}`}
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className={styles.cargoTableFooter}>
          <button type="button" className={styles.cargoAddRowBtn} onClick={addRow}>
            + Add Row
          </button>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.btnPrimary} onClick={handleSave} disabled={saving || !isDirty}>
            {saving ? "Saving…" : "Save Cargo Lines"}
          </button>
        </div>
      </Card>
    </SectionShell>
  );
}

// ─── Shipping Instructions ────────────────────────────────────────────────

const SI_BILL_OF_LADING_OPTIONS = [
  "3 ORIGINAL & 3 NNBL AT LOADPORT",
  "3 NNBL AT LOADPORT",
] as const;

const SI_FREIGHT_OPTIONS = ["PAYABLE AS PER CHARTER PARTY", "PREPAID"] as const;

function cargoOptionLabel(c: CargoLine): string {
  const name = c.cargo_name?.trim() || `Cargo ${c.line_order}`;
  const desc = c.item_description?.trim();
  const lineTag = ` · #${c.line_order}`;
  return desc ? `${name} — ${desc}${lineTag}` : `${name}${lineTag}`;
}

function cargoIdFromLabel(cargoLines: CargoLine[], label: string): string {
  const match = cargoLines.find((c) => cargoOptionLabel(c) === label);
  return match?.id ?? "";
}

function cargoLabelFromId(cargoLines: CargoLine[], id: string): string {
  const match = cargoLines.find((c) => c.id === id);
  return match ? cargoOptionLabel(match) : "";
}

function nextUnusedCargoLine(cargoLines: CargoLine[], usedIds: Iterable<string>): CargoLine | undefined {
  const used = usedIds instanceof Set ? usedIds : new Set(usedIds);
  return cargoLines.find((c) => !used.has(c.id)) ?? cargoLines[0];
}

function cargoOptionLabelsForRow(
  cargoLines: CargoLine[],
  rows: ReadonlyArray<{ cargo_line_id?: string }>,
  rowIndex: number,
): string[] {
  const usedIds = new Set<string>();
  rows.forEach((r, i) => {
    if (i === rowIndex) return;
    const id = (r.cargo_line_id ?? "").trim();
    if (id) usedIds.add(id);
  });
  const currentId = (rows[rowIndex]?.cargo_line_id ?? "").trim();
  return cargoLines
    .filter((c) => !usedIds.has(c.id) || c.id === currentId)
    .map(cargoOptionLabel);
}

function cargoIdsUsedInOtherPackingLists(
  packingLists: PackingList[],
  excludePlId: string,
): Set<string> {
  const used = new Set<string>();
  for (const pl of packingLists) {
    if (pl.id === excludePlId) continue;
    for (const line of pl.lines) {
      const id = line.cargo_line_id?.trim();
      if (id) used.add(id);
    }
  }
  return used;
}

function cargoOptionLabelsForPackingList(
  cargoLines: CargoLine[],
  otherUsedCargoIds: Set<string>,
  currentCargoId: string,
): string[] {
  const current = currentCargoId.trim();
  return cargoLines
    .filter((c) => !otherUsedCargoIds.has(c.id) || c.id === current)
    .map(cargoOptionLabel);
}

type SiLineRow = {
  rowKey: string;
  cargo_line_id: string;
  description_of_goods: string;
  quantity: string;
  bl_split_qty: string;
  destination_port: string;
};

function buildSiPreviewFromDraft(
  si: ShippingInstruction,
  form: {
    messrs: string;
    bill_of_lading_option: string;
    consignee: string;
    notify_party: string;
    freight: string;
    npwp: string;
    bl_indicated: string;
  },
  lineRows: SiLineRow[],
  cargoById: Map<string, CargoLine>,
): ShippingInstruction {
  const lines = lineRows
    .filter((r) => r.cargo_line_id)
    .map((r, i) => {
      const c = cargoById.get(r.cargo_line_id);
      const qty =
        c?.quantity != null
          ? Number(c.quantity)
          : r.quantity.trim()
            ? Number(r.quantity.replace(/,/g, ""))
            : null;
      const blRaw = r.bl_split_qty.trim() ? Number(r.bl_split_qty.replace(/,/g, "")) : qty;
      return {
        id: `preview-${i}`,
        si_id: si.id,
        cargo_line_id: r.cargo_line_id,
        description_of_goods: c?.item_description?.trim() || r.description_of_goods.trim() || null,
        quantity: qty != null && !Number.isNaN(qty) ? qty : null,
        bl_split_qty: blRaw != null && !Number.isNaN(blRaw) ? blRaw : null,
        destination_port: c?.destination_port?.trim() || r.destination_port.trim() || null,
      };
    });
  return {
    ...si,
    messrs: form.messrs.trim() || null,
    bill_of_lading_option: form.bill_of_lading_option || null,
    consignee: form.consignee || null,
    notify_party: form.notify_party || null,
    freight: form.freight || null,
    npwp: form.npwp || null,
    bl_indicated: form.bl_indicated || null,
    lines: lines.length > 0 ? lines : si.lines,
  };
}

function buildSiLineRows(si: ShippingInstruction, cargoLines: CargoLine[]): SiLineRow[] {
  return si.lines.map((l, idx) => {
    const c = l.cargo_line_id ? cargoLines.find((x) => x.id === l.cargo_line_id) : undefined;
    return {
      rowKey: l.id || `row-${idx}-${si.id}`,
      cargo_line_id: l.cargo_line_id ?? "",
      description_of_goods: l.description_of_goods ?? c?.item_description ?? "",
      quantity:
        l.quantity != null ? formatQuantityFieldValue(l.quantity) : formatQuantityFieldValue(c?.quantity),
      bl_split_qty:
        l.bl_split_qty != null ? formatQuantityFieldValue(l.bl_split_qty) : formatQuantityFieldValue(c?.quantity),
      destination_port: l.destination_port ?? c?.destination_port ?? "",
    };
  });
}

function SISection({
  data,
  accessToken,
  open,
  onToggle,
  onSaved,
  toast,
  saveTrigger,
  onDirtyChange,
}: SectionProps) {
  const { setCardDirty, registerSave } = useAggregatedSectionSave("si", saveTrigger, onDirtyChange);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    const res = await createShippingInstruction(data.id, {}, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else { toast.pushToast("Shipping instruction created", "success"); onSaved(); }
    setCreating(false);
  };

  return (
    <SectionShell
      title="Shipping Instructions"
      titleIcon={<ScrollText size={18} strokeWidth={2} />}
      anchorId="export-section-si"
      open={open}
      onToggle={onToggle}
      actions={
        <button className={styles.btnSecondary} onClick={handleCreate} disabled={creating}>
          {creating ? "Creating…" : "+ Add SI"}
        </button>
      }
    >
      {data.shipping_instructions.length === 0 ? (
        <p className={styles.emptyMsg}>No shipping instructions.</p>
      ) : (
        data.shipping_instructions.map((si) => (
          <SICard
            key={si.id}
            si={si}
            shipmentId={data.id}
            shipment={data}
            accessToken={accessToken}
            onSaved={onSaved}
            toast={toast}
            saveTrigger={saveTrigger}
            onDirtyChange={(dirty) => setCardDirty(si.id, dirty)}
            registerSave={(fn) => registerSave(si.id, fn)}
          />
        ))
      )}
    </SectionShell>
  );
}

function SICard({
  si,
  shipmentId,
  shipment,
  accessToken,
  onSaved,
  toast,
  saveTrigger = 0,
  onDirtyChange,
  registerSave,
}: {
  si: ShippingInstruction;
  shipmentId: string;
  shipment: ExportBulkingShipmentDetail;
  accessToken: string;
  onSaved: () => void;
  toast: ReturnType<typeof useToast>;
  saveTrigger?: number;
  onDirtyChange?: (dirty: boolean) => void;
  registerSave?: (fn: () => Promise<void>) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);

  const cargoById = useMemo(
    () => new Map(shipment.cargo_lines.map((c) => [c.id, c])),
    [shipment.cargo_lines],
  );

  const [form, setForm] = useState({
    messrs: si.messrs ?? "",
    bill_of_lading_option: si.bill_of_lading_option ?? "",
    consignee: si.consignee ?? "",
    notify_party: si.notify_party ?? "",
    freight: si.freight ?? "",
    npwp: si.npwp ?? "",
    bl_indicated: si.bl_indicated ?? "",
  });

  const [lineRows, setLineRows] = useState<SiLineRow[]>(() => buildSiLineRows(si, shipment.cargo_lines));

  const siDirty = useMemo(() => {
    const origForm = {
      messrs: si.messrs ?? "",
      bill_of_lading_option: si.bill_of_lading_option ?? "",
      consignee: si.consignee ?? "",
      notify_party: si.notify_party ?? "",
      freight: si.freight ?? "",
      npwp: si.npwp ?? "",
      bl_indicated: si.bl_indicated ?? "",
    };
    if (JSON.stringify(form) !== JSON.stringify(origForm)) return true;
    const origRows = buildSiLineRows(si, shipment.cargo_lines);
    if (lineRows.length !== origRows.length) return true;
    return lineRows.some((row, i) => {
      const o = origRows[i];
      if (!o) return true;
      return (
        row.cargo_line_id !== o.cargo_line_id ||
        row.bl_split_qty !== o.bl_split_qty
      );
    });
  }, [form, lineRows, si, shipment.cargo_lines]);

  const siDirtyRef = useRef(false);
  siDirtyRef.current = siDirty;

  useEffect(() => {
    onDirtyChange?.(siDirty);
  }, [siDirty, onDirtyChange]);

  const handleSaveRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    setForm({
      messrs: si.messrs ?? "",
      bill_of_lading_option: si.bill_of_lading_option ?? "",
      consignee: si.consignee ?? "",
      notify_party: si.notify_party ?? "",
      freight: si.freight ?? "",
      npwp: si.npwp ?? "",
      bl_indicated: si.bl_indicated ?? "",
    });
    setLineRows(buildSiLineRows(si, shipment.cargo_lines));
  }, [si, shipment.cargo_lines]);

  const setFormField = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const linkedCargoSummary = useMemo(() => {
    const names = lineRows
      .map((r) => (r.cargo_line_id ? cargoById.get(r.cargo_line_id)?.cargo_name : null))
      .filter((n): n is string => !!n?.trim());
    const uniq = [...new Set(names)];
    if (!uniq.length) return "Not linked — choose cargo per row below";
    return uniq.join(", ");
  }, [lineRows, cargoById]);

  function applyCargoToRow(idx: number, cargoLineId: string) {
    const c = cargoLineId ? cargoById.get(cargoLineId) : undefined;
    setLineRows((prev) =>
      prev.map((row, i) =>
        i !== idx
          ? row
          : {
              ...row,
              cargo_line_id: cargoLineId,
              description_of_goods: c?.item_description ?? row.description_of_goods,
              quantity: formatQuantityFieldValue(c?.quantity),
              bl_split_qty: c?.quantity != null ? formatQuantityFieldValue(c.quantity) : row.bl_split_qty,
              destination_port: c?.destination_port ?? row.destination_port,
            },
      ),
    );
  }

  function updateLineRow(idx: number, patch: Partial<SiLineRow>) {
    setLineRows((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }

  function addSiLineRow() {
    const usedIds = new Set(lineRows.map((r) => r.cargo_line_id).filter(Boolean));
    const nextCargo = nextUnusedCargoLine(shipment.cargo_lines, usedIds);
    setLineRows((prev) => [
      ...prev,
      {
        rowKey: `new-${Date.now()}`,
        cargo_line_id: nextCargo?.id ?? "",
        description_of_goods: nextCargo?.item_description ?? "",
        quantity: formatQuantityFieldValue(nextCargo?.quantity),
        bl_split_qty: formatQuantityFieldValue(nextCargo?.quantity),
        destination_port: nextCargo?.destination_port ?? "",
      },
    ]);
  }

  function removeSiLineRow(idx: number) {
    setLineRows((prev) => prev.filter((_, i) => i !== idx));
  }

  const loadportDisplay = shipment.loadport_name?.trim() || "—";

  const previewSi = useMemo(
    () => buildSiPreviewFromDraft(si, form, lineRows, cargoById),
    [si, form, lineRows, cargoById],
  );

  const blSplitPreviewText = useMemo(() => {
    const row = lineRows.find((r) => r.cargo_line_id.trim()) ?? lineRows[0];
    return row?.bl_split_qty?.trim() ?? "";
  }, [lineRows]);

  const handleSave = async () => {
    setSaving(true);
    const linesPayload = lineRows
      .filter((r) => r.cargo_line_id)
      .map((r) => {
        const c = cargoById.get(r.cargo_line_id);
        return {
          cargo_line_id: r.cargo_line_id,
          description_of_goods: c?.item_description?.trim() || r.description_of_goods.trim() || null,
          quantity:
            c?.quantity != null
              ? Number(c.quantity)
              : r.quantity.trim()
                ? Number(r.quantity.replace(/,/g, ""))
                : null,
          bl_split_qty: r.bl_split_qty.trim() ? Number(r.bl_split_qty.replace(/,/g, "")) : null,
          destination_port: c?.destination_port?.trim() || r.destination_port.trim() || null,
        };
      });
    const res = await updateShippingInstruction(
      shipmentId,
      si.id,
      {
        si_number: si.si_number ?? null,
        messrs: form.messrs.trim() || null,
        bill_of_lading_option: form.bill_of_lading_option || null,
        consignee: form.consignee || null,
        notify_party: form.notify_party || null,
        freight: form.freight || null,
        shipper_snapshot: shipment.shipper?.trim() || null,
        npwp: form.npwp || null,
        bl_indicated: form.bl_indicated || null,
        lines: linesPayload,
      },
      accessToken,
    );
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else {
      toast.pushToast("Shipping instruction saved", "success");
      onSaved();
    }
    setSaving(false);
  };

  handleSaveRef.current = handleSave;

  useEffect(() => {
    registerSave?.(() => handleSaveRef.current());
  }, [registerSave, handleSave]);

  useEffect(() => {
    if (saveTrigger === 0) return;
    if (siDirtyRef.current) void handleSaveRef.current();
  }, [saveTrigger]);

  const handleDelete = async () => {
    setDeleting(true);
    const res = await deleteShippingInstruction(shipmentId, si.id, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else {
      toast.pushToast("Shipping instruction deleted", "success");
      onSaved();
    }
    setDeleting(false);
    setConfirmDelete(false);
  };

  return (
    <div className={styles.subItemCard}>
      <div className={styles.subItemHeader} onClick={() => setExpanded((p) => !p)}>
        <ChevronIcon open={expanded} />
        <div className={styles.subItemHeaderText}>
          <h3 className={styles.subItemTitle}>SI: {si.si_number || "(untitled)"}</h3>
          <p className={styles.siCargoLinkLine} title="Cargo lines linked to this SI">
            <span className={styles.siCargoLinkLabel}>Cargo (container) linkage:</span>{" "}
            <span className={styles.siCargoLinkEm}>{linkedCargoSummary}</span>
          </p>
        </div>
        <span className={styles.docStatusBadge}>{si.status}</span>
      </div>
      {expanded && (
        <div className={styles.subItemBody}>
          <Card>
            <div className={styles.fieldGrid}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>SI Number</label>
                <input
                  className={`${styles.fieldInput} ${styles.fieldInputReadonly}`}
                  readOnly
                  value={si.si_number ?? ""}
                  title="System-assigned; edit via support if a correction is required."
                />
              </div>
              <div className={`${styles.field} ${styles.fieldFullRow}`}>
                <label className={styles.fieldLabel}>Messrs (forwarding agency)</label>
                <textarea
                  className={`${styles.fieldInput} ${styles.textareaInput}`}
                  value={form.messrs}
                  onChange={setFormField("messrs")}
                  rows={3}
                  aria-label="Messrs forwarding agency"
                />
              </div>
              <div className={`${styles.field} ${styles.fieldFullRow}`}>
                <label className={styles.fieldLabel}>Bill of Lading</label>
                <select
                  className={styles.fieldInput}
                  aria-label="Bill of Lading"
                  value={form.bill_of_lading_option}
                  onChange={setFormField("bill_of_lading_option")}
                >
                  <option value="">— Select —</option>
                  {SI_BILL_OF_LADING_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                  {form.bill_of_lading_option &&
                    !SI_BILL_OF_LADING_OPTIONS.includes(form.bill_of_lading_option as (typeof SI_BILL_OF_LADING_OPTIONS)[number]) && (
                      <option value={form.bill_of_lading_option}>{form.bill_of_lading_option} (saved)</option>
                    )}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Consignee</label>
                <input className={styles.fieldInput} value={form.consignee} onChange={setFormField("consignee")} />
              </div>
              <div className={`${styles.field} ${styles.fieldFullRow}`}>
                <label className={styles.fieldLabel}>Notify Party</label>
                <textarea
                  className={`${styles.fieldInput} ${styles.textareaInput}`}
                  value={form.notify_party}
                  onChange={setFormField("notify_party")}
                  rows={3}
                  aria-label="Notify party"
                />
              </div>
              <div className={`${styles.field} ${styles.fieldFullRow}`}>
                <label className={styles.fieldLabel}>Freight</label>
                <select className={styles.fieldInput} aria-label="Freight" value={form.freight} onChange={setFormField("freight")}>
                  <option value="">— Select —</option>
                  {SI_FREIGHT_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                  {form.freight && !SI_FREIGHT_OPTIONS.includes(form.freight as (typeof SI_FREIGHT_OPTIONS)[number]) && (
                    <option value={form.freight}>{form.freight} (saved)</option>
                  )}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Shipper</label>
                <input
                  className={`${styles.fieldInput} ${styles.fieldInputReadonly}`}
                  readOnly
                  title="Synced from General Information when you save this SI."
                  value={shipment.shipper ?? ""}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>NPWP</label>
                <input className={styles.fieldInput} value={form.npwp} onChange={setFormField("npwp")} />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>B/L Indicated</label>
                <input className={styles.fieldInput} value={form.bl_indicated} onChange={setFormField("bl_indicated")} />
              </div>
            </div>

            <div className={styles.sectionGroupLabel}>Cargo Lines</div>
            {lineRows.length === 0 && (
              <p className={styles.emptyMsg}>No cargo lines linked. Use &ldquo;Add cargo line&rdquo; below.</p>
            )}

            {lineRows.map((row, idx) => {
              const linked = row.cargo_line_id ? cargoById.get(row.cargo_line_id) : undefined;
              const descDisplay = linked?.item_description?.trim() || row.description_of_goods || "";
              const qtyDisplay = (() => {
                if (linked?.quantity != null) return formatNumericDisplay(linked.quantity);
                const t = row.quantity.trim().replace(/,/g, "");
                if (!t) return "";
                const n = Number(t);
                return Number.isNaN(n) ? row.quantity : formatNumericDisplay(n);
              })();
              const destDisplay = linked?.destination_port?.trim() || row.destination_port || "";

              return (
                <div key={row.rowKey} className={styles.siCargoRow}>
                  {idx > 0 && <div className={styles.siCargoRowDivider} />}
                  <div className={styles.siCargoRowHeading}>Cargo line {idx + 1}</div>
                  <div className={styles.fieldGrid}>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel}>Cargo</label>
                      <ComboboxSelect
                        options={cargoOptionLabelsForRow(shipment.cargo_lines, lineRows, idx)}
                        value={cargoLabelFromId(shipment.cargo_lines, row.cargo_line_id)}
                        onChange={(label) => applyCargoToRow(idx, cargoIdFromLabel(shipment.cargo_lines, label))}
                        placeholder="Select cargo…"
                        allowEmpty
                        emptyLabel="— Select cargo —"
                        aria-label={`Cargo line ${idx + 1}`}
                        disabled={shipment.cargo_lines.length === 0}
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel}>Description of goods</label>
                      <input
                        className={`${styles.fieldInput} ${styles.fieldInputReadonly}`}
                        readOnly
                        tabIndex={-1}
                        value={descDisplay}
                        placeholder="—"
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel}>Quantity (MT)</label>
                      <input
                        className={`${styles.fieldInput} ${styles.fieldInputReadonly}`}
                        readOnly
                        tabIndex={-1}
                        value={qtyDisplay}
                        placeholder="—"
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel}>Loadport</label>
                      <input
                        className={`${styles.fieldInput} ${styles.fieldInputReadonly}`}
                        readOnly
                        tabIndex={-1}
                        value={loadportDisplay === "—" ? "" : loadportDisplay}
                        placeholder="—"
                        title="From load port in General Information"
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel}>Destination port</label>
                      <input
                        className={`${styles.fieldInput} ${styles.fieldInputReadonly}`}
                        readOnly
                        tabIndex={-1}
                        value={destDisplay}
                        placeholder="—"
                      />
                    </div>
                    <div className={`${styles.field} ${styles.fieldFullRow}`}>
                      <label className={styles.fieldLabel}>B/L split (MT)</label>
                      <textarea
                        className={`${styles.fieldInput} ${styles.textareaInput}`}
                        value={row.bl_split_qty}
                        onChange={(e) => updateLineRow(idx, { bl_split_qty: e.target.value })}
                        rows={2}
                        placeholder="e.g. 1 X 4,994.731 MTS"
                        title="Shown verbatim on the shipping instruction document"
                        aria-label={`B/L split line ${idx + 1}`}
                      />
                    </div>
                    <div className={styles.field}>
                      <button type="button" className={styles.btnSecondary} onClick={() => removeSiLineRow(idx)}>
                        Remove cargo line
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className={styles.siLineToolbar}>
              <button type="button" className={styles.btnSecondary} onClick={addSiLineRow} disabled={shipment.cargo_lines.length === 0}>
                + Add cargo line
              </button>
              {shipment.cargo_lines.length === 0 && (
                <span className={styles.fieldMuted}>Add cargo in Shipment Planning first.</span>
              )}
            </div>

            <div className={styles.siDocumentPreviewActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setShowDocumentPreview(true)}
              >
                Preview shipping instruction
              </button>
              <span className={styles.fieldMuted}>
                Printable document (first cargo line). Save before printing if others need the latest server copy.
              </span>
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save SI"}
              </button>
              {confirmDelete ? (
                <div className={styles.inlineConfirm}>
                  <span>Delete this shipping instruction?</span>
                  <button type="button" className={styles.btnDanger} onClick={handleDelete} disabled={deleting}>
                    {deleting ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button type="button" className={styles.btnSecondary} onClick={() => setConfirmDelete(false)}>Cancel</button>
                </div>
              ) : (
                <button type="button" className={styles.btnDanger} onClick={() => setConfirmDelete(true)}>Delete SI</button>
              )}
            </div>
          </Card>
        </div>
      )}

      <Modal
        open={showDocumentPreview}
        title={`Shipping instruction — ${si.si_number?.trim() || "Draft"}`}
        onClose={() => setShowDocumentPreview(false)}
        size="wide"
        footer={
          <button type="button" className={styles.btnSecondary} onClick={() => setShowDocumentPreview(false)}>
            Close
          </button>
        }
      >
        <ShippingInstructionDocument
          shipment={shipment}
          si={previewSi}
          blSplitText={blSplitPreviewText}
        />
      </Modal>
    </div>
  );
}

// ─── Invoices ─────────────────────────────────────────────────────────────

function vesselVoyageFromGeneral(s: ExportBulkingShipmentDetail): string {
  const vessel = s.vessel_name?.trim() ?? "";
  const voyage = s.voyage_number?.trim() ?? "";
  if (vessel && voyage) return `${vessel} / ${voyage}`;
  return vessel || voyage;
}

/** Distinct SO numbers already used on any invoice line for this shipment (for dropdown options). */
function distinctSoNosFromShipment(shipment: ExportBulkingShipmentDetail): string[] {
  const seen = new Set<string>();
  for (const inv of shipment.invoices) {
    for (const ln of inv.lines ?? []) {
      const t = ln.so_no?.trim();
      if (t) seen.add(t);
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

function parseOptionalNumberInput(raw: string): number | null {
  const t = raw.trim().replace(/,/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

function numbersCloseForInvoice(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) < 1e-6;
}

type InvoiceLineDraft = {
  rowKey: string;
  /** Set when the row is persisted on the server. */
  lineId?: string;
  /** Selected cargo row — drives description of goods and unit. */
  cargo_line_id: string;
  contract_no: string;
  so_no: string;
  quantity: string;
  unit_price: string;
};

/** Quantity for invoice lines: prefer Qty Delivered from Loading, else planned cargo qty. */
function cargoQtyFromLoading(cargo: CargoLine | undefined): number | null {
  if (!cargo) return null;
  if (cargo.quantity_delivered != null) return cargo.quantity_delivered;
  return cargo.quantity;
}

function formatInvoiceLineQuantity(cargo: CargoLine | undefined): string {
  return formatQuantityFieldValue(cargoQtyFromLoading(cargo));
}

function resolveInvoiceLineQuantity(d: InvoiceLineDraft, shipment: ExportBulkingShipmentDetail): number | null {
  const cid = (d.cargo_line_id ?? "").trim();
  if (cid) {
    const cargo = shipment.cargo_lines.find((c) => c.id === cid);
    const fromLoading = cargoQtyFromLoading(cargo);
    if (fromLoading != null) return fromLoading;
  }
  return parseOptionalNumberInput(d.quantity);
}

function newInvoiceLineDraft(
  shipment: ExportBulkingShipmentDetail,
  usedIds: Iterable<string> = [],
): InvoiceLineDraft {
  const next = nextUnusedCargoLine(shipment.cargo_lines, usedIds);
  return {
    rowKey: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    cargo_line_id: next?.id ?? "",
    contract_no: "",
    so_no: "",
    quantity: formatInvoiceLineQuantity(next),
    unit_price: "",
  };
}

/** Editable row state when the invoice has no saved lines yet — seed from SI lines + cargo qty. */
function buildDraftsFromSi(si: ShippingInstruction, shipment: ExportBulkingShipmentDetail): InvoiceLineDraft[] {
  return si.lines.map((sl) => {
    const cargo = sl.cargo_line_id ? shipment.cargo_lines.find((c) => c.id === sl.cargo_line_id) : undefined;
    const qty = cargo ? cargoQtyFromLoading(cargo) : sl.quantity;
    return {
      rowKey: `si-${sl.id}`,
      cargo_line_id: sl.cargo_line_id ?? "",
      contract_no: "",
      so_no: "",
      quantity: formatQuantityFieldValue(qty),
      unit_price: "",
    };
  });
}

function invoiceLineDraftsFromInvoiceOrSi(
  inv: Invoice,
  sis: ShippingInstruction[],
  ship: ExportBulkingShipmentDetail,
): InvoiceLineDraft[] {
  if (inv.lines.length > 0) {
    return inv.lines.map((l) => ({
      rowKey: l.id,
      lineId: l.id,
      cargo_line_id: l.cargo_line_id ?? "",
      contract_no: l.contract_no ?? "",
      so_no: l.so_no ?? "",
      quantity: formatQuantityFieldValue(l.quantity),
      unit_price: formatMoneyFieldValue(l.unit_price),
    }));
  }
  const siId = (inv.shipping_instruction_id ?? "").trim();
  const si = sis.find((s) => s.id === siId);
  if (si?.lines?.length) return buildDraftsFromSi(si, ship);
  return [];
}

function invoiceDraftsToDisplayLines(
  drafts: InvoiceLineDraft[],
  invoiceId: string,
  shipment: ExportBulkingShipmentDetail,
  savedLines: InvoiceLine[],
): InvoiceLine[] {
  const savedById = new Map(savedLines.map((l) => [l.id, l]));
  return drafts.map((d, idx) => {
    const saved = d.lineId ? savedById.get(d.lineId) : savedLines[idx];
    const cargo = d.cargo_line_id
      ? shipment.cargo_lines.find((c) => c.id === d.cargo_line_id)
      : undefined;
    return {
      id: d.lineId ?? d.rowKey,
      invoice_id: invoiceId,
      cargo_line_id: d.cargo_line_id.trim() || saved?.cargo_line_id || null,
      item_no: idx + 1,
      description_of_goods:
        cargo?.item_description?.trim() ?? saved?.description_of_goods?.trim() ?? null,
      contract_no: d.contract_no.trim() || saved?.contract_no || null,
      so_no: d.so_no.trim() || saved?.so_no || null,
      quantity:
        resolveInvoiceLineQuantity(
          { ...d, cargo_line_id: d.cargo_line_id.trim() || (saved?.cargo_line_id ?? "") },
          shipment,
        ) ?? saved?.quantity ?? null,
      unit_price:
        parseOptionalNumberInput(d.unit_price) ?? saved?.unit_price ?? null,
      total_amount: saved?.total_amount ?? null,
    };
  });
}

function buildInvoicePreviewFromDraft(
  invoice: Invoice,
  form: {
    shipping_instruction_id: string;
    invoice_date: string;
    messrs: string;
    marks: string;
  },
  lineDrafts: InvoiceLineDraft[],
  shipment: ExportBulkingShipmentDetail,
): Invoice {
  const displayLines = invoiceDraftsToDisplayLines(lineDrafts, invoice.id, shipment, invoice.lines);
  const lines = displayLines.map((line, idx) => {
    const d = lineDrafts[idx];
    const q = resolveInvoiceLineQuantity(d, shipment) ?? line.quantity;
    const up = parseOptionalNumberInput(d?.unit_price ?? "") ?? line.unit_price;
    let total: number | null = null;
    if (q != null && up != null && !Number.isNaN(q) && !Number.isNaN(up)) {
      total = q * up;
    } else if (line.total_amount != null && !Number.isNaN(Number(line.total_amount))) {
      total = Number(line.total_amount);
    }
    return {
      ...line,
      item_no: idx + 1,
      contract_no: d?.contract_no?.trim() || line.contract_no,
      so_no: d?.so_no?.trim() || line.so_no,
      quantity: q,
      unit_price: up,
      total_amount: total,
    };
  });

  return {
    ...invoice,
    messrs: form.messrs.trim() || null,
    marks: form.marks.trim() || null,
    invoice_date: form.invoice_date || null,
    vessel_voyage_snapshot: vesselVoyageFromGeneral(shipment).trim() || null,
    loadport_snapshot: shipment.loadport_name?.trim() || null,
    destination_snapshot: destinationSummaryFromCargo(shipment.cargo_lines).trim() || null,
    lines,
  };
}

function buildInvoiceLinesPayload(
  drafts: InvoiceLineDraft[],
  shipment: ExportBulkingShipmentDetail,
): Record<string, unknown>[] {
  return drafts.map((d, idx) => {
    const q = resolveInvoiceLineQuantity(d, shipment);
    const up = parseOptionalNumberInput(d.unit_price);
    let total: number | null = null;
    if (q != null && up != null && !Number.isNaN(q) && !Number.isNaN(up)) {
      total = q * up;
    }
    const cid = (d.cargo_line_id ?? "").trim() || null;
    const cargo = cid ? shipment.cargo_lines.find((c) => c.id === cid) : undefined;
    const fromCargo = cargo?.item_description?.trim();
    return {
      cargo_line_id: cid,
      item_no: idx + 1,
      description_of_goods: fromCargo && fromCargo.length > 0 ? fromCargo : null,
      contract_no: d.contract_no.trim() ? d.contract_no.trim() : null,
      so_no: d.so_no.trim() ? d.so_no.trim() : null,
      quantity: q,
      unit_price: up,
      total_amount: total,
    };
  });
}

/** Unit of measure from linked cargo (invoice lines do not store unit). */
function invoiceLineUnitDisplay(line: InvoiceLine, shipment: ExportBulkingShipmentDetail): string {
  if (line.cargo_line_id) {
    const cargo = shipment.cargo_lines.find((c) => c.id === line.cargo_line_id);
    const u = cargo?.unit?.trim();
    if (u) return u;
  }
  return "—";
}

/** Packing list line edit state — description & qty / ports come from cargo + shipment (read-only); packing is editable. */
type PackingListLineDraft = {
  rowKey?: string;
  cargo_line_id: string;
  packing: string;
};

function packingListLineDraftsFromPl(pl: PackingList): PackingListLineDraft[] {
  const line = pl.lines[0];
  if (!line) {
    return [{ rowKey: `new-${pl.id}`, cargo_line_id: "", packing: "" }];
  }
  return [{
    rowKey: line.id,
    cargo_line_id: line.cargo_line_id ?? "",
    packing: line.packing ?? "",
  }];
}

/** Persisted packing list line bodies — aligned with `lineDrafts` rows. */
function buildPackingListLinesPayload(
  drafts: PackingListLineDraft[],
  dbLines: PackingListLine[],
  cargoLines: CargoLine[],
): Record<string, unknown>[] {
  return drafts.map((d, idx) => {
    const row = dbLines[idx];
    const cid = (d?.cargo_line_id ?? "").trim() || null;
    const cargo = cid ? cargoLines.find((c) => c.id === cid) : undefined;
    return {
      cargo_line_id: cid,
      description_of_goods:
        cargo?.item_description?.trim() ?? row?.description_of_goods?.trim() ?? null,
      quantity: cargo?.quantity ?? row?.quantity ?? null,
      destination_snapshot:
        cargoDestinationSnapshot(cargo) ?? (row?.destination_snapshot?.trim() || null),
      packing: (d?.packing ?? "").trim() || null,
    };
  });
}

/** Single cargo row destination (port + country) for read-only packing list cells. */
function cargoLineDestinationDisplay(c: CargoLine | undefined): string {
  if (!c) return "—";
  const p = c.destination_port?.trim();
  const co = c.destination_country?.trim();
  if (p && co) return `${p} (${co})`;
  return p || co || "—";
}

/** Destination text persisted on a packing list line (same as display, without em dash). */
function cargoDestinationSnapshot(c: CargoLine | undefined): string | null {
  if (!c) return null;
  const p = c.destination_port?.trim();
  const co = c.destination_country?.trim();
  if (p && co) return `${p} (${co})`;
  const t = p || co;
  return t || null;
}

function cargoQtyLabel(c: CargoLine | undefined): string {
  if (!c || c.quantity == null) return "—";
  const u = c.unit?.trim();
  const q = formatNumericDisplay(Number(c.quantity));
  return u ? `${q} ${u}` : q;
}

/** Resolved cargo for a packing list row (draft overrides stored link). */
function packingLineResolvedCargo(
  cargoLines: CargoLine[],
  draft: PackingListLineDraft | undefined,
  dbCargoId: string | null | undefined,
): CargoLine | undefined {
  const prefer = (draft?.cargo_line_id ?? "").trim() || (dbCargoId ?? "").trim();
  return prefer ? cargoLines.find((c) => c.id === prefer) : undefined;
}

function packingLineDescriptionDisplay(
  cargo: CargoLine | undefined,
  line: PackingListLine | undefined,
): string {
  if (cargo) {
    return cargo.item_description?.trim() || cargo.cargo_name || "—";
  }
  return line?.description_of_goods?.trim() || "—";
}

function packingLineQtyDisplay(cargo: CargoLine | undefined, line: PackingListLine | undefined): string {
  if (cargo && cargo.quantity != null) return cargoQtyLabel(cargo);
  if (line?.quantity != null) return formatNumericDisplay(Number(line.quantity));
  return "—";
}

function packingLineDestinationDisplay(
  cargo: CargoLine | undefined,
  line: PackingListLine | undefined,
): string {
  if (cargo) return cargoLineDestinationDisplay(cargo);
  return line?.destination_snapshot?.trim() || "—";
}

function destinationSummaryFromCargo(cargoLines: CargoLine[]): string {
  const parts = cargoLines.map((l) => {
    const p = l.destination_port?.trim();
    const c = l.destination_country?.trim();
    if (p && c) return `${p} (${c})`;
    return p || c || "";
  }).filter(Boolean);
  return [...new Set(parts)].join("; ");
}

function upperDocText(s: string | null | undefined): string {
  const t = s?.trim();
  return t ? t.toUpperCase() : "—";
}

function formatPackingListDocDate(d: Date = new Date()): string {
  return d
    .toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    .toUpperCase();
}

function formatPackingDisplay(raw: string): string {
  const t = raw.trim();
  if (!t) return "In Bulk";
  if (/^in\s+/i.test(t)) {
    const rest = t.replace(/^in\s+/i, "").trim();
    return rest ? `In ${rest.charAt(0).toUpperCase()}${rest.slice(1)}` : "In Bulk";
  }
  return `In ${t.charAt(0).toUpperCase()}${t.slice(1)}`;
}

function buildPackingListPreviewFromDraft(
  packingList: PackingList,
  lineDrafts: PackingListLineDraft[],
  shipment: ExportBulkingShipmentDetail,
  cargoLines: CargoLine[],
): PackingListDocumentPreview {
  const draft = lineDrafts[0];
  const saved = packingList.lines[0];
  const cargo = packingLineResolvedCargo(cargoLines, draft, saved?.cargo_line_id);

  const commodity = upperDocText(packingLineDescriptionDisplay(cargo, saved));
  const quantity = upperDocText(
    packingLineQtyDisplay(cargo, saved).replace(/—/g, "") || "—",
  );

  const packingRaw = (draft?.packing ?? saved?.packing ?? "").trim();
  const packing = formatPackingDisplay(packingRaw);

  let destination = "—";
  if (cargo) {
    const p = cargo.destination_port?.trim();
    const c = cargo.destination_country?.trim();
    if (p && c) destination = upperDocText(`${p}, ${c}`);
    else destination = upperDocText(p || c || null);
  } else {
    const snap = (packingList.destination_snapshot ?? saved?.destination_snapshot ?? "").trim();
    const paren = snap.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    destination = paren ? upperDocText(`${paren[1]}, ${paren[2]}`) : upperDocText(snap || null);
  }

  return {
    packing_list_number: packingList.packing_list_number,
    vessel: upperDocText(vesselVoyageFromGeneral(shipment) || null),
    commodity,
    quantity: quantity === "" ? "—" : quantity,
    port_of_loading: upperDocText(packingList.loadport_snapshot ?? shipment.loadport_name),
    destination,
    packing,
    issued_date: formatPackingListDocDate(),
  };
}

// ─── Detail overview & jump navigation (UX prototype) ───────────────────────

const EXPORT_SECTION_ANCHORS: Record<
  "general" | "nomination" | "cargo" | "si" | "invoices" | "packing",
  string
> = {
  general: "export-section-general",
  nomination: "export-section-nomination",
  cargo: "export-section-cargo",
  si: "export-section-si",
  invoices: "export-section-invoices",
  packing: "export-section-packing",
};

type ExportDetailSectionKey = keyof typeof EXPORT_SECTION_ANCHORS;

const EXPORT_DETAIL_NAV_OPS: { key: ExportDetailSectionKey; short: string; full: string }[] = [
  { key: "general", short: "General", full: "General Information" },
  { key: "nomination", short: "Nomination", full: "Nomination" },
  { key: "cargo", short: "Cargo", full: "Cargo Lines" },
];

const EXPORT_DETAIL_NAV_DOCS: { key: ExportDetailSectionKey; short: string; full: string }[] = [
  { key: "si", short: "SI", full: "Shipping Instructions" },
  { key: "invoices", short: "Invoices", full: "Invoices" },
  { key: "packing", short: "Packing", full: "Packing Lists" },
];

type OpenSectionsState = {
  general: boolean;
  nomination: boolean;
  cargo: boolean;
  si: boolean;
  invoices: boolean;
  packing: boolean;
};

const OPS_OPEN_SECTIONS: OpenSectionsState = {
  general: true,
  nomination: true,
  cargo: true,
  si: false,
  invoices: false,
  packing: false,
};

const DOCS_OPEN_SECTIONS: OpenSectionsState = {
  general: false,
  nomination: false,
  cargo: false,
  si: true,
  invoices: true,
  packing: true,
};

function ShipmentOverviewStrip({ data }: { data: ExportBulkingShipmentDetail }) {
  const vesselVoyage = vesselVoyageFromGeneral(data).trim() || "—";
  const loadPort = data.loadport_name?.trim() || "—";
  const shipper = data.shipper?.trim() || "—";
  const cargoCounted = data.cargo_lines.reduce((sum, l) => sum + (l.quantity ?? 0), 0);
  const totalQty =
    data.total_quantity != null
      ? data.total_quantity
      : cargoCounted > 0
        ? cargoCounted
        : null;
  const qtyLabel = totalQty != null ? `${formatNumericDisplay(totalQty)} MT` : "—";

  const arrival = data.ata
    ? { label: "Arrival (actual)", value: formatDate(data.ata) }
    : data.eta
      ? { label: "Arrival (est.)", value: formatDate(data.eta) }
      : null;

  const dest = destinationSummaryFromCargo(data.cargo_lines).trim();
  const destShort = dest.length > 52 ? `${dest.slice(0, 49)}…` : dest;

  return (
    <div className={styles.overviewStrip} aria-label="Shipment summary">
      <div className={styles.overviewStripMain}>
        <div className={styles.overviewFact}>
          <span className={styles.overviewFactLabel}>Vessel / voyage</span>
          <span className={styles.overviewFactValue}>{vesselVoyage}</span>
        </div>
        <div className={styles.overviewFact}>
          <span className={styles.overviewFactLabel}>Load port</span>
          <span className={styles.overviewFactValue}>{loadPort}</span>
        </div>
        <div className={styles.overviewFact}>
          <span className={styles.overviewFactLabel}>Shipper</span>
          <span className={styles.overviewFactValue}>{shipper}</span>
        </div>
        {arrival ? (
          <div className={styles.overviewFact}>
            <span className={styles.overviewFactLabel}>{arrival.label}</span>
            <span className={styles.overviewFactValue}>{arrival.value}</span>
          </div>
        ) : null}
        <div className={styles.overviewFact}>
          <span className={styles.overviewFactLabel}>Total qty</span>
          <span className={styles.overviewFactValue}>{qtyLabel}</span>
        </div>
        {dest ? (
          <div className={`${styles.overviewFact} ${styles.overviewFactWide}`}>
            <span className={styles.overviewFactLabel}>Destination</span>
            <span className={styles.overviewFactValue} title={dest}>
              {destShort}
            </span>
          </div>
        ) : null}
      </div>
      <div className={styles.overviewStripMeta} aria-label="Document counts">
        <span className={styles.overviewChip}>
          Cargo lines <strong>{data.cargo_lines.length}</strong>
        </span>
        <span className={styles.overviewChip}>
          SI <strong>{data.shipping_instructions.length}</strong>
        </span>
        <span className={styles.overviewChip}>
          Inv. <strong>{data.invoices.length}</strong>
        </span>
        <span className={styles.overviewChip}>
          P/L <strong>{data.packing_lists.length}</strong>
        </span>
      </div>
    </div>
  );
}

function SectionJumpNav({
  onJump,
  allSectionsExpanded,
  onToggleExpandCollapse,
  onFocusOperations,
  onFocusDocuments,
}: {
  onJump: (key: ExportDetailSectionKey) => void;
  allSectionsExpanded: boolean;
  onToggleExpandCollapse: () => void;
  onFocusOperations: () => void;
  onFocusDocuments: () => void;
}) {
  return (
    <div className={styles.jumpNavWrap}>
      <nav className={styles.jumpNav} aria-label="Jump to section">
        {EXPORT_DETAIL_NAV_OPS.map(({ key, short, full }) => (
          <button key={key} type="button" className={styles.jumpNavBtn} title={full} onClick={() => onJump(key)}>
            {short}
          </button>
        ))}
        <span className={styles.jumpNavDivider} aria-hidden />
        {EXPORT_DETAIL_NAV_DOCS.map(({ key, short, full }) => (
          <button key={key} type="button" className={styles.jumpNavBtn} title={full} onClick={() => onJump(key)}>
            {short}
          </button>
        ))}
      </nav>
      <div className={styles.jumpNavTools}>
        <button
          type="button"
          className={styles.jumpNavLinkBtn}
          onClick={onToggleExpandCollapse}
          aria-pressed={allSectionsExpanded}
          aria-label={allSectionsExpanded ? "Collapse all sections" : "Expand all sections"}
        >
          {allSectionsExpanded ? "Collapse all" : "Expand all"}
        </button>
        <button type="button" className={styles.jumpNavLinkBtn} onClick={onFocusOperations}>
          Focus operations
        </button>
        <button type="button" className={styles.jumpNavLinkBtn} onClick={onFocusDocuments}>
          Focus documents
        </button>
      </div>
    </div>
  );
}

function InvoiceSection({
  data,
  accessToken,
  open,
  onToggle,
  onSaved,
  toast,
  saveTrigger,
  onDirtyChange,
}: SectionProps) {
  const { setCardDirty, registerSave } = useAggregatedSectionSave("invoices", saveTrigger, onDirtyChange);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    const res = await createInvoice(data.id, {}, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else { toast.pushToast("Invoice created", "success"); onSaved(); }
    setCreating(false);
  };

  return (
    <SectionShell
      title="Invoices"
      titleIcon={<Receipt size={18} strokeWidth={2} />}
      anchorId="export-section-invoices"
      open={open}
      onToggle={onToggle}
      actions={
        <button className={styles.btnSecondary} onClick={handleCreate} disabled={creating}>
          {creating ? "Creating…" : "+ Add Invoice"}
        </button>
      }
    >
      {data.invoices.length === 0 ? (
        <p className={styles.emptyMsg}>No invoices.</p>
      ) : (
        data.invoices.map((inv) => (
          <InvoiceCard
            key={inv.id}
            invoice={inv}
            shipmentId={data.id}
            shipment={data}
            shippingInstructions={data.shipping_instructions}
            accessToken={accessToken}
            onSaved={onSaved}
            toast={toast}
            saveTrigger={saveTrigger}
            onDirtyChange={(dirty) => setCardDirty(inv.id, dirty)}
            registerSave={(fn) => registerSave(inv.id, fn)}
          />
        ))
      )}
    </SectionShell>
  );
}

function InvoiceCard({
  invoice,
  shipmentId,
  shipment,
  shippingInstructions,
  accessToken,
  onSaved,
  toast,
  saveTrigger = 0,
  onDirtyChange,
  registerSave,
}: {
  invoice: Invoice;
  shipmentId: string;
  shipment: ExportBulkingShipmentDetail;
  shippingInstructions: ShippingInstruction[];
  accessToken: string;
  onSaved: () => void;
  toast: ReturnType<typeof useToast>;
  saveTrigger?: number;
  onDirtyChange?: (dirty: boolean) => void;
  registerSave?: (fn: () => Promise<void>) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);

  const [form, setForm] = useState({
    shipping_instruction_id: invoice.shipping_instruction_id ?? "",
    invoice_date: toLocalDate(invoice.invoice_date),
    messrs: invoice.messrs ?? "",
    marks: invoice.marks ?? "",
  });

  const [lineDrafts, setLineDrafts] = useState<InvoiceLineDraft[]>(() =>
    invoiceLineDraftsFromInvoiceOrSi(invoice, shippingInstructions, shipment),
  );

  const vesselVoyageDisplay = useMemo(() => vesselVoyageFromGeneral(shipment) || "—", [shipment]);
  const loadPortDisplay = useMemo(() => shipment.loadport_name?.trim() || "—", [shipment.loadport_name]);
  const destinationDisplay = useMemo(() => destinationSummaryFromCargo(shipment.cargo_lines) || "—", [shipment.cargo_lines]);

  const soDropdownOptions = useMemo(() => distinctSoNosFromShipment(shipment), [shipment]);

  const siSelected = Boolean(form.shipping_instruction_id.trim());
  const selectedShippingInstruction = useMemo((): ShippingInstruction | null => {
    const id = form.shipping_instruction_id.trim();
    if (!id) return null;
    return shippingInstructions.find((s) => s.id === id) ?? null;
  }, [shippingInstructions, form.shipping_instruction_id]);

  const displayLines = useMemo(
    () => invoiceDraftsToDisplayLines(lineDrafts, invoice.id, shipment, invoice.lines),
    [lineDrafts, invoice.id, shipment, invoice.lines],
  );

  useEffect(() => {
    setForm({
      shipping_instruction_id: invoice.shipping_instruction_id ?? "",
      invoice_date: toLocalDate(invoice.invoice_date),
      messrs: invoice.messrs ?? "",
      marks: invoice.marks ?? "",
    });
    setLineDrafts(invoiceLineDraftsFromInvoiceOrSi(invoice, shippingInstructions, shipment));
  }, [invoice, shippingInstructions, shipment]);

  useEffect(() => {
    if (invoice.lines.length > 0) return;
    const si = shippingInstructions.find((s) => s.id === form.shipping_instruction_id.trim());
    if (si?.lines?.length) {
      setLineDrafts(buildDraftsFromSi(si, shipment));
    } else {
      setLineDrafts([]);
    }
  }, [form.shipping_instruction_id, invoice.lines.length, shippingInstructions, shipment]);

  const baselineDraftsFromSi = useMemo(() => {
    if (invoice.lines.length > 0 || !selectedShippingInstruction?.lines.length) return null;
    return buildDraftsFromSi(selectedShippingInstruction, shipment);
  }, [invoice.lines.length, selectedShippingInstruction, shipment]);

  const headerDirty = useMemo(() => {
    const si = invoice.shipping_instruction_id ?? "";
    return (
      form.shipping_instruction_id !== si ||
      toLocalDate(invoice.invoice_date) !== form.invoice_date ||
      form.messrs !== (invoice.messrs ?? "") ||
      form.marks !== (invoice.marks ?? "")
    );
  }, [form, invoice]);

  const linesDirty = useMemo(() => {
    if (invoice.lines.length > 0) {
      const savedById = new Map(invoice.lines.map((l) => [l.id, l]));
      if (lineDrafts.length !== invoice.lines.length) return true;
      return lineDrafts.some((d) => {
        const line = d.lineId ? savedById.get(d.lineId) : undefined;
        if (!line) return true;
        const draftCargo = (d.cargo_line_id ?? "").trim() || null;
        const lineCargo = (line.cargo_line_id ?? "").trim() || null;
        return (
          draftCargo !== lineCargo ||
          (d.contract_no.trim() || "") !== (line.contract_no?.trim() ?? "") ||
          (d.so_no.trim() || "") !== (line.so_no?.trim() ?? "") ||
          !numbersCloseForInvoice(resolveInvoiceLineQuantity(d, shipment), line.quantity) ||
          !numbersCloseForInvoice(parseOptionalNumberInput(d.unit_price), line.unit_price)
        );
      });
    }
    if (!baselineDraftsFromSi) {
      return lineDrafts.length > 0;
    }
    if (baselineDraftsFromSi.length !== lineDrafts.length) return true;
    return lineDrafts.some((d, i) => {
      const b = baselineDraftsFromSi[i];
      if (!b) return true;
      return (
        (d.cargo_line_id ?? "").trim() !== (b.cargo_line_id ?? "").trim() ||
        (d.contract_no.trim() || "") !== (b.contract_no.trim() || "") ||
        (d.so_no.trim() || "") !== (b.so_no.trim() || "") ||
        !numbersCloseForInvoice(resolveInvoiceLineQuantity(d, shipment), resolveInvoiceLineQuantity(b, shipment)) ||
        (d.unit_price.trim() || "") !== (b.unit_price.trim() || "")
      );
    });
  }, [invoice.lines, lineDrafts, baselineDraftsFromSi]);

  const needsLinePersist = invoice.lines.length === 0 && lineDrafts.length > 0;

  const invoiceDirty = headerDirty || linesDirty || needsLinePersist;

  const previewInvoice = useMemo(
    () => buildInvoicePreviewFromDraft(invoice, form, lineDrafts, shipment),
    [invoice, form, lineDrafts, shipment],
  );

  const invoiceDirtyRef = useRef(false);
  invoiceDirtyRef.current = invoiceDirty;

  useEffect(() => {
    onDirtyChange?.(invoiceDirty);
  }, [invoiceDirty, onDirtyChange]);

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  function updateLineDraft(index: number, patch: Partial<InvoiceLineDraft>) {
    setLineDrafts((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addInvoiceLine() {
    setLineDrafts((prev) => {
      const usedIds = new Set(prev.map((r) => r.cargo_line_id).filter(Boolean));
      return [...prev, newInvoiceLineDraft(shipment, usedIds)];
    });
  }

  function removeInvoiceLine(index: number) {
    setLineDrafts((prev) => prev.filter((_, i) => i !== index));
  }

  function previewLineTotal(qtyStr: string, priceStr: string): string {
    const q = parseOptionalNumberInput(qtyStr);
    const p = parseOptionalNumberInput(priceStr);
    if (q == null || p == null) return "—";
    return formatNumericDisplay(q * p);
  }

  const handleSave = async () => {
    setSaving(true);
    const vv = vesselVoyageFromGeneral(shipment).trim() || null;
    const lp = shipment.loadport_name?.trim() || null;
    const dest = destinationSummaryFromCargo(shipment.cargo_lines).trim() || null;
    const body: Record<string, unknown> = {
      ...form,
      invoice_date: form.invoice_date || null,
      shipping_instruction_id: form.shipping_instruction_id.trim() === "" ? null : form.shipping_instruction_id,
      vessel_voyage_snapshot: vv,
      loadport_snapshot: lp,
      destination_snapshot: dest,
    };
    if (lineDrafts.length > 0) {
      body.lines = buildInvoiceLinesPayload(lineDrafts, shipment);
    }
    const res = await updateInvoice(shipmentId, invoice.id, body, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else { toast.pushToast("Invoice saved", "success"); onSaved(); }
    setSaving(false);
  };

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  useEffect(() => {
    registerSave?.(() => handleSaveRef.current());
  }, [registerSave]);

  useEffect(() => {
    if (saveTrigger === 0) return;
    if (invoiceDirtyRef.current) void handleSaveRef.current();
  }, [saveTrigger]);

  const handleDelete = async () => {
    setDeleting(true);
    const res = await deleteInvoice(shipmentId, invoice.id, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else { toast.pushToast("Invoice deleted", "success"); onSaved(); }
    setDeleting(false);
    setConfirmDelete(false);
  };

  return (
    <div className={styles.subItemCard}>
      <div className={styles.subItemHeader} onClick={() => setExpanded((p) => !p)}>
        <ChevronIcon open={expanded} />
        <h3 className={styles.subItemTitle}>Invoice: {invoice.invoice_no || "(untitled)"}</h3>
        <span className={styles.docStatusBadge}>{invoice.status}</span>
      </div>
      {expanded && (
        <div className={styles.subItemBody}>
          <div className={styles.fieldGrid}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Invoice No</label>
              <input
                className={`${styles.fieldInput} ${styles.fieldInputReadonly}`}
                readOnly
                value={invoice.invoice_no ?? ""}
                title="System-assigned; edit via support if a correction is required."
              />
            </div>
            <div className={styles.field}><label className={styles.fieldLabel}>Shipping instruction</label>
              <select className={styles.fieldInput} value={form.shipping_instruction_id} onChange={set("shipping_instruction_id")} aria-label="Shipping instruction">
                <option value="">— None —</option>
                {shippingInstructions.map((si) => (
                  <option key={si.id} value={si.id}>
                    {si.si_number?.trim() || `SI ${si.id.slice(0, 8)}…`}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}><label className={styles.fieldLabel}>Invoice Date</label><input className={styles.fieldInput} type="date" value={form.invoice_date} onChange={set("invoice_date")} /></div>
            <div className={`${styles.field} ${styles.fieldFullRow}`}>
              <label className={styles.fieldLabel}>Messrs</label>
              <textarea
                className={`${styles.fieldInput} ${styles.textareaInput}`}
                value={form.messrs}
                onChange={set("messrs")}
                rows={3}
                aria-label="Messrs"
              /></div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Vessel / Voyage</label>
              <input
                className={`${styles.fieldInput} ${styles.fieldInputReadonly}`}
                readOnly
                value={vesselVoyageDisplay}
                title="From vessel and voyage in General Information"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Load Port</label>
              <input
                className={`${styles.fieldInput} ${styles.fieldInputReadonly}`}
                readOnly
                value={loadPortDisplay}
                title="From load port in General Information"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Destination</label>
              <input
                className={`${styles.fieldInput} ${styles.fieldInputReadonly}`}
                readOnly
                value={destinationDisplay}
                title="From destination port / country on Cargo Lines"
              />
            </div>
            <div className={styles.field}><label className={styles.fieldLabel}>Marks</label><input className={styles.fieldInput} value={form.marks} onChange={set("marks")} /></div>
          </div>
          {!siSelected ? (
            <p className={styles.emptyMsg}>
              Select a <strong>shipping instruction</strong> above to view line items: description of goods, quantity,
              unit, and unit price.
            </p>
          ) : (
            <>
              <div className={styles.sectionGroupLabel}>Invoice lines</div>
              {lineDrafts.length === 0 ? (
                <p className={styles.emptyMsg}>
                  No invoice lines yet. Use <strong>+ Add line</strong> below, or add cargo lines on the linked SI
                  first.
                </p>
              ) : (
                lineDrafts.map((d, idx) => {
                  const line = displayLines[idx];
                  if (!line) return null;
                  const effCargoId = (d.cargo_line_id ?? "").trim() || null;
                  const lineForUnit: InvoiceLine = { ...line, cargo_line_id: effCargoId };
                  const linkedCargo = effCargoId ? shipment.cargo_lines.find((c) => c.id === effCargoId) : undefined;
                  const siLine =
                    selectedShippingInstruction && effCargoId
                      ? selectedShippingInstruction.lines.find((sl) => sl.cargo_line_id === effCargoId)
                      : undefined;
                  const qtyDisplay = linkedCargo
                    ? formatInvoiceLineQuantity(linkedCargo)
                    : (d?.quantity ?? "");
                  const qtyTitle = linkedCargo
                    ? cargoQtyFromLoading(linkedCargo) != null
                      ? linkedCargo.quantity_delivered != null
                        ? `Qty Delivered (Loading): ${formatNumericDisplay(linkedCargo.quantity_delivered)}`
                        : `Planned cargo qty: ${formatNumericDisplay(linkedCargo.quantity ?? 0)}`
                      : undefined
                    : siLine?.quantity != null
                      ? `SI line qty: ${formatNumericDisplay(Number(siLine.quantity))}`
                      : undefined;
                  return (
                    <div key={d.rowKey} className={styles.siCargoRow}>
                      {idx > 0 && <div className={styles.siCargoRowDivider} />}
                      <div className={styles.siCargoRowHeading}>Invoice line {idx + 1}</div>
                      <div className={styles.fieldGrid}>
                        <div className={`${styles.field} ${styles.fieldSpan2}`}>
                          <label className={styles.fieldLabel}>Description of goods</label>
                          {shipment.cargo_lines.length === 0 ? (
                            <input
                              className={`${styles.fieldInput} ${styles.fieldInputReadonly}`}
                              readOnly
                              value="Add cargo lines in the Cargo section first."
                            />
                          ) : (
                            <ComboboxSelect
                              options={cargoOptionLabelsForRow(shipment.cargo_lines, lineDrafts, idx)}
                              value={cargoLabelFromId(shipment.cargo_lines, effCargoId ?? "")}
                              onChange={(label) => {
                                const cid = cargoIdFromLabel(shipment.cargo_lines, label);
                                const cargo = shipment.cargo_lines.find((c) => c.id === cid);
                                updateLineDraft(idx, {
                                  cargo_line_id: cid,
                                  quantity: formatInvoiceLineQuantity(cargo),
                                });
                              }}
                              placeholder="Select cargo…"
                              allowEmpty
                              emptyLabel="— Select cargo —"
                              aria-label={`Description of goods, invoice line ${idx + 1}`}
                            />
                          )}
                        </div>
                        <div className={styles.field}>
                          <label className={styles.fieldLabel} title={qtyTitle}>
                            {linkedCargo?.quantity_delivered != null ? "Qty delivered (MT)" : "Qty (MT)"}
                          </label>
                          {linkedCargo ? (
                            <input
                              className={`${styles.fieldInput} ${styles.fieldInputReadonly}`}
                              readOnly
                              tabIndex={-1}
                              value={qtyDisplay || "—"}
                              title={qtyTitle}
                            />
                          ) : (
                            <input
                              className={styles.fieldInput}
                              type="text"
                              inputMode="decimal"
                              value={d?.quantity ?? ""}
                              onChange={(e) => updateLineDraft(idx, { quantity: e.target.value })}
                              aria-label={`Quantity, invoice line ${idx + 1}`}
                            />
                          )}
                        </div>
                        <div className={styles.field}>
                          <label className={styles.fieldLabel} title="From cargo line when linked">
                            Unit
                          </label>
                          <input
                            className={`${styles.fieldInput} ${styles.fieldInputReadonly}`}
                            readOnly
                            tabIndex={-1}
                            value={invoiceLineUnitDisplay(lineForUnit, shipment) || "—"}
                            title="From cargo line when linked"
                          />
                        </div>
                        <div className={styles.field}>
                          <label className={styles.fieldLabel}>Unit price</label>
                          <input
                            className={styles.fieldInput}
                            type="text"
                            inputMode="decimal"
                            value={d?.unit_price ?? ""}
                            onChange={(e) => updateLineDraft(idx, { unit_price: e.target.value })}
                            aria-label={`Unit price, invoice line ${idx + 1}`}
                          />
                        </div>
                        <div className={styles.field}>
                          <label className={styles.fieldLabel}>Total</label>
                          <input
                            className={`${styles.fieldInput} ${styles.fieldInputReadonly}`}
                            readOnly
                            tabIndex={-1}
                            value={previewLineTotal(qtyDisplay, d?.unit_price ?? "")}
                          />
                        </div>
                        <div className={styles.field}>
                          <label className={styles.fieldLabel}>Contract No</label>
                          <input
                            className={styles.fieldInput}
                            value={d?.contract_no ?? ""}
                            onChange={(e) => updateLineDraft(idx, { contract_no: e.target.value })}
                            aria-label={`Contract No, invoice line ${idx + 1}`}
                          />
                        </div>
                        <div className={styles.field}>
                          <label className={styles.fieldLabel}>SO No</label>
                          <ComboboxSelectCreatable
                            options={soDropdownOptions}
                            value={d?.so_no ?? ""}
                            onChange={(v) => updateLineDraft(idx, { so_no: v })}
                            onCreateOption={() => true}
                            placeholder="Select or type new SO…"
                            aria-label={`SO No, invoice line ${idx + 1}`}
                            inputClassName={styles.fieldInput}
                          />
                        </div>
                        <div className={styles.field}>
                          <button
                            type="button"
                            className={styles.btnSecondary}
                            onClick={() => removeInvoiceLine(idx)}
                            aria-label={`Remove invoice line ${idx + 1}`}
                          >
                            Remove line
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div className={styles.siLineToolbar}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={addInvoiceLine}
                  disabled={shipment.cargo_lines.length === 0}
                >
                  + Add line
                </button>
                {shipment.cargo_lines.length === 0 && (
                  <span className={styles.fieldMuted}>Add cargo in section C first.</span>
                )}
              </div>
            </>
          )}

          <div className={styles.siDocumentPreviewActions}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => setShowDocumentPreview(true)}
              disabled={lineDrafts.length === 0}
            >
              Preview invoice
            </button>
            <span className={styles.fieldMuted}>
              Printable commercial invoice. Add lines and save before printing if others need the latest server copy.
            </span>
          </div>

          <div className={styles.actions}>
            <button className={styles.btnPrimary} onClick={handleSave} disabled={saving || !invoiceDirty}>
              {saving ? "Saving…" : "Save Invoice"}
            </button>
            {confirmDelete ? (
              <div className={styles.inlineConfirm}>
                <span>Delete this invoice?</span>
                <button className={styles.btnDanger} onClick={handleDelete} disabled={deleting}>
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
                <button className={styles.btnSecondary} onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            ) : (
              <button className={styles.btnDanger} onClick={() => setConfirmDelete(true)}>Delete Invoice</button>
            )}
          </div>
        </div>
      )}

      <Modal
        open={showDocumentPreview}
        title={`Invoice — ${invoice.invoice_no?.trim() || "Draft"}`}
        onClose={() => setShowDocumentPreview(false)}
        size="wide"
        footer={
          <button type="button" className={styles.btnSecondary} onClick={() => setShowDocumentPreview(false)}>
            Close
          </button>
        }
      >
        <InvoiceDocument shipment={shipment} invoice={previewInvoice} />
      </Modal>
    </div>
  );
}

// ─── Packing Lists ────────────────────────────────────────────────────────

function PackingListSection({
  data,
  accessToken,
  open,
  onToggle,
  onSaved,
  toast,
  saveTrigger,
  onDirtyChange,
}: SectionProps) {
  const { setCardDirty, registerSave } = useAggregatedSectionSave("packing", saveTrigger, onDirtyChange);
  const [creating, setCreating] = useState(false);

  const usedCargoIds = useMemo(
    () => cargoIdsUsedInOtherPackingLists(data.packing_lists, ""),
    [data.packing_lists],
  );
  const maxPackingLists = data.cargo_lines.length;
  const canAddPackingList = maxPackingLists > 0 && data.packing_lists.length < maxPackingLists;

  const handleCreate = async () => {
    if (maxPackingLists === 0) {
      toast.pushToast("Add cargo lines in Shipment Planning first", "error");
      return;
    }
    if (!canAddPackingList) {
      toast.pushToast("Maximum packing lists reached (one per cargo line)", "error");
      return;
    }
    setCreating(true);
    const nextCargo = data.cargo_lines.find((c) => !usedCargoIds.has(c.id));
    const body: Record<string, unknown> = {
      loadport_snapshot: data.loadport_name?.trim() ?? null,
      destination_snapshot: nextCargo ? cargoDestinationSnapshot(nextCargo) : null,
    };
    if (nextCargo) {
      body.lines = [{
        cargo_line_id: nextCargo.id,
        description_of_goods: nextCargo.item_description?.trim() ?? nextCargo.cargo_name,
        quantity: nextCargo.quantity,
        destination_snapshot: cargoDestinationSnapshot(nextCargo),
        packing: null,
      }];
    }
    const res = await createPackingList(data.id, body, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else { toast.pushToast("Packing list created", "success"); onSaved(); }
    setCreating(false);
  };

  return (
    <SectionShell
      title="Packing Lists"
      titleIcon={<Box size={18} strokeWidth={2} />}
      anchorId="export-section-packing"
      open={open}
      onToggle={onToggle}
      actions={
        <button
          className={styles.btnSecondary}
          onClick={handleCreate}
          disabled={creating || !canAddPackingList}
          title={
            maxPackingLists === 0
              ? "Add cargo lines in Shipment Planning first"
              : !canAddPackingList
                ? `All ${maxPackingLists} cargo lines already have a packing list`
                : `${data.packing_lists.length} of ${maxPackingLists} packing lists`
          }
        >
          {creating ? "Creating…" : "+ Add Packing List"}
        </button>
      }
    >
      {data.packing_lists.length === 0 ? (
        <p className={styles.emptyMsg}>
          No packing lists. Add one per cargo line — each packing list covers a single cargo.
        </p>
      ) : (
        <>
          {maxPackingLists > 0 && (
            <p className={styles.fieldMuted}>
              {data.packing_lists.length} of {maxPackingLists} packing list{maxPackingLists === 1 ? "" : "s"} (one per cargo line).
            </p>
          )}
          {data.packing_lists.map((pl) => (
          <PackingListCard
            key={pl.id}
            packingList={pl}
            allPackingLists={data.packing_lists}
            shipmentId={data.id}
            shipment={data}
            cargoLines={data.cargo_lines}
            accessToken={accessToken}
            onSaved={onSaved}
            toast={toast}
            saveTrigger={saveTrigger}
            onDirtyChange={(dirty) => setCardDirty(pl.id, dirty)}
            registerSave={(fn) => registerSave(pl.id, fn)}
          />
        ))}
        </>
      )}
    </SectionShell>
  );
}

function PackingListCard({
  packingList,
  allPackingLists,
  shipmentId,
  shipment,
  cargoLines,
  accessToken,
  onSaved,
  toast,
  saveTrigger = 0,
  onDirtyChange,
  registerSave,
}: {
  packingList: PackingList;
  allPackingLists: PackingList[];
  shipmentId: string;
  shipment: ExportBulkingShipmentDetail;
  cargoLines: CargoLine[];
  accessToken: string;
  onSaved: () => void;
  toast: ReturnType<typeof useToast>;
  saveTrigger?: number;
  onDirtyChange?: (dirty: boolean) => void;
  registerSave?: (fn: () => Promise<void>) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);

  const [lineDrafts, setLineDrafts] = useState<PackingListLineDraft[]>(() =>
    packingListLineDraftsFromPl(packingList),
  );

  useEffect(() => {
    setLineDrafts(packingListLineDraftsFromPl(packingList));
  }, [packingList]);

  const lineDraft = lineDrafts[0];
  const savedLine = packingList.lines[0];
  const linkedCargo = packingLineResolvedCargo(cargoLines, lineDraft, savedLine?.cargo_line_id);
  const otherUsedCargoIds = useMemo(
    () => cargoIdsUsedInOtherPackingLists(allPackingLists, packingList.id),
    [allPackingLists, packingList.id],
  );

  const loadPortDisplay = shipment.loadport_name?.trim() || "—";
  const destinationHeaderDisplay = linkedCargo
    ? cargoLineDestinationDisplay(linkedCargo)
    : "—";
  const cargoHeaderLabel = linkedCargo ? cargoOptionLabel(linkedCargo) : null;

  const needsInitialLineSave = packingList.lines.length === 0 && (lineDraft?.cargo_line_id ?? "").trim() !== "";

  const linesDirty = useMemo(() => {
    const base = packingListLineDraftsFromPl(packingList)[0];
    const d = lineDrafts[0];
    if (!base && !d) return false;
    if (!base || !d) return true;
    return (
      (d.cargo_line_id ?? "").trim() !== (base.cargo_line_id ?? "").trim() ||
      (d.packing ?? "").trim() !== (base.packing ?? "").trim()
    );
  }, [packingList, lineDrafts]);

  const plDirty = linesDirty || needsInitialLineSave;

  const previewPackingList = useMemo(
    () => buildPackingListPreviewFromDraft(packingList, lineDrafts, shipment, cargoLines),
    [packingList, lineDrafts, shipment, cargoLines],
  );

  const canPreviewPackingList = Boolean((lineDraft?.cargo_line_id ?? "").trim());

  const plDirtyRef = useRef(false);
  plDirtyRef.current = plDirty;

  useEffect(() => {
    onDirtyChange?.(plDirty);
  }, [plDirty, onDirtyChange]);

  function updatePlLineDraft(patch: Partial<PackingListLineDraft>) {
    setLineDrafts((prev) => {
      const current = prev[0] ?? { rowKey: `new-${packingList.id}`, cargo_line_id: "", packing: "" };
      return [{ ...current, ...patch }];
    });
  }

  const handleSave = async () => {
    setSaving(true);
    const cargo = packingLineResolvedCargo(cargoLines, lineDraft, savedLine?.cargo_line_id);
    const body: Record<string, unknown> = {
      loadport_snapshot: shipment.loadport_name?.trim() ?? null,
      destination_snapshot: cargo ? cargoDestinationSnapshot(cargo) : null,
      packing_list_number: packingList.packing_list_number,
    };
    if ((lineDraft?.cargo_line_id ?? "").trim()) {
      body.lines = buildPackingListLinesPayload(lineDrafts, packingList.lines, cargoLines);
    }
    const res = await updatePackingList(shipmentId, packingList.id, body, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else {
      toast.pushToast("Packing list saved", "success");
      onSaved();
    }
    setSaving(false);
  };

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  useEffect(() => {
    registerSave?.(() => handleSaveRef.current());
  }, [registerSave]);

  useEffect(() => {
    if (saveTrigger === 0) return;
    if (plDirtyRef.current) void handleSaveRef.current();
  }, [saveTrigger]);

  const handleDelete = async () => {
    setDeleting(true);
    const res = await deletePackingList(shipmentId, packingList.id, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else { toast.pushToast("Packing list deleted", "success"); onSaved(); }
    setDeleting(false);
    setConfirmDelete(false);
  };

  const effCargoId = (lineDraft?.cargo_line_id ?? "").trim();
  const qtyShown = packingLineQtyDisplay(linkedCargo, savedLine);
  const destShown = packingLineDestinationDisplay(linkedCargo, savedLine);
  const rowKey = lineDraft?.rowKey ?? savedLine?.id ?? `pl-row-${packingList.id}`;

  return (
    <div className={styles.subItemCard}>
      <div className={styles.subItemHeader} onClick={() => setExpanded((p) => !p)}>
        <ChevronIcon open={expanded} />
        <h3 className={styles.subItemTitle}>
          Packing List: {packingList.packing_list_number || "(untitled)"}
          {cargoHeaderLabel ? ` — ${cargoHeaderLabel}` : ""}
        </h3>
        <span className={styles.docStatusBadge}>{packingList.status}</span>
      </div>
      {expanded && (
        <div className={styles.subItemBody}>
          <div className={styles.fieldGrid}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Packing List Number</label>
              <input
                className={`${styles.fieldInput} ${styles.fieldInputReadonly}`}
                readOnly
                value={packingList.packing_list_number ?? ""}
                title="System-assigned; edit via support if a correction is required."
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Load Port</label>
              <input
                className={`${styles.fieldInput} ${styles.fieldInputReadonly}`}
                readOnly
                value={loadPortDisplay}
                title="From general information (load port)"
                aria-label="Load port from shipment"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Destination</label>
              <input
                className={`${styles.fieldInput} ${styles.fieldInputReadonly}`}
                readOnly
                value={destinationHeaderDisplay}
                title="From the linked cargo line"
                aria-label="Destination from linked cargo"
              />
            </div>
          </div>
          <div className={styles.sectionGroupLabel}>Linked cargo</div>
          {cargoLines.length === 0 ? (
            <p className={styles.emptyMsg}>Add cargo lines in the Cargo section first.</p>
          ) : (
            <div className={styles.cargoTableWrap}>
              <table className={styles.cargoSpreadsheet}>
                <colgroup>
                  <col className={styles.plColDesc} />
                  <col className={styles.cargoColQty} />
                  <col className={styles.plColLoad} />
                  <col className={styles.plColDest} />
                  <col className={styles.plColPacking} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Description of goods (cargo)</th>
                    <th scope="col">Qty</th>
                    <th scope="col">Load port</th>
                    <th scope="col">Destination</th>
                    <th scope="col">Packing</th>
                  </tr>
                </thead>
                <tbody>
                  <tr key={rowKey}>
                    <td>
                      <ComboboxSelect
                        options={cargoOptionLabelsForPackingList(cargoLines, otherUsedCargoIds, effCargoId)}
                        value={cargoLabelFromId(cargoLines, effCargoId)}
                        onChange={(label) => {
                          const cid = cargoIdFromLabel(cargoLines, label);
                          updatePlLineDraft({ cargo_line_id: cid });
                        }}
                        placeholder="Select cargo…"
                        allowEmpty
                        emptyLabel="— Select cargo —"
                        aria-label="Cargo for this packing list"
                        inputClassName={styles.cargoCellInput}
                      />
                    </td>
                    <td>
                      <span className={styles.cargoCellReadonly} title={qtyShown !== "—" ? qtyShown : undefined}>
                        {qtyShown}
                      </span>
                    </td>
                    <td>
                      <span className={styles.cargoCellReadonly} title="From general information">
                        {loadPortDisplay}
                      </span>
                    </td>
                    <td>
                      <span className={styles.cargoCellReadonly} title="From linked cargo line">
                        {destShown}
                      </span>
                    </td>
                    <td>
                      <input
                        className={styles.cargoCellInput}
                        value={lineDraft?.packing ?? ""}
                        onChange={(e) => updatePlLineDraft({ packing: e.target.value })}
                        aria-label="Packing"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div className={styles.siDocumentPreviewActions}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => setShowDocumentPreview(true)}
              disabled={!canPreviewPackingList}
            >
              Preview packing list
            </button>
            <span className={styles.fieldMuted}>
              One packing list per cargo line. Save before printing if others need the latest server copy.
            </span>
          </div>

          <div className={styles.actions}>
            <button className={styles.btnPrimary} onClick={handleSave} disabled={saving || !plDirty}>
              {saving ? "Saving…" : "Save Packing List"}
            </button>
            {confirmDelete ? (
              <div className={styles.inlineConfirm}>
                <span>Delete this packing list?</span>
                <button className={styles.btnDanger} onClick={handleDelete} disabled={deleting}>
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
                <button className={styles.btnSecondary} onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            ) : (
              <button className={styles.btnDanger} onClick={() => setConfirmDelete(true)}>Delete Packing List</button>
            )}
          </div>
        </div>
      )}

      <Modal
        open={showDocumentPreview}
        title={`Packing list — ${packingList.packing_list_number?.trim() || "Draft"}`}
        onClose={() => setShowDocumentPreview(false)}
        size="wide"
        footer={
          <button type="button" className={styles.btnSecondary} onClick={() => setShowDocumentPreview(false)}>
            Close
          </button>
        }
      >
        <PackingListDocument data={previewPackingList} />
      </Modal>
    </div>
  );
}

// ─── SI Receive date section ──────────────────────────────────────────────────

function SiReceiveDateSection({ data, accessToken, open, onToggle, onSaved, toast, saveTrigger, onDirtyChange }: SectionProps) {
  const getOrig = useCallback(() => ({ received_shipping_instruction: toLocalDate(data.received_shipping_instruction) }), [data]);
  const [form, setForm] = useState(getOrig);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);

  useEffect(() => { setForm(getOrig()); }, [getOrig]);
  useEffect(() => {
    const dirty = JSON.stringify(form) !== JSON.stringify(getOrig());
    isDirtyRef.current = dirty;
    setIsDirty(dirty);
    onDirtyChange("siReceiveDate", dirty);
  }, [form, getOrig, onDirtyChange]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const res = await updateExportBulkingShipment(data.id, {
      received_shipping_instruction: form.received_shipping_instruction
        ? new Date(`${form.received_shipping_instruction}T00:00:00`).toISOString()
        : undefined,
    }, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else { toast.pushToast("SI receive date saved", "success"); onSaved(); }
    setSaving(false);
  }, [data.id, form, accessToken, toast, onSaved]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  useEffect(() => {
    if (saveTrigger === 0) return;
    if (isDirtyRef.current) handleSaveRef.current();
  }, [saveTrigger]);

  return (
    <SectionShell title="SI Receipt Date" open={open} onToggle={onToggle} dirty={isDirty}
      anchorId="export-section-si-receive-date">
      <Card>
        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Received Shipping Instruction</label>
            <input
              className={styles.fieldInput}
              type="date"
              value={form.received_shipping_instruction}
              onChange={(e) => setForm({ received_shipping_instruction: e.target.value })}
            />
          </div>
        </div>
        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={handleSave} disabled={saving || !isDirty}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </Card>
    </SectionShell>
  );
}

// ─── Generic voyage stage section ────────────────────────────────────────────

interface VoyageStageDef {
  key: string;
  label: string;
  type: "datetime-local" | "date";
  help?: string;
}

function VoyageStageSection({
  title, anchorId, sectionKey, fields, data, accessToken, open, onToggle, onSaved, toast, saveTrigger, onDirtyChange,
}: SectionProps & { title: string; anchorId: string; sectionKey: string; fields: VoyageStageDef[] }) {
  const getOrig = useCallback(() => {
    const f: Record<string, string> = {};
    for (const fd of fields) {
      const raw = data[fd.key as keyof ExportBulkingShipmentDetail] as string | null;
      f[fd.key] = fd.type === "date" ? toLocalDate(raw) : toLocalDatetime(raw);
    }
    return f;
  }, [data, fields]);

  const [form, setForm] = useState<Record<string, string>>(getOrig);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);

  useEffect(() => { setForm(getOrig()); }, [getOrig]);
  useEffect(() => {
    const dirty = JSON.stringify(form) !== JSON.stringify(getOrig());
    isDirtyRef.current = dirty;
    setIsDirty(dirty);
    onDirtyChange(sectionKey, dirty);
  }, [form, getOrig, sectionKey, onDirtyChange]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const body: Record<string, string | null> = {};
    for (const fd of fields) {
      const val = form[fd.key];
      body[fd.key] = val ? new Date(val).toISOString() : null;
    }
    const res = await updateExportBulkingShipment(data.id, body, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else { toast.pushToast(`${title} saved`, "success"); onSaved(); }
    setSaving(false);
  }, [data.id, form, fields, title, accessToken, toast, onSaved]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  useEffect(() => {
    if (saveTrigger === 0) return;
    if (isDirtyRef.current) handleSaveRef.current();
  }, [saveTrigger]);

  return (
    <SectionShell title={title} open={open} onToggle={onToggle} dirty={isDirty} anchorId={anchorId}>
      <Card>
        <div className={styles.fieldGrid}>
          {fields.map((fd) => (
            <div key={fd.key} className={styles.field}>
              <label className={styles.fieldLabel} title={fd.help}>{fd.label}</label>
              <input
                className={styles.fieldInput}
                type={fd.type}
                value={form[fd.key] ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, [fd.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={handleSave} disabled={saving || !isDirty}>
            {saving ? "Saving…" : `Save ${title}`}
          </button>
        </div>
      </Card>
    </SectionShell>
  );
}

const ARRIVAL_FIELDS: VoyageStageDef[] = [
  { key: "ata", label: "ATA — Actual Time of Arrival", type: "datetime-local" },
  { key: "nor", label: "NOR — Notice of Readiness", type: "datetime-local" },
  { key: "etb", label: "ETB — Estimated Time of Berth", type: "datetime-local" },
];
const AT_BERTH_FIELDS: VoyageStageDef[] = [
  { key: "atb", label: "ATB — Actual Time of Berth", type: "datetime-local", help: "Record when the vessel berthed and secured." },
];
const BL_NN_OBL_OPTIONS = ["NN", "OBL"] as const;

function sumQtyDelivered(cargoLines: CargoLine[]): number {
  return cargoLines.reduce((sum, c) => sum + (c.quantity_delivered ?? 0), 0);
}

function calcIdrBillingAmount(qtyDelivered: number, currencyTax: number, priceUsdMt: number): number | null {
  if (qtyDelivered <= 0 || Number.isNaN(currencyTax) || Number.isNaN(priceUsdMt)) return null;
  return Math.ceil(qtyDelivered * currencyTax * priceUsdMt);
}

function formatIdrAmount(n: number): string {
  return `IDR ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// ─── Pre-shipment Section ─────────────────────────────────────────────────────

function PreShipmentSection({
  data, accessToken, open, onToggle, onSaved, toast, saveTrigger, onDirtyChange,
}: SectionProps) {
  const sectionKey = "npe";

  const getOrig = useCallback(() => ({
    npe_date: toLocalDatetime(data.npe_date),
    quantity_spb: formatQuantityFieldValue(data.quantity_spb),
    spb: data.spb ?? "",
    delivery_order_pgi: data.delivery_order_pgi ?? "",
    spr: data.spr ?? "",
    bill_of_lading_no: data.bill_of_lading_no ?? "",
    bill_of_lading_date: toLocalDate(data.bill_of_lading_date),
    bill_of_lading_nn_obl: data.bill_of_lading_nn_obl ?? "",
    sent_bl: toLocalDate(data.sent_bl),
    sent_coo: toLocalDate(data.sent_coo),
    sent_phyto: toLocalDate(data.sent_phyto),
    sent_hc: toLocalDate(data.sent_hc),
    sent_sr: toLocalDate(data.sent_sr),
    sent_sustainability: toLocalDate(data.sent_sustainability),
    present_docs: toLocalDate(data.present_docs),
    peb_request_no: data.peb_request_no ?? "",
    peb_no: data.peb_no ?? "",
    peb_date: toLocalDate(data.peb_date),
    pe_no: data.pe_no ?? "",
    pe_date: toLocalDate(data.pe_date),
    hs_code: data.hs_code ?? "",
    currency_tax: formatNumericFieldValue(data.currency_tax, 6),
    biaya_keluar_price_usd_mt: formatNumericFieldValue(data.biaya_keluar_price_usd_mt, 4),
    biaya_keluar_billing_no: data.biaya_keluar_billing_no ?? "",
    levy_price_usd_mt: formatNumericFieldValue(data.levy_price_usd_mt, 4),
    levy_billing_no: data.levy_billing_no ?? "",
    billing_to_gl: toLocalDate(data.billing_to_gl),
  }), [data]);

  const [form, setForm] = useState(getOrig);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);

  useEffect(() => { setForm(getOrig()); }, [getOrig]);
  useEffect(() => {
    const dirty = JSON.stringify(form) !== JSON.stringify(getOrig());
    isDirtyRef.current = dirty;
    setIsDirty(dirty);
    onDirtyChange(sectionKey, dirty);
  }, [form, getOrig, onDirtyChange]);

  const totalQtyDelivered = useMemo(() => sumQtyDelivered(data.cargo_lines), [data.cargo_lines]);

  const biayaKeluarAmount = useMemo(() => {
    const tax = parseQuantityInput(form.currency_tax);
    const price = parseQuantityInput(form.biaya_keluar_price_usd_mt);
    if (tax == null || price == null) return null;
    return calcIdrBillingAmount(totalQtyDelivered, tax, price);
  }, [totalQtyDelivered, form.currency_tax, form.biaya_keluar_price_usd_mt]);

  const levyAmount = useMemo(() => {
    const tax = parseQuantityInput(form.currency_tax);
    const price = parseQuantityInput(form.levy_price_usd_mt);
    if (tax == null || price == null) return null;
    return calcIdrBillingAmount(totalQtyDelivered, tax, price);
  }, [totalQtyDelivered, form.currency_tax, form.levy_price_usd_mt]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const body: Record<string, string | number | null> = {
      npe_date: form.npe_date ? new Date(form.npe_date).toISOString() : null,
      quantity_spb: parseQuantityInput(form.quantity_spb),
      spb: form.spb.trim() || null,
      delivery_order_pgi: form.delivery_order_pgi.trim() || null,
      spr: form.spr.trim() || null,
      bill_of_lading_no: form.bill_of_lading_no.trim() || null,
      bill_of_lading_date: form.bill_of_lading_date ? new Date(form.bill_of_lading_date).toISOString() : null,
      bill_of_lading_nn_obl: form.bill_of_lading_nn_obl || null,
      sent_bl: form.sent_bl ? new Date(form.sent_bl).toISOString() : null,
      sent_coo: form.sent_coo ? new Date(form.sent_coo).toISOString() : null,
      sent_phyto: form.sent_phyto ? new Date(form.sent_phyto).toISOString() : null,
      sent_hc: form.sent_hc ? new Date(form.sent_hc).toISOString() : null,
      sent_sr: form.sent_sr ? new Date(form.sent_sr).toISOString() : null,
      sent_sustainability: form.sent_sustainability ? new Date(form.sent_sustainability).toISOString() : null,
      present_docs: form.present_docs ? new Date(form.present_docs).toISOString() : null,
      peb_request_no: form.peb_request_no.trim() || null,
      peb_no: form.peb_no.trim() || null,
      peb_date: form.peb_date ? new Date(form.peb_date).toISOString() : null,
      pe_no: form.pe_no.trim() || null,
      pe_date: form.pe_date ? new Date(form.pe_date).toISOString() : null,
      hs_code: form.hs_code.trim() || null,
      currency_tax: parseQuantityInput(form.currency_tax),
      biaya_keluar_price_usd_mt: parseQuantityInput(form.biaya_keluar_price_usd_mt),
      biaya_keluar_amount_idr: biayaKeluarAmount,
      biaya_keluar_billing_no: form.biaya_keluar_billing_no.trim() || null,
      levy_price_usd_mt: parseQuantityInput(form.levy_price_usd_mt),
      levy_amount_idr: levyAmount,
      levy_billing_no: form.levy_billing_no.trim() || null,
      billing_to_gl: form.billing_to_gl ? new Date(form.billing_to_gl).toISOString() : null,
    };
    const res = await updateExportBulkingShipment(data.id, body, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else { toast.pushToast("Pre-shipment saved", "success"); onSaved(); }
    setSaving(false);
  }, [data.id, form, biayaKeluarAmount, levyAmount, accessToken, toast, onSaved]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  useEffect(() => {
    if (saveTrigger === 0) return;
    if (isDirtyRef.current) handleSaveRef.current();
  }, [saveTrigger]);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <SectionShell title="Pre-shipment" open={open} onToggle={onToggle} dirty={isDirty} anchorId="export-section-npe">
      <Card>
        <div className={styles.sectionGroupLabel}>NPE &amp; SPB</div>
        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>NPE Date</label>
            <input className={styles.fieldInput} type="datetime-local" value={form.npe_date} onChange={set("npe_date")} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Quantity SPB</label>
            <input className={styles.fieldInput} type="text" inputMode="decimal" value={form.quantity_spb} onChange={set("quantity_spb")} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>SPB</label>
            <input className={styles.fieldInput} type="text" value={form.spb} onChange={set("spb")} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Delivery Order PGI</label>
            <input className={styles.fieldInput} type="text" value={form.delivery_order_pgi} onChange={set("delivery_order_pgi")} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>SPR</label>
            <input className={styles.fieldInput} type="text" value={form.spr} onChange={set("spr")} />
          </div>
        </div>

        <div className={styles.sectionGroupLabel}>Bill of Lading</div>
        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Bill of Lading No.</label>
            <input className={styles.fieldInput} type="text" value={form.bill_of_lading_no} onChange={set("bill_of_lading_no")} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Bill of Lading Date</label>
            <input className={styles.fieldInput} type="date" value={form.bill_of_lading_date} onChange={set("bill_of_lading_date")} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Bill of Lading NN / OBL</label>
            <select className={styles.fieldInput} value={form.bill_of_lading_nn_obl} onChange={set("bill_of_lading_nn_obl")}>
              <option value="">— Select —</option>
              {BL_NN_OBL_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.sectionGroupLabel}>Sent Documents</div>
        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Sent BL</label>
            <input className={styles.fieldInput} type="date" value={form.sent_bl} onChange={set("sent_bl")} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Sent COO</label>
            <input className={styles.fieldInput} type="date" value={form.sent_coo} onChange={set("sent_coo")} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Sent Phyto</label>
            <input className={styles.fieldInput} type="date" value={form.sent_phyto} onChange={set("sent_phyto")} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Sent HC</label>
            <input className={styles.fieldInput} type="date" value={form.sent_hc} onChange={set("sent_hc")} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Sent SR</label>
            <input className={styles.fieldInput} type="date" value={form.sent_sr} onChange={set("sent_sr")} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Sent Sustainability</label>
            <input className={styles.fieldInput} type="date" value={form.sent_sustainability} onChange={set("sent_sustainability")} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Present Docs</label>
            <input className={styles.fieldInput} type="date" value={form.present_docs} onChange={set("present_docs")} />
          </div>
        </div>

        <div className={styles.sectionGroupLabel}>PEB &amp; PE</div>
        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>PEB Request No</label>
            <input className={styles.fieldInput} type="text" value={form.peb_request_no} onChange={set("peb_request_no")} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>PEB No</label>
            <input className={styles.fieldInput} type="text" value={form.peb_no} onChange={set("peb_no")} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>PEB Date</label>
            <input className={styles.fieldInput} type="date" value={form.peb_date} onChange={set("peb_date")} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>PE No</label>
            <input className={styles.fieldInput} type="text" value={form.pe_no} onChange={set("pe_no")} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>PE Date</label>
            <input className={styles.fieldInput} type="date" value={form.pe_date} onChange={set("pe_date")} />
          </div>
        </div>

        <div className={styles.sectionGroupLabel}>Billing &amp; Levy</div>
        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Total Qty Delivered (MT)</label>
            <input
              className={styles.fieldInput}
              type="text"
              readOnly
              value={totalQtyDelivered > 0 ? formatNumericDisplay(totalQtyDelivered) : "—"}
              style={{ background: "var(--surface-2, #f3f4f6)", color: "var(--text-secondary, #6b7280)", cursor: "default" }}
              title="Sum of Quantity Delivered from all cargo lines (Loading section)"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>HS Code</label>
            <input className={styles.fieldInput} type="text" value={form.hs_code} onChange={set("hs_code")} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Currency Tax</label>
            <input className={styles.fieldInput} type="text" inputMode="decimal" value={form.currency_tax} onChange={set("currency_tax")} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Biaya Keluar Price ($USD/MT)</label>
            <input className={styles.fieldInput} type="text" inputMode="decimal" value={form.biaya_keluar_price_usd_mt} onChange={set("biaya_keluar_price_usd_mt")} />
          </div>
          <div className={styles.field}>
            <label
              className={styles.fieldLabel}
              title="Total Qty Delivered × Currency Tax × Biaya Keluar Price (rounded up)"
            >
              Biaya Keluar Amount (IDR)
            </label>
            <input
              className={styles.fieldInput}
              type="text"
              readOnly
              value={biayaKeluarAmount != null ? formatIdrAmount(biayaKeluarAmount) : "—"}
              style={{ background: "var(--surface-2, #f3f4f6)", color: "var(--text-secondary, #6b7280)", cursor: "default" }}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Biaya Keluar Billing No</label>
            <input className={styles.fieldInput} type="text" value={form.biaya_keluar_billing_no} onChange={set("biaya_keluar_billing_no")} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Levy Price ($USD/MT)</label>
            <input className={styles.fieldInput} type="text" inputMode="decimal" value={form.levy_price_usd_mt} onChange={set("levy_price_usd_mt")} />
          </div>
          <div className={styles.field}>
            <label
              className={styles.fieldLabel}
              title="Total Qty Delivered × Currency Tax × Levy Price (rounded up)"
            >
              Levy Amount (IDR)
            </label>
            <input
              className={styles.fieldInput}
              type="text"
              readOnly
              value={levyAmount != null ? formatIdrAmount(levyAmount) : "—"}
              style={{ background: "var(--surface-2, #f3f4f6)", color: "var(--text-secondary, #6b7280)", cursor: "default" }}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Levy Billing No</label>
            <input className={styles.fieldInput} type="text" value={form.levy_billing_no} onChange={set("levy_billing_no")} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Billing to GL</label>
            <input className={styles.fieldInput} type="date" value={form.billing_to_gl} onChange={set("billing_to_gl")} />
          </div>
        </div>
        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={handleSave} disabled={saving || !isDirty}>
            {saving ? "Saving…" : "Save Pre-shipment"}
          </button>
        </div>
      </Card>
    </SectionShell>
  );
}

// ─── Actual Laytime / Demurrage helpers ──────────────────────────────────────

/**
 * Determines the Actual Laytime Start based on three conditions:
 * 1. ATA within or after Laycan → NOR + 6 h
 * 2. ATA before Laycan Start AND ATB within Laycan → Laycan Start at 00:01
 * 3. ATA before Laycan Start AND ATB before Laycan Start → ATB
 */
function calcActualLaytimeStart(
  ata: string | null,
  atb: string | null,
  nor: string | null,
  laycanFrom: string | null,
  laycanTo: string | null,
): Date | null {
  if (!ata || !laycanFrom || !laycanTo) return null;
  const ataDate = new Date(ata);
  const laycanStart = new Date(laycanFrom);
  const laycanEnd = new Date(laycanTo);
  if (isNaN(ataDate.getTime()) || isNaN(laycanStart.getTime()) || isNaN(laycanEnd.getTime())) return null;

  // Condition 1: ATA is within or after laycan range → NOR + 6 h
  if (ataDate >= laycanStart) {
    if (!nor) return null;
    const norDate = new Date(nor);
    if (isNaN(norDate.getTime())) return null;
    return new Date(norDate.getTime() + 6 * 60 * 60 * 1000);
  }

  // ATA is before Laycan Start
  if (!atb) return null;
  const atbDate = new Date(atb);
  if (isNaN(atbDate.getTime())) return null;

  // Condition 2: ATB within laycan → Laycan Start date at 00:01
  if (atbDate >= laycanStart && atbDate <= laycanEnd) {
    const d = new Date(laycanStart);
    d.setHours(0, 1, 0, 0);
    return d;
  }

  // Condition 3: ATB before laycan start → ATB
  return atbDate;
}

function calcActualLaytimeEnd(laytimeStart: Date | null, qty: number | null, laytimeRate: number | null): Date | null {
  if (!laytimeStart || qty == null || laytimeRate == null || laytimeRate === 0) return null;
  const hours = qty / laytimeRate;
  return new Date(laytimeStart.getTime() + hours * 60 * 60 * 1000);
}

function calcActualDemurrageAmount(
  demurrageEnd: Date | null,
  laytimeEnd: Date | null,
  demurrageRate: number | null,
): number | null {
  if (!demurrageEnd || !laytimeEnd || demurrageRate == null) return null;
  const overHours = (demurrageEnd.getTime() - laytimeEnd.getTime()) / (1000 * 60 * 60);
  return Math.max(0, overHours / 24) * demurrageRate;
}

// ─── Loading Section (custom — includes number + calculated fields) ───────────

// ─── Loading Section (custom — includes per-cargo quantity reconciliation) ────

interface LocalReconciliationLine {
  id: string;
  cargo_name: string;
  item_description: string;
  quantity_delivered: string;
  bl_figure: string;
  ship_figure: string;
}

function cargoToReconciliation(c: CargoLine): LocalReconciliationLine {
  return {
    id: c.id,
    cargo_name: c.cargo_name ?? "",
    item_description: c.item_description ?? "",
    quantity_delivered: formatQuantityFieldValue(c.quantity_delivered),
    bl_figure: formatQuantityFieldValue(c.bl_figure),
    ship_figure: formatQuantityFieldValue(c.ship_figure),
  };
}

function calcCargoDiff(bl: string, ship: string): number | null {
  const blNum = parseQuantityInput(bl);
  const shipNum = parseQuantityInput(ship);
  if (blNum == null || shipNum == null) return null;
  return shipNum - blNum;
}

function calcCargoDiffPct(diff: number | null, bl: string): number | null {
  const blNum = parseQuantityInput(bl);
  if (diff == null || blNum == null || blNum === 0) return null;
  return (diff / blNum) * 100;
}

function LoadingSection({
  data, accessToken, open, onToggle, onSaved, toast, saveTrigger, onDirtyChange,
}: SectionProps) {
  const sectionKey = "loading";

  const actualLaytimeStart = useMemo(
    () => calcActualLaytimeStart(data.ata, data.atb, data.nor, data.laycan_from, data.laycan_to),
    [data.ata, data.atb, data.nor, data.laycan_from, data.laycan_to],
  );
  const actualLaytimeEnd = useMemo(
    () => calcActualLaytimeEnd(actualLaytimeStart, data.total_quantity, data.laytime_rate_mtph),
    [actualLaytimeStart, data.total_quantity, data.laytime_rate_mtph],
  );

  const getOrigLoading = useCallback(() => ({
    commence_loading: toLocalDatetime(data.commence_loading),
    etc: toLocalDatetime(data.etc),
    atc: toLocalDatetime(data.atc),
    hose_off: toLocalDatetime(data.hose_off),
  }), [data]);

  const getOrigReconciliation = useCallback(
    () => data.cargo_lines.map(cargoToReconciliation),
    [data.cargo_lines],
  );

  const [form, setForm] = useState(getOrigLoading);
  const [reconciliationLines, setReconciliationLines] = useState<LocalReconciliationLine[]>(getOrigReconciliation);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);

  useEffect(() => { setForm(getOrigLoading()); }, [getOrigLoading]);
  useEffect(() => { setReconciliationLines(getOrigReconciliation()); }, [getOrigReconciliation]);
  useEffect(() => {
    const dirty =
      JSON.stringify(form) !== JSON.stringify(getOrigLoading()) ||
      JSON.stringify(reconciliationLines) !== JSON.stringify(getOrigReconciliation());
    isDirtyRef.current = dirty;
    setIsDirty(dirty);
    onDirtyChange(sectionKey, dirty);
  }, [form, reconciliationLines, getOrigLoading, getOrigReconciliation, onDirtyChange]);

  const updateReconciliation = (idx: number, key: keyof LocalReconciliationLine, value: string) =>
    setReconciliationLines((prev) => prev.map((row, i) => (i === idx ? { ...row, [key]: value } : row)));

  const handleSave = useCallback(async () => {
    setSaving(true);
    const body: Record<string, string | null> = {
      commence_loading: form.commence_loading ? new Date(form.commence_loading).toISOString() : null,
      etc: form.etc ? new Date(form.etc).toISOString() : null,
      atc: form.atc ? new Date(form.atc).toISOString() : null,
      hose_off: form.hose_off ? new Date(form.hose_off).toISOString() : null,
    };
    const cargoPayload = reconciliationLines.map((row, idx) => {
      const orig = data.cargo_lines.find((c) => c.id === row.id);
      return {
        id: row.id,
        line_order: orig?.line_order ?? idx + 1,
        cargo_name: orig?.cargo_name ?? row.cargo_name,
        quantity: orig?.quantity ?? null,
        unit: CARGO_UNIT_MT,
        item_description: orig?.item_description ?? null,
        destination_port: orig?.destination_port ?? null,
        destination_country: orig?.destination_country ?? null,
        country_area: orig?.country_area ?? null,
        quantity_delivered: parseQuantityInput(row.quantity_delivered),
        bl_figure: parseQuantityInput(row.bl_figure),
        ship_figure: parseQuantityInput(row.ship_figure),
      };
    });
    const [shipmentRes, cargoRes] = await Promise.all([
      updateExportBulkingShipment(data.id, body, accessToken),
      upsertCargoLines(data.id, cargoPayload, accessToken),
    ]);
    if (isApiError(shipmentRes)) toast.pushToast(shipmentRes.message, "error");
    else if (isApiError(cargoRes)) toast.pushToast(cargoRes.message, "error");
    else { toast.pushToast("Loading operations saved", "success"); onSaved(); }
    setSaving(false);
  }, [data.id, data.cargo_lines, form, reconciliationLines, accessToken, toast, onSaved]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  useEffect(() => {
    if (saveTrigger === 0) return;
    if (isDirtyRef.current) handleSaveRef.current();
  }, [saveTrigger]);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <SectionShell title="Loading Operations" open={open} onToggle={onToggle} dirty={isDirty} anchorId="export-section-loading">
      <Card>
        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Commence Loading</label>
            <input className={styles.fieldInput} type="datetime-local" value={form.commence_loading} onChange={set("commence_loading")} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>ETC — Estimated Time of Completion</label>
            <input className={styles.fieldInput} type="datetime-local" value={form.etc} onChange={set("etc")} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>ATC — Actual Time of Completion</label>
            <input className={styles.fieldInput} type="datetime-local" value={form.atc} onChange={set("atc")} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Hose Off</label>
            <input className={styles.fieldInput} type="datetime-local" value={form.hose_off} onChange={set("hose_off")} />
          </div>
        </div>

        <div className={styles.sectionGroupLabel}>Quantity Reconciliation</div>
        {reconciliationLines.length === 0 ? (
          <p className={styles.emptyMsg}>No cargo lines yet. Add cargo in Shipment Planning first.</p>
        ) : (
          <div className={styles.reconTableWrap}>
            <table className={styles.reconTable}>
              <thead>
                <tr>
                  <th scope="col">Cargo</th>
                  <th scope="col">Qty Delivered (MT)</th>
                  <th scope="col">B/L Figure (MT)</th>
                  <th scope="col">Ship Figure (MT)</th>
                  <th scope="col">Diff (MT)</th>
                  <th scope="col">Diff %</th>
                </tr>
              </thead>
              <tbody>
                {reconciliationLines.map((row, idx) => {
                  const diff = calcCargoDiff(row.bl_figure, row.ship_figure);
                  const diffPct = calcCargoDiffPct(diff, row.bl_figure);
                  return (
                    <tr key={row.id}>
                      <td className={styles.reconCargoCell}>
                        <span className={styles.reconCargoName}>{row.cargo_name || `Cargo ${idx + 1}`}</span>
                        {row.item_description && (
                          <span className={styles.reconCargoDesc}>{row.item_description}</span>
                        )}
                      </td>
                      <td>
                        <input
                          className={styles.reconInput}
                          type="text"
                          inputMode="decimal"
                          value={row.quantity_delivered}
                          onChange={(e) => updateReconciliation(idx, "quantity_delivered", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className={styles.reconInput}
                          type="text"
                          inputMode="decimal"
                          value={row.bl_figure}
                          onChange={(e) => updateReconciliation(idx, "bl_figure", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className={styles.reconInput}
                          type="text"
                          inputMode="decimal"
                          value={row.ship_figure}
                          onChange={(e) => updateReconciliation(idx, "ship_figure", e.target.value)}
                        />
                      </td>
                      <td>
                        <span className={styles.reconReadonly}>{diff != null ? formatNumericDisplay(diff, 4) : "—"}</span>
                      </td>
                      <td>
                        <span className={styles.reconReadonly}>{diffPct != null ? formatPercentDisplay(diffPct, 4) : "—"}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className={styles.sectionGroupLabel}>Laytime</div>
        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Actual Laytime Start</label>
            <input
              className={styles.fieldInput}
              type="text"
              readOnly
              value={actualLaytimeStart ? formatSimDatetime(actualLaytimeStart) : "—"}
              style={{ background: "var(--surface-2, #f3f4f6)", color: "var(--text-secondary, #6b7280)", cursor: "default" }}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Actual Laytime End</label>
            <input
              className={styles.fieldInput}
              type="text"
              readOnly
              value={actualLaytimeEnd ? formatSimDatetime(actualLaytimeEnd) : "—"}
              style={{ background: "var(--surface-2, #f3f4f6)", color: "var(--text-secondary, #6b7280)", cursor: "default" }}
            />
          </div>
        </div>

        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={handleSave} disabled={saving || !isDirty}>
            {saving ? "Saving…" : "Save Loading Operations"}
          </button>
        </div>
      </Card>
    </SectionShell>
  );
}

// ─── Case Off Section (custom — includes Actual Demurrage with NPE/HoseOff toggle) ─

type DemurrageEndMode = "npe" | "hose_off";

function CaseOffSection({
  data, accessToken, open, onToggle, onSaved, toast, saveTrigger, onDirtyChange,
}: SectionProps) {
  const sectionKey = "caseOff";

  const getOrig = useCallback(() => ({
    td: toLocalDatetime(data.td),
  }), [data]);

  const [form, setForm] = useState(getOrig);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);
  const [demEndMode, setDemEndMode] = useState<DemurrageEndMode>("npe");

  useEffect(() => { setForm(getOrig()); }, [getOrig]);
  useEffect(() => {
    const dirty = JSON.stringify(form) !== JSON.stringify(getOrig());
    isDirtyRef.current = dirty;
    setIsDirty(dirty);
    onDirtyChange(sectionKey, dirty);
  }, [form, getOrig, onDirtyChange]);

  const actualLaytimeStart = useMemo(
    () => calcActualLaytimeStart(data.ata, data.atb, data.nor, data.laycan_from, data.laycan_to),
    [data.ata, data.atb, data.nor, data.laycan_from, data.laycan_to],
  );
  const actualLaytimeEnd = useMemo(
    () => calcActualLaytimeEnd(actualLaytimeStart, data.total_quantity, data.laytime_rate_mtph),
    [actualLaytimeStart, data.total_quantity, data.laytime_rate_mtph],
  );
  const demurrageEnd = useMemo(() => {
    const src = demEndMode === "npe" ? data.npe_date : data.hose_off;
    if (!src) return null;
    const d = new Date(src);
    return isNaN(d.getTime()) ? null : d;
  }, [demEndMode, data.npe_date, data.hose_off]);
  const actualDemurrageAmount = useMemo(
    () => calcActualDemurrageAmount(demurrageEnd, actualLaytimeEnd, data.demurrage_rate_pdpr),
    [demurrageEnd, actualLaytimeEnd, data.demurrage_rate_pdpr],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    const body = { td: form.td ? new Date(form.td).toISOString() : null };
    const res = await updateExportBulkingShipment(data.id, body, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else { toast.pushToast("Case Off saved", "success"); onSaved(); }
    setSaving(false);
  }, [data.id, form.td, accessToken, toast, onSaved]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  useEffect(() => {
    if (saveTrigger === 0) return;
    if (isDirtyRef.current) handleSaveRef.current();
  }, [saveTrigger]);

  const fmtAmount = (n: number) => formatMoneyDisplay(n);

  return (
    <SectionShell title="Case Off — Departure" open={open} onToggle={onToggle} dirty={isDirty} anchorId="export-section-case-off">
      <Card>
        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>TD — Time of Departure</label>
            <input
              className={styles.fieldInput}
              type="datetime-local"
              value={form.td}
              onChange={(e) => setForm((p) => ({ ...p, td: e.target.value }))}
            />
          </div>
        </div>

        <div className={styles.sectionGroupLabel}>Actual Demurrage</div>
        <div className={styles.demToggleRow}>
          <span className={styles.demToggleLabel}>Calculate by</span>
          <div className={styles.demTogglePills}>
            <button
              className={`${styles.demTogglePill} ${demEndMode === "npe" ? styles.demTogglePillActive : ""}`}
              onClick={() => setDemEndMode("npe")}
              type="button"
            >
              NPE Date
            </button>
            <button
              className={`${styles.demTogglePill} ${demEndMode === "hose_off" ? styles.demTogglePillActive : ""}`}
              onClick={() => setDemEndMode("hose_off")}
              type="button"
            >
              Hose Off
            </button>
          </div>
        </div>

        <div className={styles.demResultBlock}>
          <div className={styles.demResultRow}>
            <span className={styles.demResultLabel}>{demEndMode === "npe" ? "NPE Date" : "Hose Off"}</span>
            <span className={styles.demResultValue}>
              {demurrageEnd ? formatSimDatetime(demurrageEnd) : "—"}
            </span>
          </div>
          <div className={styles.demResultRow}>
            <span className={styles.demResultLabel}>Laytime End</span>
            <span className={styles.demResultValue}>
              {actualLaytimeEnd ? formatSimDatetime(actualLaytimeEnd) : "—"}
            </span>
          </div>
          <div className={`${styles.demResultRow} ${styles.demResultRowTotal}`}>
            <span className={styles.demResultLabelBold}>Actual Demurrage</span>
            <span className={styles.demResultAmountValue}>
              {actualDemurrageAmount != null ? `$${fmtAmount(actualDemurrageAmount)}` : "—"}
            </span>
          </div>
        </div>

        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={handleSave} disabled={saving || !isDirty}>
            {saving ? "Saving…" : "Save Case Off"}
          </button>
        </div>
      </Card>
    </SectionShell>
  );
}

// ─── StageCard ────────────────────────────────────────────────────────────────

type StageMode = "completed" | "active" | "upcoming";

function getStageMode(stageStatus: string, currentStatus: string): StageMode {
  const stageIdx = EXPORT_BULKING_STATUSES.indexOf(stageStatus as never);
  const currentIdx = EXPORT_BULKING_STATUSES.indexOf(currentStatus as never);
  if (currentIdx > stageIdx) return "completed";
  if (currentIdx === stageIdx) return "active";
  return "upcoming";
}

function StageCard({
  stageStatus,
  currentStatus,
  shipmentData,
  title,
  icon,
  completedSummary,
  upcomingFields,
  children,
  onAdvance,
  readOnly = false,
}: {
  stageStatus: string;
  currentStatus: string;
  shipmentData?: ExportBulkingShipmentDetail;
  title: string;
  icon?: ReactNode;
  completedSummary?: string;
  upcomingFields?: string[];
  children: ReactNode;
  onAdvance?: () => void;
  readOnly?: boolean;
}) {
  const mode = getStageMode(stageStatus, currentStatus);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);

  const nextStatusLabel = getNextExportBulkingStatus(stageStatus);
  const advanceTo = nextStatusLabel ? formatExportBulkingStatus(nextStatusLabel) : null;
  const canAdvance = onAdvance != null && shipmentData != null && canAdvanceExportBulkingStatus(shipmentData);
  const flatSingleSection = isSingleStageSection(children);

  if (mode === "upcoming") {
    return (
      <div className={`${styles.stageCard} ${styles.stageCardUpcoming}`}>
        <div
          className={styles.stageCardHeader}
          onClick={() => setUpcomingExpanded((v) => !v)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setUpcomingExpanded((v) => !v)}
          aria-expanded={upcomingExpanded}
        >
          <div className={styles.stageCardDot} aria-hidden>○</div>
          <div className={styles.stageCardTitleWrap}>
            {icon && <span className={styles.stageCardIcon} aria-hidden>{icon}</span>}
            <span className={styles.stageCardTitle}>{title}</span>
            {!upcomingExpanded && upcomingFields && upcomingFields.length > 0 && (
              <span className={styles.stageCardSummary}>{upcomingFields.join(" · ")}</span>
            )}
          </div>
          <ChevronIcon open={upcomingExpanded} />
        </div>
        {upcomingExpanded && (
          <div className={styles.stageCardBody}>
            <div className={styles.stageCardUpcomingNote}>
              This stage is not yet active. Fields below are read-only until the shipment reaches this stage.
            </div>
            <StageCardFlatContext.Provider value={flatSingleSection}>{children}</StageCardFlatContext.Provider>
          </div>
        )}
      </div>
    );
  }

  if (mode === "completed") {
    return (
      <div className={`${styles.stageCard} ${styles.stageCardCompleted}`}>
        <div
          className={styles.stageCardHeader}
          onClick={() => setCompletedExpanded((v) => !v)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setCompletedExpanded((v) => !v)}
          aria-expanded={completedExpanded}
        >
          <div className={`${styles.stageCardDot} ${styles.stageCardDotDone}`} aria-hidden>✓</div>
          <div className={styles.stageCardTitleWrap}>
            {icon && <span className={styles.stageCardIcon} aria-hidden>{icon}</span>}
            <span className={styles.stageCardTitle}>{title}</span>
            {completedSummary && (
              <span className={styles.stageCardSummary}>{completedSummary}</span>
            )}
          </div>
          <ChevronIcon open={completedExpanded} />
        </div>
        {completedExpanded && (
          <div className={styles.stageCardBody}>
            <div className={styles.stageCardEditNote}>
              Editing a completed stage — data is preserved as the historical record.
            </div>
            <StageCardFlatContext.Provider value={flatSingleSection}>{children}</StageCardFlatContext.Provider>
          </div>
        )}
      </div>
    );
  }

  // active
  return (
    <div className={`${styles.stageCard} ${styles.stageCardActive}`}>
      <div className={styles.stageCardHeader}>
        <div className={`${styles.stageCardDot} ${styles.stageCardDotActive}`} aria-hidden>●</div>
        <div className={styles.stageCardTitleWrap}>
          {icon && <span className={styles.stageCardIcon} aria-hidden>{icon}</span>}
          <span className={styles.stageCardTitle}>{title}</span>
          <span className={styles.stageCardBadge + " " + styles.stageCardBadgeActive}>Current Stage</span>
        </div>
      </div>
      <div className={styles.stageCardBody}>
        <StageCardFlatContext.Provider value={flatSingleSection}>{children}</StageCardFlatContext.Provider>
        {advanceTo && !readOnly && (
          <div className={styles.stageCardAdvanceRow}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={onAdvance}
              disabled={!canAdvance}
            >
              Advance to {advanceTo} →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export function ExportBulkingDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusDocumentsFromUrl = searchParams.get("focus") === "documents";
  const isViewMode = searchParams.get("mode") === "view";
  const { accessToken, user } = useAuth();
  const toast = useToast();

  const [data, setData] = useState<ExportBulkingShipmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusEvents, setStatusEvents] = useState<StatusEvent[]>([]);

  const [openSections, setOpenSections] = useState<OpenSectionsState>(() =>
    focusDocumentsFromUrl ? { ...DOCS_OPEN_SECTIONS } : { ...OPS_OPEN_SECTIONS },
  );
  const [sectionDefaultsApplied, setSectionDefaultsApplied] = useState(focusDocumentsFromUrl);

  useEffect(() => {
    if (sectionDefaultsApplied || focusDocumentsFromUrl) return;
    if (user?.role?.trim().toUpperCase() === "DOCS") {
      setOpenSections({ ...DOCS_OPEN_SECTIONS });
    }
    setSectionDefaultsApplied(true);
  }, [user, focusDocumentsFromUrl, sectionDefaultsApplied]);
  const toggleSection = (key: keyof OpenSectionsState) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const jumpToSection = useCallback((key: ExportDetailSectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: true }));
    const id = EXPORT_SECTION_ANCHORS[key];
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const allSectionsExpanded = useMemo(
    () =>
      openSections.general &&
      openSections.nomination &&
      openSections.cargo &&
      openSections.si &&
      openSections.invoices &&
      openSections.packing,
    [openSections],
  );

  const toggleAllSections = useCallback(() => {
    setOpenSections((prev) => {
      const all =
        prev.general &&
        prev.nomination &&
        prev.cargo &&
        prev.si &&
        prev.invoices &&
        prev.packing;
      if (all) {
        return {
          general: false,
          nomination: false,
          cargo: false,
          si: false,
          invoices: false,
          packing: false,
        };
      }
      return {
        general: true,
        nomination: true,
        cargo: true,
        si: true,
        invoices: true,
        packing: true,
      };
    });
  }, []);

  const focusOperationsSections = useCallback(() => {
    setOpenSections({ ...OPS_OPEN_SECTIONS });
  }, []);

  const focusDocumentsSections = useCallback(() => {
    setOpenSections({ ...DOCS_OPEN_SECTIONS });
  }, []);

  // Save All mechanism
  const [dirtySections, setDirtySections] = useState<Record<string, boolean>>({});
  const [saveTrigger, setSaveTrigger] = useState(0);
  const [savingAll, setSavingAll] = useState(false);

  const onDirtyChange = useCallback((key: string, dirty: boolean) => {
    setDirtySections((prev) => (prev[key] === dirty ? prev : { ...prev, [key]: dirty }));
  }, []);

  const isAnyDirty = Object.values(dirtySections).some(Boolean);

  const handleSaveAll = useCallback(() => {
    setSavingAll(true);
    setSaveTrigger((t) => t + 1);
    setTimeout(() => setSavingAll(false), 2500);
  }, []);

  // Unsaved navigation warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isAnyDirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isAnyDirty]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (isAnyDirty) handleSaveAll();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isAnyDirty, handleSaveAll]);

  // Fetch detail + status events
  const fetchDetail = useCallback(async () => {
    if (!id || !accessToken) return;
    setLoading(true);
    const [res, eventsRes] = await Promise.all([
      getExportBulkingShipment(id, accessToken),
      getStatusEvents(id, accessToken),
    ]);
    if (isApiError(res)) {
      setError(res.message);
    } else {
      setData(res.data);
      setError(null);
    }
    if (!isApiError(eventsRes)) setStatusEvents(eventsRes.data ?? []);
    setLoading(false);
  }, [id, accessToken]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  // Advance status
  const handleAdvanceStatus = async () => {
    if (isViewMode) return;
    if (!data || !accessToken) return;
    if (isAnyDirty) {
      toast.pushToast("Save your changes before advancing status.", "error");
      return;
    }
    if (!canAdvanceExportBulkingStatus(data)) {
      const missing = getMissingRequirementLabels(data);
      toast.pushToast(
        missing.length ? `Cannot advance: ${missing.join(", ")}` : "Cannot advance status yet",
        "error",
      );
      return;
    }
    const ns = getNextExportBulkingStatus(data.current_status);
    if (!ns) return;
    const res = await updateExportBulkingStatus(data.id, ns, accessToken);
    if (isApiError(res)) {
      toast.pushToast(res.message, "error");
    } else {
      toast.pushToast(`Status advanced to ${formatExportBulkingStatus(ns)}`, "success");
      fetchDetail();
    }
  };

  if (loading) {
    return (
      <>
        <PageHeader title="Loading…" backHref="/export/bulking" backLabel="Bulking" />
        <LoadingSkeleton lines={8} />
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <PageHeader title="Error" backHref="/export/bulking" backLabel="Bulking" />
        <Card><p className={styles.errorMsg}>{error ?? "Shipment not found."}</p></Card>
      </>
    );
  }

  const sectionProps = {
    data,
    accessToken: accessToken!,
    onSaved: fetchDetail,
    toast,
    saveTrigger,
    onDirtyChange,
  };

  return (
    <div className={`${styles.page} ${isViewMode ? styles.readOnlyPage : ""}`}>
      <PageHeader
        title={data.shipment_no}
        backHref="/export/bulking"
        backLabel="Bulking"
        onBackClick={
          !isViewMode && isAnyDirty
            ? () => {
                if (window.confirm("You have unsaved changes. Leave without saving?")) {
                  router.push("/export/bulking");
                }
              }
            : undefined
        }
        subtitle={
          isViewMode
            ? "View only — use Edit from the list to change shipment data."
            : "Summary and quick navigation below — expand sections as you need them."
        }
        titleAddon={
          <span className={`${styles.statusBadge} ${statusBadgeClass(data.current_status)}`}>
            {formatExportBulkingStatus(data.current_status)}
          </span>
        }
      />

      {/* Status workflow stepper */}
      <StatusStepper data={data} onAdvance={handleAdvanceStatus} readOnly={isViewMode} />

      <div className={styles.checklistWrap}>
        <ProcessChecklist input={detailToCompletionInput(data)} />
      </div>

      {/* Unsaved changes banner */}
      {!isViewMode && (
        <UnsavedBanner dirtySections={dirtySections} onSaveAll={handleSaveAll} saving={savingAll} />
      )}

      {/* Two-column layout */}
      <div className={styles.pageLayout}>
        <div className={styles.mainContent}>
          <ShipmentOverviewStrip data={data} />

          {/* Stage timeline */}
          <div className={styles.stageTimeline}>

            {/* Shipment Planning */}
            <StageCard
              stageStatus="SHIPMENT_PLANNING"
              currentStatus={data.current_status}
              shipmentData={data}
              title="Shipment Planning"
              icon={<ClipboardList size={16} />}
              readOnly={isViewMode}
              completedSummary={[data.vessel_name, data.loadport_name, data.total_quantity ? `${formatNumericDisplay(data.total_quantity)} MT` : null].filter(Boolean).join(" · ")}
              upcomingFields={["Vessel", "Voyage no.", "Shipper", "Load port", "Total quantity", "Cargo lines"]}
              onAdvance={handleAdvanceStatus}
            >
              <GeneralSection {...sectionProps} open={openSections.general} onToggle={() => toggleSection("general")} />
              <CargoSection {...sectionProps} open={openSections.cargo} onToggle={() => toggleSection("cargo")} />
            </StageCard>

            {/* Nomination */}
            <StageCard
              stageStatus="NOMINATION"
              currentStatus={data.current_status}
              shipmentData={data}
              title="Nomination"
              icon={<CalendarClock size={16} />}
              readOnly={isViewMode}
              completedSummary={[
                data.laycan_from && data.laycan_to ? `Laycan ${formatDate(data.laycan_from)} – ${formatDate(data.laycan_to)}` : null,
                data.eta ? `ETA ${formatDate(data.eta)}` : null,
                data.incoterms ?? null,
              ].filter(Boolean).join(" · ")}
              upcomingFields={["Received nomination", "Laycan", "Est. cargo readiness", "ETA", "Laytime rate", "Demurrage rate", "Incoterms", "Agent", "Surveyor"]}
              onAdvance={handleAdvanceStatus}
            >
              <NominationSection {...sectionProps} open={openSections.nomination} onToggle={() => toggleSection("nomination")} />
            </StageCard>

            {/* SI Received */}
            <StageCard
              stageStatus="SI_RECEIVE"
              currentStatus={data.current_status}
              shipmentData={data}
              title="SI Received"
              icon={<FileText size={16} />}
              readOnly={isViewMode}
              completedSummary={[
                data.received_shipping_instruction ? `Received ${formatDate(data.received_shipping_instruction)}` : null,
                data.shipping_instructions.length > 0 ? `${data.shipping_instructions.length} SI` : null,
                data.invoices.length > 0 ? `${data.invoices.length} Invoice` : null,
                data.packing_lists.length > 0 ? `${data.packing_lists.length} PL` : null,
              ].filter(Boolean).join(" · ")}
              upcomingFields={["SI receipt date", "Shipping Instructions", "Invoices", "Packing Lists"]}
              onAdvance={handleAdvanceStatus}
            >
              <SiReceiveDateSection {...sectionProps} open={openSections.nomination} onToggle={() => toggleSection("nomination")} />
              <SISection {...sectionProps} open={openSections.si} onToggle={() => toggleSection("si")} />
              <InvoiceSection {...sectionProps} open={openSections.invoices} onToggle={() => toggleSection("invoices")} />
              <PackingListSection {...sectionProps} open={openSections.packing} onToggle={() => toggleSection("packing")} />
            </StageCard>

            {/* Arrival */}
            <StageCard
              stageStatus="ARRIVAL"
              currentStatus={data.current_status}
              shipmentData={data}
              title="Arrival"
              icon={<Anchor size={16} />}
              readOnly={isViewMode}
              completedSummary={[
                data.ata ? `ATA ${formatDatetime(data.ata)}` : null,
                data.nor ? `NOR ${formatDatetime(data.nor)}` : null,
                data.etb ? `ETB ${formatDatetime(data.etb)}` : null,
              ].filter(Boolean).join(" · ")}
              upcomingFields={["ATA (Actual Time of Arrival)", "NOR (Notice of Readiness)", "ETB (Estimated Time of Berth)"]}
              onAdvance={handleAdvanceStatus}
            >
              <VoyageStageSection
                {...sectionProps}
                title="Arrival Times"
                anchorId="export-section-arrival"
                sectionKey="arrival"
                fields={ARRIVAL_FIELDS}
                open={true}
                onToggle={() => {}}
              />
            </StageCard>

            {/* At Berth */}
            <StageCard
              stageStatus="AT_BERTH"
              currentStatus={data.current_status}
              shipmentData={data}
              title="At Berth"
              icon={<Ship size={16} />}
              readOnly={isViewMode}
              completedSummary={data.atb ? `ATB ${formatDatetime(data.atb)}` : undefined}
              upcomingFields={["ATB (Actual Time of Berth)"]}
              onAdvance={handleAdvanceStatus}
            >
              <VoyageStageSection
                {...sectionProps}
                title="Berthing"
                anchorId="export-section-at-berth"
                sectionKey="atBerth"
                fields={AT_BERTH_FIELDS}
                open={true}
                onToggle={() => {}}
              />
            </StageCard>

            {/* Loading */}
            <StageCard
              stageStatus="LOADING"
              currentStatus={data.current_status}
              shipmentData={data}
              title="Loading"
              icon={<Package size={16} />}
              readOnly={isViewMode}
              completedSummary={[
                data.commence_loading ? `Started ${formatDatetime(data.commence_loading)}` : null,
                data.atc ? `ATC ${formatDatetime(data.atc)}` : null,
                (() => {
                  const totalBl = data.cargo_lines.reduce((sum, c) => sum + (c.bl_figure ?? 0), 0);
                  return totalBl > 0 ? `B/L ${formatNumericDisplay(totalBl)} MT` : null;
                })(),
              ].filter(Boolean).join(" · ")}
              upcomingFields={["Commence loading", "ETC", "ATC", "Hose Off", "Qty reconciliation per cargo"]}
              onAdvance={handleAdvanceStatus}
            >
              <LoadingSection
                {...sectionProps}
                open={true}
                onToggle={() => {}}
              />
            </StageCard>

            {/* Pre-shipment */}
            <StageCard
              stageStatus="NPE"
              currentStatus={data.current_status}
              shipmentData={data}
              title="Pre-shipment"
              icon={<FileCheck size={16} />}
              readOnly={isViewMode}
              completedSummary={[
                data.npe_date ? `NPE ${formatDatetime(data.npe_date)}` : null,
                data.bill_of_lading_no ? `B/L ${data.bill_of_lading_no}` : null,
              ].filter(Boolean).join(" · ") || undefined}
              upcomingFields={[
                "NPE Date", "Quantity SPB", "SPB", "Delivery Order PGI", "SPR",
                "Bill of Lading No.", "Bill of Lading Date", "Bill of Lading NN / OBL",
                "Sent BL", "Sent COO", "Sent Phyto", "Sent HC", "Sent SR", "Sent Sustainability",
                "Present Docs", "PEB Request No", "PEB No", "PEB Date", "PE No", "PE Date",
                "HS Code", "Currency Tax", "Biaya Keluar", "Levy", "Billing to GL",
              ]}
              onAdvance={handleAdvanceStatus}
            >
              <PreShipmentSection
                {...sectionProps}
                open={true}
                onToggle={() => {}}
              />
            </StageCard>

            {/* Case Off */}
            <StageCard
              stageStatus="CASE_OFF"
              currentStatus={data.current_status}
              shipmentData={data}
              title="Case Off"
              icon={<Navigation size={16} />}
              readOnly={isViewMode}
              completedSummary={[
                data.td ? `Departed ${formatDatetime(data.td)}` : null,
                (() => {
                  const ls = calcActualLaytimeStart(data.ata, data.atb, data.nor, data.laycan_from, data.laycan_to);
                  const le = calcActualLaytimeEnd(ls, data.total_quantity, data.laytime_rate_mtph);
                  const demEnd = data.npe_date ? new Date(data.npe_date) : null;
                  const amt = calcActualDemurrageAmount(demEnd, le, data.demurrage_rate_pdpr);
                  return amt != null ? `Demurrage $${formatMoneyDisplay(amt)}` : null;
                })(),
              ].filter(Boolean).join(" · ")}
              upcomingFields={["TD (Time of Departure)", "Actual Demurrage Amount"]}
            >
              <CaseOffSection
                {...sectionProps}
                open={true}
                onToggle={() => {}}
              />
            </StageCard>

          </div>
        </div>

        <div className={styles.sidebarContent}>
          <SummarySidebar data={data} />
          <DemurrageSimulationSidebar data={data} />
          <StatusHistorySidebar events={statusEvents} />
        </div>
      </div>
    </div>
  );
}
