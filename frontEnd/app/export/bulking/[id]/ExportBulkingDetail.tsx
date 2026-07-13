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
  Navigation,
  ScrollText,
  Receipt,
  Box,
  CalendarCheck,
  ClipboardCheck,
  FileSignature,
  Send,
  BadgeCheck,
  Coins,
  Trash2,
  X,
} from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useSessionPersistedState } from "@/hooks/use-session-persisted-state";
import { can } from "@/lib/permissions";
import {
  buildBulkingListReturnUrl,
  canEditExportCargo,
  canEditExportDocumentation,
  canEditExportOperations,
  friendlyExportDetailError,
  isExportDocumentationOnly,
  isExportOperationsOnly,
} from "@/lib/export-workspace";
import { duplicateDocNumberMessage } from "@/lib/export-document-numbers";
import { exportBulkingActivityTypeLabel } from "@/lib/activity-log-labels";
import { PageHeader } from "@/components/navigation";
import { DetailInfoPanelToggle } from "@/components/layout/DetailInfoPanelToggle";
import { ActivityLogRibbon } from "@/components/activity-log";
import { Card } from "@/components/cards";
import { ComboboxSelect } from "@/components/forms/ComboboxSelect/ComboboxSelect";
import { LoadingSkeleton } from "@/components/feedback";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { useToast } from "@/components/providers/ToastProvider";
import { useRegisterGuideTourHooks } from "@/components/guide-tour";
import { flushSync } from "react-dom";
import { isApiError } from "@/types/api";
import type { ActivityLogItem } from "@/types/activity-log";
import {
  formatExportBulkingStatus,
  EXPORT_BULKING_STATUSES,
} from "@/types/export-bulking";
import type {
  ExportBulkingListItem,
  ExportBulkingShipmentDetail,
  CargoLine,
  ShippingInstruction,
  Invoice,
  InvoiceLine,
  PackingList,
  PackingListLine,
  StatusEvent,
  SapLine,
  BillingLine,
  BillOfLadingLine,
} from "@/types/export-bulking";
import {
  billOfLadingDraftsToPayload,
  buildBillOfLadingDrafts,
  type BillOfLadingDraft,
} from "@/lib/export-bills-of-lading";
import {
  buildSapLineDrafts,
  distinctSoNosFromShipment,
  resolveShipmentSpr,
  sapDraftsToUpsertPayload,
  type SapLineDraft,
} from "@/lib/export-sap-lines";
import {
  billingDraftsToUpsertPayload,
  billingShipmentFormToPatch,
  buildBillingLineDrafts,
  buildBillingShipmentForm,
  sumInvoiceQtyBySo,
  allocatePaymentRequestAmounts,
  countFilledBillingSos,
  validatePaymentRequestAgainstInvoice,
  type BillingLineDraft,
  type BillingShipmentForm,
} from "@/lib/export-billing-lines";
import {
  getExportBulkingShipment,
  updateExportBulkingShipment,
  updateExportBulkingStatus,
  upsertCargoLines,
  upsertSapLines,
  upsertBillingLines,
  upsertBillsOfLading,
  upsertSiPebFields,
  deleteCargoLine,
  createShippingInstruction,
  updateShippingInstruction,
  deleteShippingInstruction,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  finalizeInvoice,
  amendInvoice,
  createPackingList,
  updatePackingList,
  deletePackingList,
  getStatusEvents,
  getExportBulkingActivityLog,
} from "@/services/export-bulking-service";
import {
  listShippers,
  listShipperLoadports,
  createShipperLoadport,
  findShipperMatch,
  shipperShortNameOptions,
  type Shipper,
  type ShipperLoadport,
} from "@/services/shipper-service";
import { listAgents, createAgent, type Agent } from "@/services/agent-service";
import { listSurveyors, createSurveyor, type Surveyor } from "@/services/surveyor-service";
import { listCommodities, resolveCommodityShortName, findCommodityMatch, type Commodity } from "@/services/commodity-service";
import { INCOTERM_OPTIONS } from "@/lib/incoterms";
import { getCountryOptions, getCountryArea } from "@/lib/countries";
import { ComboboxSelectCreatable } from "@/components/forms/ComboboxSelect/ComboboxSelectCreatable";
import { DateRangeField } from "@/components/forms/DateRangeField";
import { Modal } from "@/components/overlays";
import { InvoiceDocument } from "@/components/export-bulking/InvoiceDocument";
import {
  InvoiceAmendPrompt,
  InvoiceAuditModal,
  InvoiceDiffModal,
  InvoiceFinalizeModal,
} from "@/components/export-bulking/InvoiceWorkflowModals";
import {
  PackingListDocument,
  type PackingListDocumentPreview,
} from "@/components/export-bulking/PackingListDocument";
import { ShippingInstructionDocument } from "@/components/export-bulking/ShippingInstructionDocument";
import { ProcessChecklist } from "@/components/export-bulking/ProcessChecklist";
import { ExportBulkingDocumentsSection } from "./ExportBulkingDocumentsSection";
import {
  EXPORT_SENT_DOCUMENT_KEYS,
  EXPORT_SENT_DOCUMENT_LABELS,
  type ExportSentDocumentKey,
  getMissingRequiredSentDocumentLabels,
  isBillOfLadingSaved,
  parseRequiredSentDocuments,
  sentFieldForKey,
} from "@/lib/export-sent-documents";
import {
  canAdvanceExportBulkingStatus,
  getMissingRequirementLabels,
  getMissingVoyageCompletionLabels,
  getNextExportBulkingStatus,
} from "@/lib/export-status-requirements";
import { detailToCompletionInput } from "@/lib/export-bulking-completion";
import { buildDocumentationProgress } from "@/lib/export-documentation-progress";
import {
  PaymentRequestOcrUpload,
  type ApplyPaymentRequestOcrData,
} from "@/components/export-bulking/PaymentRequestOcrUpload";
import {
  cargoAllocationSummaries,
  siInvoiceSummary,
  siInvoiceAllocationOk,
  siQtyForCargoLine,
  siTotalQuantity,
  shippingInstructionDisplayLabel,
} from "@/lib/export-bulking-quantity";
import {
  type BlSplitDraft,
  type BlSplitMode,
  BL_SPLIT_COUNT_OPTIONS,
  blSplitDraftsEqual,
  blSplitDraftsFromEntries,
  blSplitDraftsFromLegacy,
  blSplitEntriesFromDrafts,
  blSplitModesForCargo,
  blSplitsCloseToTarget,
  blSplitsExceedTarget,
  effectiveSiLineQuantityFromBlSplits,
  formatBlSplitDocumentText,
  newBlSplitDraft,
  sumBlSplitQuantities,
} from "@/lib/bl-split";
import { findMatchingOption } from "@/lib/string-match";
import {
  validateLoadingDatetimeForm,
  shipmentHasLiquidCargo,
  type LoadingDatetimeForm,
} from "@/lib/export-bulking-loading-validation";
import {
  inferReconciliationBlSource,
  parseQuantityInput as parseReconQuantityInput,
  resolveInheritedBlFigure,
  type ReconciliationBlSource,
  type ReconciliationLineDraft,
} from "@/lib/export-bulking-reconciliation";
import { QuantityReconciliationTable } from "@/components/export-bulking/QuantityReconciliationTable";
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

/** Shipment total quantity — sum of cargo line quantities. */
function resolveShipmentTotalQuantity(data: Pick<ExportBulkingShipmentDetail, "total_quantity" | "cargo_lines">): number | null {
  const sum = cargoQuantitySum(data.cargo_lines);
  if (sum > 0) return sum;
  if (data.total_quantity != null && !Number.isNaN(Number(data.total_quantity))) {
    const n = Number(data.total_quantity);
    if (n > 0) return n;
  }
  return null;
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

function nextStatus(current: string): string | null {
  const idx = EXPORT_BULKING_STATUSES.indexOf(current as never);
  if (idx < 0 || idx >= EXPORT_BULKING_STATUSES.length - 1) return null;
  return EXPORT_BULKING_STATUSES[idx + 1];
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
    <div className={styles.stepperWrap} data-tour="export-bulking-status-stepper">
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
            data-tour="export-bulking-advance-status"
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
    npeSpb: "Data SAP",
    billOfLading: "Bill of Lading",
    sentDocuments: "Sent Documents",
    pe: "PE",
    peb: "PEB",
    billingLevy: "Billing & Levy",
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

function SummarySidebar({
  data,
  showDocDetails = true,
}: {
  data: ExportBulkingShipmentDetail;
  showDocDetails?: boolean;
}) {
  const totalQty = resolveShipmentTotalQuantity(data);

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
            {totalQty != null ? `${formatNumericDisplay(totalQty)} MT` : "—"}
          </strong>
        </div>
        {showDocDetails ? (
          <>
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
          </>
        ) : (
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Documents</span>
            <span className={styles.summaryValueMuted}>
              {data.shipping_instructions.length} shipping instruction{data.shipping_instructions.length === 1 ? "" : "s"} · {data.invoices.length} inv. · {data.packing_lists.length} PL
              <span className={styles.summaryLockHint}> (Document team)</span>
            </span>
          </div>
        )}
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

function StatusHistorySidebar({
  events,
  currentStatus,
}: {
  events: StatusEvent[];
  currentStatus: string;
}) {
  const sortedEvents = useMemo(
    () =>
      [...events].sort(
        (a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime(),
      ),
    [events],
  );

  const activeEventId = sortedEvents.find((ev) => ev.new_status === currentStatus)?.id;

  return (
    <div className={styles.sidebarCard}>
      <div className={styles.sidebarCardTitle}>Status History</div>
      {sortedEvents.length === 0 ? (
        <p className={styles.historyEmpty}>No status events yet.</p>
      ) : (
        <div className={styles.historyList}>
          {sortedEvents.map((ev) => (
            <div key={ev.id} className={styles.historyItem}>
              <div
                className={`${styles.historyDot} ${
                  ev.id === activeEventId ? styles.historyDotActive : ""
                }`}
              />
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

  useEffect(() => {
    setNpeInput(toLocalDatetime(data.npe_date));
  }, [data.npe_date]);

  // These three are always read from the shipment record — not editable in the simulation.
  const qty = resolveShipmentTotalQuantity(data);
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

// ─── save / refresh helpers ──────────────────────────────────────────────────

type DetailRefreshMode = "initial" | "silent";

type DetailSavedOptions = {
  patch?: Partial<ExportBulkingShipmentDetail>;
  cargo_lines?: CargoLine[];
  shipping_instructions?: ShippingInstruction[];
  invoices?: Invoice[];
  packing_lists?: PackingList[];
  sap_lines?: SapLine[];
  billing_lines?: BillingLine[];
  bills_of_lading?: BillOfLadingLine[];
  /** @default "none" */
  refetch?: "none" | "silent";
};

type OnSavedFn = (options?: DetailSavedOptions) => void;

function listItemToDetailPatch(item: ExportBulkingListItem): Partial<ExportBulkingShipmentDetail> {
  const {
    cargo_count: _cargoCount,
    cargo_summaries: _cargoSummaries,
    si_numbers: _siNumbers,
    invoice_numbers: _invoiceNumbers,
    pl_numbers: _plNumbers,
    cargo_names: _cargoNames,
    invoice_line_summaries: _invoiceLineSummaries,
    documentation_assigned_to: _docAssignedTo,
    documentation_assignee_name: _docAssigneeName,
    documentation_assigned_at: _docAssignedAt,
    ...shipmentFields
  } = item;
  return shipmentFields;
}

function mergeDetailSaved(
  prev: ExportBulkingShipmentDetail,
  options: DetailSavedOptions,
): ExportBulkingShipmentDetail {
  return {
    ...prev,
    ...options.patch,
    ...(options.cargo_lines !== undefined ? { cargo_lines: options.cargo_lines } : {}),
    ...(options.shipping_instructions !== undefined ? { shipping_instructions: options.shipping_instructions } : {}),
    ...(options.invoices !== undefined ? { invoices: options.invoices } : {}),
    ...(options.packing_lists !== undefined ? { packing_lists: options.packing_lists } : {}),
    ...(options.sap_lines !== undefined ? { sap_lines: options.sap_lines } : {}),
    ...(options.billing_lines !== undefined ? { billing_lines: options.billing_lines } : {}),
    ...(options.bills_of_lading !== undefined ? { bills_of_lading: options.bills_of_lading } : {}),
  };
}

function replaceNestedItem<T extends { id: string }>(items: T[], updated: T): T[] {
  return items.map((item) => (item.id === updated.id ? updated : item));
}

// ─── shared section props ────────────────────────────────────────────────────

interface SectionProps {
  data: ExportBulkingShipmentDetail;
  accessToken: string;
  open: boolean;
  onToggle: () => void;
  onSaved: OnSavedFn;
  toast: ReturnType<typeof useToast>;
  saveTrigger: number;
  onDirtyChange: (key: string, dirty: boolean) => void;
  /** When false, destination port/country and PE fields stay read-only (documentation team). */
  canEditDestinations?: boolean;
}

type SectionCoreProps = Omit<SectionProps, "open" | "onToggle">;

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
      <div className={styles.sectionBody}>
        {open ? children : null}
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

  const shipperNameOptions = shipperShortNameOptions(shipperList);

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
        const match = findShipperMatch(data.shipper, list);
        if (match) {
          setSelectedShipperId(match.id);
          setForm((prev) => ({ ...prev, shipper: match.short_name }));
        }
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
    const match = findShipperMatch(name, shipperList);
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
    const res = await updateExportBulkingShipment(data.id, {
      vessel_name: form.vessel_name,
      voyage_number: form.voyage_number,
      shipper: form.shipper,
      loadport_name: form.loadport_name.trim()
        ? findMatchingOption(loadportOptions, form.loadport_name) ?? form.loadport_name.trim()
        : null,
      remarks: form.remarks,
    }, accessToken);
    if (isApiError(res)) {
      toast.pushToast(res.message, "error");
      setSaving(false);
      return;
    }

    toast.pushToast("General information saved", "success");
    onSaved({
      patch: listItemToDetailPatch(res.data),
      refetch: "none",
    });
    setSaving(false);
  }, [data.id, form, loadportOptions, accessToken, toast, onSaved]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  useEffect(() => {
    if (saveTrigger === 0) return;
    if (isDirtyRef.current) handleSaveRef.current();
  }, [saveTrigger]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const derivedTotalQty = resolveShipmentTotalQuantity(data);

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
            <span className={styles.fieldLabel}>Total Quantity (MT)</span>
            <span className={`${styles.fieldInput} ${styles.fieldInputReadonly}`}>
              {derivedTotalQty != null ? `${formatQuantityDisplay(derivedTotalQty)} MT` : "—"}
            </span>
            <span className={styles.fieldMuted}>Calculated from cargo line at Document tab</span>
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
  length_over_all: "Length Over All",
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
  length_over_all: string;
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
  f.length_over_all = formatNumericFieldValue(d.length_over_all);
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
  const [surveyorList, setSurveyorList] = useState<Surveyor[]>([]);
  const [pendingSurveyorName, setPendingSurveyorName] = useState<string | null>(null);

  const refreshAgents = useCallback(async () => {
    const res = await listAgents(accessToken);
    if (!isApiError(res)) setAgentList((res as { data: Agent[] }).data ?? []);
  }, [accessToken]);

  const refreshSurveyors = useCallback(async () => {
    const res = await listSurveyors(accessToken);
    if (!isApiError(res)) setSurveyorList((res as { data: Surveyor[] }).data ?? []);
  }, [accessToken]);

  useEffect(() => {
    void refreshAgents();
  }, [refreshAgents]);

  useEffect(() => {
    void refreshSurveyors();
  }, [refreshSurveyors]);

  const agentNameOptions = agentList.map((a) => a.name);
  const surveyorNameOptions = surveyorList.map((s) => s.name);

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

  const handleCreateSurveyor = useCallback((name: string): boolean => {
    const canonical = findMatchingOption(surveyorNameOptions, name);
    if (canonical) {
      setForm((prev) => ({ ...prev, surveyor: canonical }));
      return true;
    }
    setPendingSurveyorName(name);
    return false;
  }, [surveyorNameOptions]);

  const confirmCreateSurveyor = useCallback(async () => {
    if (!pendingSurveyorName || !accessToken) return;
    const res = await createSurveyor({ name: pendingSurveyorName }, accessToken);
    if (!isApiError(res)) {
      const created = (res as { data?: Surveyor }).data;
      const canonicalName =
        created?.name ?? findMatchingOption(surveyorNameOptions, pendingSurveyorName) ?? pendingSurveyorName;
      await refreshSurveyors();
      setForm((prev) => ({ ...prev, surveyor: canonicalName }));
      toast.pushToast("Surveyor added to master", "success");
    } else {
      toast.pushToast(res.message, "error");
    }
    setPendingSurveyorName(null);
  }, [pendingSurveyorName, accessToken, surveyorNameOptions, refreshSurveyors, toast]);

  const cancelCreateSurveyor = useCallback(() => {
    setPendingSurveyorName(null);
    setForm((prev) => ({ ...prev, surveyor: "", surveyor_reason: "" }));
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
    body.surveyor = form.surveyor.trim()
      ? findMatchingOption(surveyorNameOptions, form.surveyor) ?? form.surveyor.trim()
      : null;
    body.surveyor_reason = form.surveyor.trim() ? (form.surveyor_reason.trim() || null) : null;
    body.agent = form.agent.trim()
      ? findMatchingOption(agentNameOptions, form.agent) ?? form.agent.trim()
      : null;
    body.laytime_rate_mtph = parseQuantityInput(form.laytime_rate_mtph);
    body.demurrage_rate_pdpr = parseQuantityInput(form.demurrage_rate_pdpr);
    body.length_over_all = parseQuantityInput(form.length_over_all);
    const res = await updateExportBulkingShipment(data.id, body, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else { toast.pushToast("Nomination details saved", "success"); onSaved({ patch: listItemToDetailPatch(res.data), refetch: "none" }); }
    setSaving(false);
  }, [data.id, form, agentNameOptions, surveyorNameOptions, accessToken, toast, onSaved]);

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
            <div className={styles.field}>
              <label className={styles.fieldLabel}>{NOMINATION_FIELD_LABELS.length_over_all}</label>
              <input
                className={styles.fieldInput}
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                value={form.length_over_all}
                onChange={set("length_over_all")}
                placeholder="e.g. 225"
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
              <label className={styles.fieldLabel}>{NOMINATION_FIELD_LABELS.surveyor}</label>
              <ComboboxSelectCreatable
                options={surveyorNameOptions}
                value={pendingSurveyorName ?? form.surveyor}
                onChange={(val) => {
                  const canonical = findMatchingOption(surveyorNameOptions, val) ?? val;
                  setForm((prev) => ({
                    ...prev,
                    surveyor: canonical,
                    surveyor_reason: canonical.trim() ? prev.surveyor_reason : "",
                  }));
                }}
                onCreateOption={handleCreateSurveyor}
                placeholder="Select or type to create…"
                externallyManaged={!!pendingSurveyorName}
                aria-label="Surveyor"
              />
              {pendingSurveyorName && (
                <div className={styles.loadportConfirm}>
                  <span>
                    Add <strong>&ldquo;{pendingSurveyorName}&rdquo;</strong> to Master Surveyor?
                  </span>
                  <div className={styles.loadportConfirmActions}>
                    <button type="button" className={styles.btnConfirmSm} onClick={confirmCreateSurveyor}>
                      Add surveyor
                    </button>
                    <button type="button" className={styles.btnCancelSm} onClick={cancelCreateSurveyor}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
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
  destination_port: string;
  destination_country: string;
  country_area: string;
  pe_no: string;
  pe_date: string;
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
    destination_port: c.destination_port ?? "",
    destination_country: country,
    country_area: area,
    pe_no: c.pe_no ?? "",
    pe_date: toLocalDate(c.pe_date),
  };
}

function CargoSection({
  data,
  accessToken,
  open,
  onToggle,
  onSaved,
  toast,
  saveTrigger,
  onDirtyChange,
  canEditDestinations = true,
}: SectionProps) {
  const [lines, setLines] = useState<LocalCargoLine[]>(() => data.cargo_lines.map(cargoToLocal));
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [confirmRemoveIdx, setConfirmRemoveIdx] = useState<number | null>(null);
  const [commodityList, setCommodityList] = useState<Commodity[]>([]);
  const isDirtyRef = useRef(false);

  const refreshCommodities = useCallback(async () => {
    const res = await listCommodities(accessToken);
    if (!isApiError(res)) setCommodityList((res as { data: Commodity[] }).data ?? []);
  }, [accessToken]);

  useEffect(() => {
    void refreshCommodities();
  }, [refreshCommodities]);

  const commodityOptions = useMemo(
    () =>
      [...commodityList]
        .map((c) => c.short_name.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    [commodityList],
  );

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
    setLines((prev) => [
      ...prev,
      {
        _key: `new-${++cargoKeyCounter}`,
        id: "",
        cargo_name: "",
        quantity: "",
        unit: CARGO_UNIT_MT,
        destination_port: "",
        destination_country: "",
        country_area: "",
        pe_no: "",
        pe_date: "",
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
      const cargoName = l.cargo_name.trim()
        ? resolveCommodityShortName(l.cargo_name, commodityList)
        : l.cargo_name;
      const commodity = findCommodityMatch(cargoName, commodityList);
      const destinationPort = canEditDestinations ? (l.destination_port || null) : (orig?.destination_port ?? null);
      const destinationCountry = canEditDestinations ? (l.destination_country || null) : (orig?.destination_country ?? null);
      const countryArea = canEditDestinations
        ? (l.destination_country?.trim() ? getCountryArea(l.destination_country) : (l.country_area || null))
        : (orig?.country_area ?? null);
      const peNo = canEditDestinations ? (l.pe_no.trim() || null) : (orig?.pe_no ?? null);
      const peDate = canEditDestinations
        ? (l.pe_date ? new Date(l.pe_date).toISOString() : null)
        : (orig?.pe_date ?? null);
      return {
        ...(l.id ? { id: l.id } : {}),
        line_order: idx + 1,
        cargo_name: cargoName,
        quantity: parseQuantityInput(l.quantity),
        unit: CARGO_UNIT_MT,
        item_description: commodity?.name ?? null,
        destination_port: destinationPort,
        destination_country: destinationCountry,
        country_area: countryArea,
        quantity_delivered: orig?.quantity_delivered ?? null,
        bl_figure: orig?.bl_figure ?? null,
        ship_figure: orig?.ship_figure ?? null,
        pe_no: peNo,
        pe_date: peDate,
      };
    });
    const res = await upsertCargoLines(data.id, payload, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else {
      const savedLines = (res as { data: CargoLine[] }).data ?? [];
      const totalQty = savedLines.reduce((sum, line) => sum + (line.quantity ?? 0), 0);
      toast.pushToast("Cargo lines saved", "success");
      onSaved({
        cargo_lines: savedLines,
        patch: { total_quantity: totalQty > 0 ? totalQty : null },
        refetch: "none",
      });
    }
    setSaving(false);
  }, [data.id, data.cargo_lines, lines, commodityList, accessToken, toast, onSaved, canEditDestinations]);

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
        {!canEditDestinations ? (
          <p className={styles.cargoDocsHint}>Destination port, country, and PE details are completed by the documentation team.</p>
        ) : null}
        {lines.length === 0 ? (
          <p className={styles.emptyMsg}>No cargo lines yet.</p>
        ) : (
          <div className={styles.cargoCardList}>
            {lines.map((line, idx) => (
              <article key={line._key} className={`${styles.subItemCard} ${styles.cargoLineCard}`}>
                <header className={styles.cargoLineCardHeader}>
                  <h4 className={styles.cargoLineCardTitle}>Cargo Line #{idx + 1}</h4>
                  {confirmRemoveIdx === idx ? (
                    <div className={styles.cargoLineCardRemoveConfirm}>
                      <span>Remove this line?</span>
                      <button
                        type="button"
                        className={styles.cargoDeleteConfirmBtn}
                        onClick={() => void removeRow(idx)}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        className={styles.btnSecondary}
                        onClick={() => setConfirmRemoveIdx(null)}
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={styles.cargoLineCardRemove}
                      onClick={() => setConfirmRemoveIdx(idx)}
                      title="Remove cargo line"
                      aria-label={`Remove cargo line ${idx + 1}`}
                    >
                      <X size={16} strokeWidth={2.5} aria-hidden />
                    </button>
                  )}
                </header>

                <div className={styles.cargoLineCardBody}>
                  <div className={styles.cargoLineCardRow}>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel} htmlFor={`cargo-commodity-${line._key}`}>
                        Commodity
                      </label>
                      <ComboboxSelect
                        id={`cargo-commodity-${line._key}`}
                        options={commodityOptions}
                        value={line.cargo_name}
                        onChange={(val) => {
                          const canonical = resolveCommodityShortName(val, commodityList);
                          updateCell(idx, "cargo_name", canonical);
                        }}
                        placeholder="Select commodity…"
                        allowEmpty
                        emptyLabel="— Select —"
                        inputClassName={styles.fieldInput}
                        aria-label={`Commodity row ${idx + 1}`}
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel} htmlFor={`cargo-qty-${line._key}`}>
                        Quantity
                      </label>
                      <input
                        id={`cargo-qty-${line._key}`}
                        className={styles.fieldInput}
                        type="text"
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={(e) => updateCell(idx, "quantity", e.target.value)}
                      />
                    </div>
                    <div className={styles.field}>
                      <span className={styles.fieldLabel}>Unit</span>
                      <span className={`${styles.fieldInput} ${styles.fieldInputReadonly}`}>{CARGO_UNIT_MT}</span>
                    </div>
                  </div>

                  <div className={styles.cargoLineCardRow}>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel} htmlFor={canEditDestinations ? `cargo-port-${line._key}` : undefined}>
                        Dest Port
                      </label>
                      {canEditDestinations ? (
                        <input
                          id={`cargo-port-${line._key}`}
                          className={styles.fieldInput}
                          value={line.destination_port}
                          onChange={(e) => updateCell(idx, "destination_port", e.target.value)}
                        />
                      ) : (
                        <span className={`${styles.fieldInput} ${styles.fieldInputReadonly}`}>
                          {line.destination_port.trim() || "—"}
                        </span>
                      )}
                    </div>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel} htmlFor={canEditDestinations ? `cargo-country-${line._key}` : undefined}>
                        Dest Country
                      </label>
                      {canEditDestinations ? (
                        <select
                          id={`cargo-country-${line._key}`}
                          className={styles.fieldInput}
                          value={line.destination_country}
                          onChange={(e) => updateDestinationCountry(idx, e.target.value)}
                        >
                          {getCountryOptions(line.destination_country).map((name) => (
                            <option key={name || "__empty"} value={name}>
                              {name || "— Select —"}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={`${styles.fieldInput} ${styles.fieldInputReadonly}`}>
                          {line.destination_country.trim() || "—"}
                        </span>
                      )}
                    </div>
                    <div className={styles.field}>
                      <span className={styles.fieldLabel}>Area</span>
                      <span
                        className={`${styles.fieldInput} ${styles.fieldInputReadonly}`}
                        title={line.country_area.trim() || undefined}
                      >
                        {line.country_area.trim() ? line.country_area : "—"}
                      </span>
                    </div>
                    <div className={styles.field}>
                      <span className={styles.fieldLabel}>PE No / Date</span>
                      {canEditDestinations ? (
                        <div className={styles.cargoPeSplit}>
                          <input
                            className={styles.fieldInput}
                            type="text"
                            placeholder="PE No"
                            value={line.pe_no}
                            onChange={(e) => updateCell(idx, "pe_no", e.target.value)}
                            aria-label={`PE number row ${idx + 1}`}
                          />
                          <input
                            className={styles.fieldInput}
                            type="date"
                            value={line.pe_date}
                            onChange={(e) => updateCell(idx, "pe_date", e.target.value)}
                            aria-label={`PE date row ${idx + 1}`}
                          />
                        </div>
                      ) : (
                        <span className={`${styles.fieldInput} ${styles.fieldInputReadonly}`}>
                          {line.pe_no.trim() || line.pe_date
                            ? `${line.pe_no.trim() || "—"}${line.pe_date ? ` · ${line.pe_date}` : ""}`
                            : "—"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}
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

/** Saved cargo rows on the shipment (Cargo section), excluding unsaved drafts. */
function registeredCargoLines(cargoLines: CargoLine[]): CargoLine[] {
  return cargoLines.filter((c) => (c.id ?? "").trim() !== "");
}

function nextUnusedCargoLine(cargoLines: CargoLine[], usedIds: Iterable<string>): CargoLine | undefined {
  const used = usedIds instanceof Set ? usedIds : new Set(usedIds);
  return registeredCargoLines(cargoLines).find((c) => !used.has(c.id));
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
  return registeredCargoLines(cargoLines)
    .filter((c) => !usedIds.has(c.id) || c.id === currentId)
    .map(cargoOptionLabel);
}

function siIdsUsedInOtherPackingLists(
  packingLists: PackingList[],
  excludePlId: string,
): Set<string> {
  const used = new Set<string>();
  for (const pl of packingLists) {
    if (pl.id === excludePlId) continue;
    const id = (pl.shipping_instruction_id ?? "").trim();
    if (id) used.add(id);
  }
  return used;
}

type SiLineRow = {
  rowKey: string;
  cargo_line_id: string;
  description_of_goods: string;
  quantity: string;
  bl_splits: BlSplitDraft[];
  destination_port: string;
};

function blSplitPreviewForRow(row: SiLineRow): string {
  const entries = blSplitEntriesFromDrafts(row.bl_splits);
  return entries.length > 0 ? formatBlSplitDocumentText(entries) : "";
}

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
      const qty = parseQuantityInput(r.quantity);
      const blEntries = blSplitEntriesFromDrafts(r.bl_splits);
      const blSum = blEntries.length > 0 ? sumBlSplitQuantities(blEntries) : qty;
      return {
        id: `preview-${i}`,
        si_id: si.id,
        cargo_line_id: r.cargo_line_id,
        description_of_goods: c?.item_description?.trim() || r.description_of_goods.trim() || null,
        quantity: qty != null && !Number.isNaN(qty) ? qty : null,
        bl_split_qty: blSum != null && !Number.isNaN(blSum) ? blSum : null,
        bl_splits: blEntries.length > 0 ? blEntries : null,
        bl_split_text: blEntries.length > 0 ? formatBlSplitDocumentText(blEntries) : null,
        destination_port: r.destination_port.trim() || c?.destination_port?.trim() || null,
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
    const lineQty = l.quantity ?? c?.quantity ?? null;
    const blSplits =
      l.bl_splits?.length
        ? blSplitDraftsFromEntries(l.bl_splits)
        : blSplitDraftsFromLegacy(l.bl_split_qty, lineQty);
    return {
      rowKey: l.id || `row-${idx}-${si.id}`,
      cargo_line_id: l.cargo_line_id ?? "",
      description_of_goods: l.description_of_goods ?? c?.item_description ?? "",
      quantity:
        l.quantity != null ? formatQuantityFieldValue(l.quantity) : formatQuantityFieldValue(c?.quantity),
      bl_splits: blSplits,
      destination_port: l.destination_port ?? c?.destination_port ?? "",
    };
  });
}

function siLineOverrideFromRows(lineRows: SiLineRow[]): { cargo_line_id: string; quantity: number | null }[] {
  return lineRows
    .filter((r) => r.cargo_line_id.trim())
    .map((r) => ({
      cargo_line_id: r.cargo_line_id,
      quantity: effectiveSiLineQuantityFromBlSplits(
        parseQuantityInput(r.quantity),
        blSplitEntriesFromDrafts(r.bl_splits),
      ),
    }));
}

function siNavTabLabel(si: ShippingInstruction): string {
  const num = si.si_number?.trim();
  return num ? `SI #${num}` : "SI (Draft)";
}

type DocDeleteTarget = { id: string; label: string } | null;

function DocDeleteConfirmModal({
  open,
  entityName,
  label,
  deleting,
  onClose,
  onConfirm,
}: {
  open: boolean;
  entityName: string;
  label: string;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      title={`Delete ${entityName}?`}
      onClose={deleting ? () => {} : onClose}
      footer={
        <>
          <button type="button" className={styles.btnSecondary} onClick={onClose} disabled={deleting}>
            Cancel
          </button>
          <button type="button" className={styles.btnDanger} onClick={onConfirm} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </>
      }
    >
      <p>
        Are you sure you want to delete <strong>{label}</strong>? This action cannot be undone.
      </p>
    </Modal>
  );
}

function DocSidebarNavItem({
  tabId,
  panelId,
  label,
  status,
  isActive,
  isDirty,
  onSelect,
  onDelete,
  showDelete = true,
}: {
  tabId: string;
  panelId: string;
  label: string;
  status: string;
  isActive: boolean;
  isDirty: boolean;
  onSelect: () => void;
  onDelete: () => void;
  showDelete?: boolean;
}) {
  return (
    <li className={styles.siNavItemRow} role="presentation">
      <button
        type="button"
        role="tab"
        id={tabId}
        aria-selected={isActive}
        aria-controls={panelId}
        className={`${styles.siNavItem} ${isActive ? styles.siNavItemActive : ""} ${isDirty ? styles.siNavItemDirty : ""}`}
        onClick={onSelect}
      >
        <span className={styles.siNavItemLabel}>{label}</span>
        <span className={styles.siNavItemStatus}>({status})</span>
      </button>
      {showDelete && (
        <button
          type="button"
          className={styles.siNavDeleteBtn}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Delete ${label}`}
          title={`Delete ${label}`}
        >
          <Trash2 size={14} strokeWidth={2} aria-hidden />
        </button>
      )}
    </li>
  );
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
  const [activeSiId, setActiveSiId] = useState(() => data.shipping_instructions[0]?.id ?? "");
  const [dirtyTabIds, setDirtyTabIds] = useState<Set<string>>(() => new Set());
  const [deleteTarget, setDeleteTarget] = useState<DocDeleteTarget>(null);
  const [deleting, setDeleting] = useState(false);

  const sis = data.shipping_instructions;

  useEffect(() => {
    if (!sis.length) {
      setActiveSiId("");
      return;
    }
    if (!sis.some((s) => s.id === activeSiId)) {
      setActiveSiId(sis[sis.length - 1]?.id ?? "");
    }
  }, [sis, activeSiId]);

  const handleCardDirty = useCallback(
    (id: string, dirty: boolean) => {
      setCardDirty(id, dirty);
      setDirtyTabIds((prev) => {
        const next = new Set(prev);
        if (dirty) next.add(id);
        else next.delete(id);
        return next;
      });
    },
    [setCardDirty],
  );

  const handleCreate = async () => {
    setCreating(true);
    const res = await createShippingInstruction(data.id, {}, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else {
      toast.pushToast("Shipping instruction created", "success");
      if (res.data?.id) setActiveSiId(res.data.id);
      onSaved({ refetch: "silent" });
    }
    setCreating(false);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await deleteShippingInstruction(data.id, deleteTarget.id, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else {
      toast.pushToast("Shipping instruction deleted", "success");
      setDirtyTabIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget.id);
        return next;
      });
      onSaved({ refetch: "silent" });
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

  return (
    <SectionShell
      title="Shipping Instructions"
      titleIcon={<ScrollText size={18} strokeWidth={2} />}
      anchorId="export-section-si"
      open={open}
      onToggle={onToggle}
    >
      <div className={styles.siShell}>
        <nav className={styles.siSidebar} aria-label="Shipping instructions">
          <ul className={styles.siNavList} role="tablist">
            {sis.map((si) => (
              <DocSidebarNavItem
                key={si.id}
                tabId={`si-tab-${si.id}`}
                panelId={`si-panel-${si.id}`}
                label={siNavTabLabel(si)}
                status={si.status?.trim() || "Draft"}
                isActive={si.id === activeSiId}
                isDirty={dirtyTabIds.has(si.id)}
                onSelect={() => setActiveSiId(si.id)}
                onDelete={() => setDeleteTarget({ id: si.id, label: siNavTabLabel(si) })}
              />
            ))}
          </ul>
          <div className={styles.siSidebarAdd}>
            <button
              type="button"
              className={styles.siSidebarAddBtn}
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? "Creating…" : "+ Add Shipping Instruction"}
            </button>
          </div>
        </nav>
        <div className={styles.siWorkspace}>
          {sis.length === 0 ? (
            <div className={styles.siWorkspaceEmpty}>
              <p className={styles.emptyMsg}>No shipping instructions yet. Use &ldquo;+ Add Shipping Instruction&rdquo; in the sidebar.</p>
            </div>
          ) : (
            sis.map((si) => (
              <div
                key={si.id}
                id={`si-panel-${si.id}`}
                role="tabpanel"
                aria-labelledby={`si-tab-${si.id}`}
                className={si.id === activeSiId ? styles.siWorkspacePane : styles.siWorkspacePaneHidden}
                hidden={si.id !== activeSiId}
              >
                <SIFormWorkspace
                  si={si}
                  shipmentId={data.id}
                  shipment={data}
                  accessToken={accessToken}
                  onSaved={onSaved}
                  toast={toast}
                  saveTrigger={saveTrigger}
                  onDirtyChange={(dirty) => handleCardDirty(si.id, dirty)}
                  registerSave={(fn) => registerSave(si.id, fn)}
                />
              </div>
            ))
          )}
        </div>
      </div>

      <DocDeleteConfirmModal
        open={deleteTarget != null}
        entityName="shipping instruction"
        label={deleteTarget?.label ?? ""}
        deleting={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </SectionShell>
  );
}

function defaultBlSplitsForCargo(cargo: CargoLine | undefined, commodities: Commodity[]): BlSplitDraft[] {
  const modes = blSplitModesForCargo(cargo, commodities);
  const mode: BlSplitMode = modes.includes("Exact") ? "Exact" : "Balance";
  return [newBlSplitDraft(cargo?.quantity, mode)];
}

function SIFormWorkspace({
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
  onSaved: OnSavedFn;
  toast: ReturnType<typeof useToast>;
  saveTrigger?: number;
  onDirtyChange?: (dirty: boolean) => void;
  registerSave?: (fn: () => Promise<void>) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);
  const [commodityList, setCommodityList] = useState<Commodity[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listCommodities(accessToken).then((res) => {
      if (!cancelled && !isApiError(res)) setCommodityList(res.data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const cargoById = useMemo(
    () => new Map(shipment.cargo_lines.map((c) => [c.id, c])),
    [shipment.cargo_lines],
  );

  const [form, setForm] = useState({
    si_number: si.si_number ?? "",
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
      si_number: si.si_number ?? "",
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
        row.quantity !== o.quantity ||
        row.destination_port !== o.destination_port ||
        !blSplitDraftsEqual(row.bl_splits, o.bl_splits)
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
      si_number: si.si_number ?? "",
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

  const siNumberError = useMemo(
    () => duplicateDocNumberMessage("si", form.si_number, shipment, si.id),
    [form.si_number, shipment, si.id],
  );

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
              description_of_goods: c?.item_description ?? "",
              quantity: c ? formatQuantityFieldValue(c.quantity) : "",
              bl_splits: defaultBlSplitsForCargo(c, commodityList),
              destination_port: c?.destination_port ?? "",
            },
      ),
    );
  }

  function updateLineRow(idx: number, patch: Partial<SiLineRow>) {
    setLineRows((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }

  function updateBlSplit(rowIdx: number, splitIdx: number, patch: Partial<BlSplitDraft>) {
    setLineRows((prev) =>
      prev.map((row, i) => {
        if (i !== rowIdx) return row;
        return {
          ...row,
          bl_splits: row.bl_splits.map((s, j) => (j === splitIdx ? { ...s, ...patch } : s)),
        };
      }),
    );
  }

  function addBlSplit(rowIdx: number) {
    setLineRows((prev) =>
      prev.map((row, i) => {
        if (i !== rowIdx) return row;
        const lineQty = parseQuantityInput(row.quantity);
        const entries = blSplitEntriesFromDrafts(row.bl_splits);
        const allocated = sumBlSplitQuantities(entries);
        const remaining = lineQty != null ? Math.max(0, lineQty - allocated) : null;
        const linked = row.cargo_line_id ? cargoById.get(row.cargo_line_id) : undefined;
        const modes = blSplitModesForCargo(linked, commodityList);
        const mode: BlSplitMode = modes.includes("Balance") ? "Balance" : modes[0];
        return {
          ...row,
          bl_splits: [...row.bl_splits, newBlSplitDraft(remaining, mode)],
        };
      }),
    );
  }

  function removeBlSplit(rowIdx: number, splitIdx: number) {
    setLineRows((prev) =>
      prev.map((row, i) => {
        if (i !== rowIdx) return row;
        const next = row.bl_splits.filter((_, j) => j !== splitIdx);
        return { ...row, bl_splits: next.length > 0 ? next : [newBlSplitDraft()] };
      }),
    );
  }

  function addSiLineRow() {
    setLineRows((prev) => [
      ...prev,
      {
        rowKey: `new-${Date.now()}`,
        cargo_line_id: "",
        description_of_goods: "",
        quantity: "",
        bl_splits: [newBlSplitDraft()],
        destination_port: "",
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
    return row ? blSplitPreviewForRow(row) : "";
  }, [lineRows]);

  const siAllocationSummaries = useMemo(() => {
    return cargoAllocationSummaries(
      shipment.cargo_lines,
      shipment.shipping_instructions,
      si.id,
      siLineOverrideFromRows(lineRows),
    );
  }, [lineRows, shipment.cargo_lines, shipment.shipping_instructions, si.id]);

  const siQtyOverAllocated = siAllocationSummaries.some((s) => s.overAllocated);

  const handleSave = async () => {
    if (siNumberError) {
      toast.pushToast(siNumberError, "error");
      return;
    }
    const rowMissingCargo = lineRows.find((r) => !r.cargo_line_id.trim());
    if (rowMissingCargo) {
      toast.pushToast("Select cargo for each cargo line row", "error");
      return;
    }
    if (siQtyOverAllocated) {
      toast.pushToast(
        siAllocationSummaries
          .filter((s) => s.overAllocated)
          .map((s) => `${s.cargoName}: allocated ${s.allocated} MT exceeds planned ${s.planned} MT`)
          .join("; "),
        "error",
      );
      return;
    }
    const blSplitExceeds = lineRows
      .filter((r) => r.cargo_line_id.trim())
      .find((r) => {
        const qty = parseQuantityInput(r.quantity);
        const entries = blSplitEntriesFromDrafts(r.bl_splits);
        return blSplitsExceedTarget(entries, qty);
      });
    if (blSplitExceeds) {
      toast.pushToast("B/L split total cannot exceed the line quantity", "error");
      return;
    }
    const rowInvalidBlSplit = lineRows
      .filter((r) => r.cargo_line_id.trim())
      .find((r) => blSplitEntriesFromDrafts(r.bl_splits).length !== r.bl_splits.length);
    if (rowInvalidBlSplit) {
      toast.pushToast("Complete count, quantity, and split type for each B/L split row", "error");
      return;
    }
    const rowMissingQty = lineRows
      .filter((r) => r.cargo_line_id.trim())
      .find((r) => {
        const entries = blSplitEntriesFromDrafts(r.bl_splits);
        const qty = effectiveSiLineQuantityFromBlSplits(parseQuantityInput(r.quantity), entries);
        return qty == null || qty <= 0;
      });
    if (rowMissingQty) {
      toast.pushToast("Enter a quantity or B/L split for each cargo line row", "error");
      return;
    }
    setSaving(true);
    const linesPayload = lineRows
      .filter((r) => r.cargo_line_id)
      .map((r) => {
        const c = cargoById.get(r.cargo_line_id);
        const blEntries = blSplitEntriesFromDrafts(r.bl_splits);
        const qty = effectiveSiLineQuantityFromBlSplits(parseQuantityInput(r.quantity), blEntries);
        const blSum = blEntries.length > 0 ? sumBlSplitQuantities(blEntries) : qty;
        return {
          cargo_line_id: r.cargo_line_id,
          description_of_goods: c?.item_description?.trim() || r.description_of_goods.trim() || null,
          quantity: qty,
          bl_split_qty: blSum ?? qty,
          bl_splits: blEntries,
          bl_split_text: blEntries.length > 0 ? formatBlSplitDocumentText(blEntries) : null,
          destination_port: r.destination_port.trim() || c?.destination_port?.trim() || null,
        };
      });
    const res = await updateShippingInstruction(
      shipmentId,
      si.id,
      {
        si_number: form.si_number.trim() || null,
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
      onSaved({
        shipping_instructions: replaceNestedItem(shipment.shipping_instructions, res.data),
        refetch: "none",
      });
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

  return (
    <>
      <div className={styles.siWorkspaceScroll}>
        <p className={styles.siWorkspaceCargoHint} title="Cargo lines linked to this shipping instruction">
          <span className={styles.siCargoLinkLabel}>Cargo linkage:</span>{" "}
          <span className={styles.siCargoLinkEm}>{linkedCargoSummary}</span>
        </p>

        <div className={`${styles.fieldGrid} ${styles.fieldGridSi}`}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Shipping Instruction Number</label>
            <input
              className={`${styles.fieldInput} ${siNumberError ? styles.fieldInputInvalid : ""}`}
              value={form.si_number}
              onChange={setFormField("si_number")}
              aria-invalid={Boolean(siNumberError)}
              aria-describedby={siNumberError ? `si-number-error-${si.id}` : undefined}
            />
            {siNumberError ? (
              <span id={`si-number-error-${si.id}`} className={styles.fieldError} role="alert">
                {siNumberError}
              </span>
            ) : (
              <span className={styles.fieldMuted}>Must be unique across all shipments.</span>
            )}
          </div>
          <div className={styles.field}>
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
          <div className={`${styles.field} ${styles.fieldSiFull}`}>
            <label className={styles.fieldLabel}>Messrs (forwarding agency)</label>
            <textarea
              className={`${styles.fieldInput} ${styles.textareaInput} ${styles.textareaCompact}`}
              value={form.messrs}
              onChange={setFormField("messrs")}
              rows={3}
              aria-label="Messrs forwarding agency"
            />
          </div>
          <div className={`${styles.field} ${styles.fieldSiFull}`}>
            <label className={styles.fieldLabel}>Consignee</label>
            <textarea
              className={`${styles.fieldInput} ${styles.textareaInput} ${styles.textareaCompact}`}
              value={form.consignee}
              onChange={setFormField("consignee")}
              rows={3}
              aria-label="Consignee"
            />
          </div>
          <div className={`${styles.field} ${styles.fieldSiFull}`}>
            <label className={styles.fieldLabel}>Notify Party</label>
            <textarea
              className={`${styles.fieldInput} ${styles.textareaInput} ${styles.textareaCompact}`}
              value={form.notify_party}
              onChange={setFormField("notify_party")}
              rows={3}
              aria-label="Notify party"
            />
          </div>
          <div className={`${styles.field} ${styles.fieldSiFull}`}>
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
              title="Synced from General Information when you save this shipping instruction."
              value={shipment.shipper ?? ""}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>NPWP</label>
            <input className={styles.fieldInput} value={form.npwp} onChange={setFormField("npwp")} />
          </div>
          <div className={`${styles.field} ${styles.fieldSiFull}`}>
            <label className={styles.fieldLabel}>B/L Indicated</label>
            <textarea
              className={`${styles.fieldInput} ${styles.textareaInput} ${styles.textareaCompact}`}
              value={form.bl_indicated}
              onChange={setFormField("bl_indicated")}
              rows={3}
              aria-label="B/L indicated"
            />
          </div>
        </div>

        <div className={styles.sectionGroupLabel}>Cargo Lines</div>
        {lineRows.length === 0 && (
          <p className={styles.emptyMsg}>No cargo lines linked. Use &ldquo;Add cargo line&rdquo; below.</p>
        )}

        {lineRows.map((row, idx) => {
          const linked = row.cargo_line_id ? cargoById.get(row.cargo_line_id) : undefined;
          const descDisplay = linked?.item_description?.trim() || row.description_of_goods || "";
          const qtyDisplay = row.quantity;
          const destCountry = linked?.destination_country?.trim() || "";
          const blSplitModeOptions = blSplitModesForCargo(linked, commodityList);

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
                    disabled={registeredCargoLines(shipment.cargo_lines).length === 0}
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
                    className={styles.fieldInput}
                    type="text"
                    inputMode="decimal"
                    value={qtyDisplay}
                    onChange={(e) => updateLineRow(idx, { quantity: e.target.value })}
                    placeholder={linked?.quantity != null ? formatQuantityFieldValue(linked.quantity) : "—"}
                    title={
                      linked?.quantity != null
                        ? `Cargo planned: ${formatNumericDisplay(linked.quantity)} MT`
                        : undefined
                    }
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
                    className={styles.fieldInput}
                    value={row.destination_port}
                    onChange={(e) => updateLineRow(idx, { destination_port: e.target.value })}
                    placeholder={linked?.destination_port?.trim() || "—"}
                    aria-label={`Destination port, cargo line ${idx + 1}`}
                  />
                  {destCountry ? (
                    <span className={styles.fieldMuted}>Country: {destCountry}</span>
                  ) : null}
                </div>
                <div className={`${styles.field} ${styles.fieldFullRow}`}>
                  <label className={styles.fieldLabel}>B/L split</label>
                  <div className={styles.blSplitList}>
                    {row.bl_splits.map((split, splitIdx) => {
                      const splitModeRaw = split.mode || "Balance";
                      const splitMode = blSplitModeOptions.includes(splitModeRaw as BlSplitMode)
                        ? splitModeRaw
                        : blSplitModeOptions[0];
                      return (
                      <div key={split.rowKey} className={styles.blSplitRow}>
                        <select
                          className={`${styles.fieldInput} ${styles.blSplitCount}`}
                          value={split.count || "1"}
                          onChange={(e) => updateBlSplit(idx, splitIdx, { count: e.target.value })}
                          aria-label={`B/L count, cargo line ${idx + 1}, split ${splitIdx + 1}`}
                        >
                          {BL_SPLIT_COUNT_OPTIONS.map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                        <span className={styles.blSplitTimes} aria-hidden="true">X</span>
                        <input
                          className={`${styles.fieldInput} ${styles.blSplitQty}`}
                          type="text"
                          inputMode="decimal"
                          value={split.quantity}
                          onChange={(e) => updateBlSplit(idx, splitIdx, { quantity: e.target.value })}
                          placeholder="Quantity (MT)"
                          aria-label={`B/L quantity, cargo line ${idx + 1}, split ${splitIdx + 1}`}
                        />
                        <span className={styles.blSplitTimes}>MTS</span>
                        <select
                          className={`${styles.fieldInput} ${styles.blSplitMode}`}
                          value={splitMode}
                          onChange={(e) => updateBlSplit(idx, splitIdx, { mode: e.target.value })}
                          aria-label={`B/L split type, cargo line ${idx + 1}, split ${splitIdx + 1}`}
                        >
                          {blSplitModeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                        {row.bl_splits.length > 1 && (
                          <button
                            type="button"
                            className={styles.btnSecondary}
                            onClick={() => removeBlSplit(idx, splitIdx)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      );
                    })}
                    <button type="button" className={styles.btnSecondary} onClick={() => addBlSplit(idx)}>
                      + Add B/L split
                    </button>
                    {(() => {
                      const lineQty = parseQuantityInput(row.quantity);
                      const entries = blSplitEntriesFromDrafts(row.bl_splits);
                      if (entries.length === 0 && lineQty == null) return null;
                      if (entries.length === 0 && lineQty != null) {
                        return (
                          <span className={styles.siCargoMetaBadge}>
                            Line quantity: {formatNumericDisplay(lineQty)} MT
                          </span>
                        );
                      }
                      const splitTotal = sumBlSplitQuantities(entries);
                      const matched = blSplitsCloseToTarget(entries, lineQty);
                      const exceeds = blSplitsExceedTarget(entries, lineQty);
                      const previewText = formatBlSplitDocumentText(entries).replace(/\n/g, " · ");
                      return (
                        <span
                          className={`${styles.siCargoMetaBadge} ${exceeds ? styles.siCargoMetaBadgeDanger : !matched ? styles.siCargoMetaBadgeWarn : ""}`}
                        >
                          {previewText}
                          {lineQty != null && !matched && !exceeds && (
                            <> · field qty {formatNumericDisplay(lineQty)} MT</>
                          )}
                          {exceeds && lineQty != null && (
                            <> · exceeds line qty ({formatNumericDisplay(lineQty)} MT)</>
                          )}
                          {matched && splitTotal > 0 && (
                            <> · total {formatNumericDisplay(splitTotal)} MT</>
                          )}
                        </span>
                      );
                    })()}
                  </div>
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

        <div className={styles.siCargoMetaBar}>
          {siAllocationSummaries.map((s) => (
            <span
              key={s.cargoId}
              className={`${styles.siCargoMetaBadge} ${s.overAllocated ? styles.siCargoMetaBadgeDanger : !s.matched ? styles.siCargoMetaBadgeWarn : ""}`}
              role="status"
            >
              <strong>{s.cargoName}:</strong>{" "}
              {formatNumericDisplay(s.allocated)} / {formatNumericDisplay(s.planned)} MT
              {!s.matched && !s.overAllocated && (
                <> · {formatNumericDisplay(s.remaining)} MT remaining</>
              )}
              {s.overAllocated && <> · over-allocated</>}
            </span>
          ))}
          <button
            type="button"
            className={`${styles.btnSecondary} ${styles.siCargoAddBtn}`}
            onClick={addSiLineRow}
            disabled={registeredCargoLines(shipment.cargo_lines).length === 0}
          >
            + Add cargo line
          </button>
          {shipment.cargo_lines.length === 0 && (
            <span className={styles.siCargoMetaHint}>Add cargo in the Document tab first.</span>
          )}
        </div>
      </div>

      <div className={styles.siWorkspaceFooter}>
        <div className={`${styles.siDocumentPreviewActions} ${styles.siWorkspaceFooterPreview}`}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => setShowDocumentPreview(true)}
          >
            preview
          </button>
          <span className={styles.fieldMuted}>
            Printable document (first cargo line).
          </span>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.btnPrimary} onClick={handleSave} disabled={saving || Boolean(siNumberError)}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

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
    </>
  );
}

// ─── Invoices ─────────────────────────────────────────────────────────────

function vesselVoyageFromGeneral(s: ExportBulkingShipmentDetail): string {
  const vessel = s.vessel_name?.trim() ?? "";
  const voyage = s.voyage_number?.trim() ?? "";
  if (vessel && voyage) return `${vessel} / ${voyage}`;
  return vessel || voyage;
}

/** Distinct SO numbers — see @/lib/export-sap-lines */

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

/** Default invoice line qty from linked SI line, else editable draft value. */
function resolveInvoiceLineQuantity(
  d: InvoiceLineDraft,
  si: ShippingInstruction | null | undefined,
): number | null {
  const fromDraft = parseOptionalNumberInput(d.quantity);
  if (fromDraft != null) return fromDraft;
  const cid = (d.cargo_line_id ?? "").trim();
  if (cid && si) {
    const fromSi = siQtyForCargoLine(si, cid);
    if (fromSi != null) return fromSi;
  }
  return null;
}

function newInvoiceLineDraft(
  shipment: ExportBulkingShipmentDetail,
  si: ShippingInstruction | null | undefined,
  usedIds: Iterable<string> = [],
  preferredQty?: number | null,
): InvoiceLineDraft {
  const next = nextUnusedCargoLine(shipment.cargo_lines, usedIds);
  let qty: number | null = null;
  if (preferredQty != null && preferredQty > 0) {
    qty = preferredQty;
  } else if (next && si) {
    qty = siQtyForCargoLine(si, next.id);
  } else {
    qty = next?.quantity ?? null;
  }
  return {
    rowKey: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    cargo_line_id: next?.id ?? "",
    contract_no: "",
    so_no: "",
    quantity: formatQuantityFieldValue(qty),
    unit_price: "",
  };
}

function remainingSiQtyForInvoice(
  si: ShippingInstruction,
  invoices: Invoice[],
  invoiceId: string,
  lineDrafts: InvoiceLineDraft[],
): number {
  const overrideLineQtys = lineDrafts.map((d) => parseOptionalNumberInput(d.quantity));
  const summary = siInvoiceSummary(si, invoices, invoiceId, overrideLineQtys);
  return Math.max(0, summary.remaining);
}

function buildDraftsFromSiForInvoice(
  si: ShippingInstruction,
  shipment: ExportBulkingShipmentDetail,
  invoiceId: string,
): InvoiceLineDraft[] {
  const remaining = remainingSiQtyForInvoice(si, shipment.invoices, invoiceId, []);
  if (si.lines.length === 1) {
    const sl = si.lines[0];
    const qty = remaining > 0 ? remaining : sl.quantity;
    return [
      {
        rowKey: `si-${sl.id}`,
        cargo_line_id: sl.cargo_line_id ?? "",
        contract_no: "",
        so_no: "",
        quantity: formatQuantityFieldValue(qty),
        unit_price: "",
      },
    ];
  }
  return buildDraftsFromSi(si);
}

/** Editable row state when the invoice has no saved lines yet — seed from SI lines + cargo qty. */
function buildDraftsFromSi(si: ShippingInstruction): InvoiceLineDraft[] {
  return si.lines.map((sl) => ({
    rowKey: `si-${sl.id}`,
    cargo_line_id: sl.cargo_line_id ?? "",
    contract_no: "",
    so_no: "",
    quantity: formatQuantityFieldValue(sl.quantity),
    unit_price: "",
  }));
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
  if (si?.lines?.length) return buildDraftsFromSi(si);
  return [];
}

function invoiceDraftsToDisplayLines(
  drafts: InvoiceLineDraft[],
  invoiceId: string,
  shipment: ExportBulkingShipmentDetail,
  savedLines: InvoiceLine[],
  si: ShippingInstruction | null | undefined,
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
          si,
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
  shippingInstructions: ShippingInstruction[],
): Invoice {
  const si = shippingInstructions.find(
    (s) => s.id === (form.shipping_instruction_id.trim() || invoice.shipping_instruction_id),
  );
  const displayLines = invoiceDraftsToDisplayLines(lineDrafts, invoice.id, shipment, invoice.lines, si);
  const lines = displayLines.map((line, idx) => {
    const d = lineDrafts[idx];
    const q = resolveInvoiceLineQuantity(d, si) ?? line.quantity;
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
  si: ShippingInstruction | null | undefined,
  shipment: ExportBulkingShipmentDetail,
): Record<string, unknown>[] {
  return drafts.map((d, idx) => {
    const q = resolveInvoiceLineQuantity(d, si);
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

/** Packing list line edit state — qty follows SI (read-only); packing is editable. */
type PackingListLineDraft = {
  rowKey: string;
  cargo_line_id: string;
  quantity: string;
  packing: string;
};

function packingListLineDraftsFromSi(
  si: ShippingInstruction,
  savedLines: PackingListLine[],
): PackingListLineDraft[] {
  return si.lines.map((sl, idx) => {
    const saved = savedLines.find((l) => (l.cargo_line_id ?? "") === (sl.cargo_line_id ?? ""));
    return {
      rowKey: saved?.id ?? `si-line-${sl.id}-${idx}`,
      cargo_line_id: sl.cargo_line_id ?? "",
      quantity: formatQuantityFieldValue(sl.quantity),
      packing: saved?.packing ?? "",
    };
  });
}

function packingListLineDraftsFromPl(
  pl: PackingList,
  shippingInstructions: ShippingInstruction[],
): PackingListLineDraft[] {
  const siId = (pl.shipping_instruction_id ?? "").trim();
  const si = siId ? shippingInstructions.find((s) => s.id === siId) : undefined;
  if (si?.lines?.length) return packingListLineDraftsFromSi(si, pl.lines);
  return pl.lines.map((line) => ({
    rowKey: line.id,
    cargo_line_id: line.cargo_line_id ?? "",
    quantity: formatQuantityFieldValue(line.quantity),
    packing: line.packing ?? "",
  }));
}

/** Persisted packing list line bodies — qty/description derived server-side from SI; packing from draft. */
function buildPackingListLinesPayload(
  drafts: PackingListLineDraft[],
): Record<string, unknown>[] {
  return drafts.map((d) => ({
    cargo_line_id: (d.cargo_line_id ?? "").trim() || null,
    packing: (d.packing ?? "").trim() || null,
  }));
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

function packingLineQtyDisplay(
  si: ShippingInstruction | undefined,
  cargoLineId: string,
  line: PackingListLine | undefined,
): string {
  if (si && cargoLineId) {
    const q = siQtyForCargoLine(si, cargoLineId);
    if (q != null) return formatNumericDisplay(q);
  }
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
  linkedSi: ShippingInstruction | undefined,
): PackingListDocumentPreview {
  const draft = lineDrafts[0];
  const saved = packingList.lines[0];
  const cargo = packingLineResolvedCargo(cargoLines, draft, saved?.cargo_line_id);

  const commodity = upperDocText(packingLineDescriptionDisplay(cargo, saved));
  const qtyFromSi = linkedSi && draft?.cargo_line_id
    ? siTotalQuantity(linkedSi)
    : null;
  const quantity = upperDocText(
    qtyFromSi != null
      ? `${formatNumericDisplay(qtyFromSi)} MT`
      : packingLineQtyDisplay(linkedSi, draft?.cargo_line_id ?? "", saved).replace(/—/g, "") || "—",
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

const EXPORT_VOYAGE_SECTION_ANCHORS = [
  { anchor: "export-section-arrival", short: "Arrival", full: "Arrival Times" },
  { anchor: "export-section-at-berth", short: "Berth", full: "At Berth" },
  { anchor: "export-section-loading", short: "Loading", full: "Loading Operations" },
  { anchor: "export-section-case-off", short: "Case Off", full: "Case Off — Departure" },
] as const;

const EXPORT_DOC_SECTION_ANCHORS = [
  { key: "npeSpb" as const, anchor: "export-section-npe-spb", short: "SAP", full: "Data SAP" },
  { key: "billOfLading" as const, anchor: "export-section-bill-of-lading", short: "B/L", full: "Bill of Lading" },
  { key: "sentDocuments" as const, anchor: "export-section-sent-documents", short: "Sent", full: "Sent Documents" },
  { key: "peb" as const, anchor: "export-section-peb", short: "PEB", full: "PEB" },
  { key: "billingLevy" as const, anchor: "export-section-billing-levy", short: "Billing", full: "Billing & Levy" },
];

type ExportDetailSectionKey = keyof typeof EXPORT_SECTION_ANCHORS;

const EXPORT_DETAIL_NAV_OPS: { key: ExportDetailSectionKey; short: string; full: string }[] = [
  { key: "general", short: "General", full: "General Information" },
  { key: "nomination", short: "Nomination", full: "Nomination" },
];

const EXPORT_DETAIL_NAV_DOCS: { key: ExportDetailSectionKey; short: string; full: string }[] = [
  { key: "cargo", short: "Cargo", full: "Cargo Lines" },
  { key: "si", short: "Ship. Inst.", full: "Shipping Instructions" },
  { key: "invoices", short: "Invoices", full: "Invoices" },
  { key: "packing", short: "Packing", full: "Packing Lists" },
];

type OpenSectionsState = {
  general: boolean;
  nomination: boolean;
  cargo: boolean;
  siReceiveDate: boolean;
  si: boolean;
  invoices: boolean;
  packing: boolean;
  npeSpb: boolean;
  billOfLading: boolean;
  sentDocuments: boolean;
  pe: boolean;
  peb: boolean;
  billingLevy: boolean;
};

const OPS_OPEN_SECTIONS: OpenSectionsState = {
  general: true,
  nomination: true,
  cargo: false,
  siReceiveDate: false,
  si: false,
  invoices: false,
  packing: false,
  npeSpb: false,
  billOfLading: false,
  sentDocuments: false,
  pe: false,
  peb: false,
  billingLevy: false,
};

const DOCS_OPEN_SECTIONS: OpenSectionsState = {
  general: false,
  nomination: false,
  cargo: true,
  siReceiveDate: true,
  si: true,
  invoices: true,
  packing: true,
  npeSpb: true,
  billOfLading: true,
  sentDocuments: true,
  pe: true,
  peb: true,
  billingLevy: true,
};

const DIRTY_SECTION_OPEN_KEYS: Partial<Record<string, keyof OpenSectionsState>> = {
  general: "general",
  nomination: "nomination",
  cargo: "cargo",
  siReceiveDate: "siReceiveDate",
  si: "si",
  invoices: "invoices",
  packing: "packing",
  npeSpb: "npeSpb",
  billOfLading: "billOfLading",
  sentDocuments: "sentDocuments",
  pe: "pe",
  peb: "peb",
  billingLevy: "billingLevy",
};

function ExportWorkspaceBanner({
  variant,
}: {
  variant: "documentation" | "operations-readonly" | "documentation-readonly" | "view-only";
}) {
  if (variant === "documentation") {
    return (
      <div className={styles.workspaceBanner} role="status">
        <strong>Documentation workspace</strong>
        <span>Operational fields are read-only — use the Document tab for cargo lines, shipping instructions, invoices, packing lists, B/L, and export documents.</span>
      </div>
    );
  }
  if (variant === "operations-readonly") {
    return (
      <div className={styles.workspaceBanner} role="status">
        <strong>Operations (view only)</strong>
        <span>Voyage planning, nomination, and loading data are read-only in your role.</span>
      </div>
    );
  }
  if (variant === "documentation-readonly") {
    return (
      <div className={styles.workspaceBanner} role="status">
        <strong>Document (view only)</strong>
        <span>Cargo lines, shipping instructions, invoices, packing lists, and uploads are read-only in your role.</span>
      </div>
    );
  }
  if (variant === "view-only") {
    return (
      <div className={styles.workspaceBanner} role="status">
        <strong>View only</strong>
        <span>You can browse shipment data but cannot make changes.</span>
      </div>
    );
  }
  return null;
}

type ExportDetailTab = "operations" | "documentation";

function parseDetailTab(
  tabParam: string | null,
  focusDocuments: boolean,
): ExportDetailTab {
  if (tabParam === "documentation" || focusDocuments) return "documentation";
  return "operations";
}

function DetailWorkspaceTabs({
  active,
  onChange,
}: {
  active: ExportDetailTab;
  onChange: (tab: ExportDetailTab) => void;
}) {
  return (
    <div className={styles.detailTabsRow}>
      <div
        className={styles.detailTabs}
        role="tablist"
        aria-label="Shipment workspace"
        data-tour="export-bulking-detail-tabs"
      >
        <button
          type="button"
          role="tab"
          aria-selected={active === "operations"}
          className={`${styles.detailTab} ${active === "operations" ? styles.detailTabActive : ""}`}
          onClick={() => onChange("operations")}
        >
          Operations
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={active === "documentation"}
          className={`${styles.detailTab} ${active === "documentation" ? styles.detailTabActive : ""}`}
          onClick={() => onChange("documentation")}
        >
          Document
        </button>
      </div>
    </div>
  );
}

function ShipmentOverviewStrip({
  data,
  showDocCounts = true,
}: {
  data: ExportBulkingShipmentDetail;
  showDocCounts?: boolean;
}) {
  const vesselVoyage = vesselVoyageFromGeneral(data).trim() || "—";
  const loadPort = data.loadport_name?.trim() || "—";
  const shipper = data.shipper?.trim() || "—";
  const totalQty = resolveShipmentTotalQuantity(data);
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
      <div className={styles.overviewStripMeta} aria-label={showDocCounts ? "Document counts" : "Shipment counts"}>
        <span className={styles.overviewChip}>
          Cargo lines <strong>{data.cargo_lines.length}</strong>
        </span>
        {showDocCounts ? (
          <>
            <span className={styles.overviewChip}>
              Shipping instruction{data.shipping_instructions.length === 1 ? "" : "s"}{" "}
              <strong>{data.shipping_instructions.length}</strong>
            </span>
            <span className={styles.overviewChip}>
              Inv. <strong>{data.invoices.length}</strong>
            </span>
            <span className={styles.overviewChip}>
              P/L <strong>{data.packing_lists.length}</strong>
            </span>
          </>
        ) : (
          <span className={styles.overviewChip}>
            Docs <strong>{data.shipping_instructions.length + data.invoices.length + data.packing_lists.length}</strong>
            <span className={styles.overviewChipHint}> managed by Document team</span>
          </span>
        )}
      </div>
    </div>
  );
}

function SectionJumpNav({
  onJump,
  onJumpAnchor,
  infoSidebarOpen,
  onToggleInfoSidebar,
  infoSidebarCollapsedLabel = "Summary",
  canViewDocs = true,
  showVoyageNav = false,
  showDocComplianceNav = false,
  dirtySections = {},
}: {
  onJump: (key: ExportDetailSectionKey) => void;
  onJumpAnchor: (anchorId: string, sectionKey?: keyof OpenSectionsState) => void;
  infoSidebarOpen: boolean;
  onToggleInfoSidebar: () => void;
  infoSidebarCollapsedLabel?: string;
  canViewDocs?: boolean;
  showVoyageNav?: boolean;
  showDocComplianceNav?: boolean;
  dirtySections?: Record<string, boolean>;
}) {
  const jumpBtnClass = (dirty?: boolean) =>
    `${styles.jumpNavBtn}${dirty ? ` ${styles.jumpNavBtnDirty}` : ""}`;

  return (
    <div className={styles.jumpNavWrap}>
      <nav className={styles.jumpNav} aria-label="Jump to section">
        {EXPORT_DETAIL_NAV_OPS.map(({ key, short, full }) => (
          <button
            key={key}
            type="button"
            className={jumpBtnClass(dirtySections[key])}
            title={dirtySections[key] ? `${full} — unsaved changes` : full}
            onClick={() => onJump(key)}
          >
            {short}
          </button>
        ))}
        {showVoyageNav && (
          <>
            <span className={styles.jumpNavDivider} aria-hidden />
            {EXPORT_VOYAGE_SECTION_ANCHORS.map(({ anchor, short, full }) => (
              <button
                key={anchor}
                type="button"
                className={jumpBtnClass(
                  (anchor === "export-section-loading" && dirtySections.loading) ||
                    (anchor === "export-section-case-off" && dirtySections.caseOff),
                )}
                title={
                  (anchor === "export-section-loading" && dirtySections.loading) ||
                  (anchor === "export-section-case-off" && dirtySections.caseOff)
                    ? `${full} — unsaved changes`
                    : full
                }
                onClick={() => onJumpAnchor(anchor)}
              >
                {short}
              </button>
            ))}
          </>
        )}
        {canViewDocs && (
          <>
            <span className={styles.jumpNavDivider} aria-hidden />
            {EXPORT_DETAIL_NAV_DOCS.map(({ key, short, full }) => (
              <button
                key={key}
                type="button"
                className={jumpBtnClass(dirtySections[key] || dirtySections.siReceiveDate && key === "si")}
                title={dirtySections[key] || (dirtySections.siReceiveDate && key === "si") ? `${full} — unsaved changes` : full}
                onClick={() => onJump(key)}
              >
                {short}
              </button>
            ))}
            {showDocComplianceNav &&
              EXPORT_DOC_SECTION_ANCHORS.map(({ key, anchor, short, full }) => (
                <button
                  key={anchor}
                  type="button"
                  className={jumpBtnClass(dirtySections[key])}
                  title={dirtySections[key] ? `${full} — unsaved changes` : full}
                  onClick={() => onJumpAnchor(anchor, key)}
                >
                  {short}
                </button>
              ))}
          </>
        )}
      </nav>
      <div className={styles.jumpNavTools}>
        <DetailInfoPanelToggle
          open={infoSidebarOpen}
          onToggle={onToggleInfoSidebar}
          panelId="export-bulking-detail-info-panel"
          collapsedLabel={infoSidebarCollapsedLabel}
        />
      </div>
    </div>
  );
}

function invoiceNavTabLabel(inv: Invoice): string {
  const num = inv.invoice_no?.trim();
  return num ? `Invoice #${num}` : "Invoice (Draft)";
}

function packingListNavTabLabel(pl: PackingList): string {
  const num = pl.packing_list_number?.trim();
  return num ? `PL #${num}` : "PL (Draft)";
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
  const [activeInvoiceId, setActiveInvoiceId] = useState(() => data.invoices[0]?.id ?? "");
  const [dirtyTabIds, setDirtyTabIds] = useState<Set<string>>(() => new Set());
  const [deleteTarget, setDeleteTarget] = useState<DocDeleteTarget>(null);
  const [deleting, setDeleting] = useState(false);

  const invoices = data.invoices;

  useEffect(() => {
    if (!invoices.length) {
      setActiveInvoiceId("");
      return;
    }
    if (!invoices.some((inv) => inv.id === activeInvoiceId)) {
      setActiveInvoiceId(invoices[invoices.length - 1]?.id ?? "");
    }
  }, [invoices, activeInvoiceId]);

  const handleCardDirty = useCallback(
    (id: string, dirty: boolean) => {
      setCardDirty(id, dirty);
      setDirtyTabIds((prev) => {
        const next = new Set(prev);
        if (dirty) next.add(id);
        else next.delete(id);
        return next;
      });
    },
    [setCardDirty],
  );

  const handleCreate = async (shippingInstructionId?: string) => {
    setCreating(true);
    const body = shippingInstructionId ? { shipping_instruction_id: shippingInstructionId } : {};
    const res = await createInvoice(data.id, body, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else {
      toast.pushToast("Invoice created", "success");
      if (res.data?.id) setActiveInvoiceId(res.data.id);
      onSaved({ refetch: "silent" });
    }
    setCreating(false);
  };

  const noSiAndNoInvoices = data.shipping_instructions.length === 0 && invoices.length === 0;

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await deleteInvoice(data.id, deleteTarget.id, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else {
      toast.pushToast("Invoice deleted", "success");
      setDirtyTabIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget.id);
        return next;
      });
      onSaved({ refetch: "silent" });
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

  return (
    <SectionShell
      title="Invoices"
      titleIcon={<Receipt size={18} strokeWidth={2} />}
      anchorId="export-section-invoices"
      open={open}
      onToggle={onToggle}
    >
      {noSiAndNoInvoices ? (
        <p className={styles.emptyMsg}>Add a shipping instruction first, then create invoices under it.</p>
      ) : (
        <div className={styles.siShell}>
          <nav className={styles.siSidebar} aria-label="Invoices">
            <ul className={styles.siNavList} role="tablist">
              {invoices.map((inv) => (
                <DocSidebarNavItem
                  key={inv.id}
                  tabId={`invoice-tab-${inv.id}`}
                  panelId={`invoice-panel-${inv.id}`}
                  label={invoiceNavTabLabel(inv)}
                  status={inv.status?.trim() || "Draft"}
                  isActive={inv.id === activeInvoiceId}
                  isDirty={dirtyTabIds.has(inv.id)}
                  onSelect={() => setActiveInvoiceId(inv.id)}
                  onDelete={() => setDeleteTarget({ id: inv.id, label: invoiceNavTabLabel(inv) })}
                  showDelete={(inv.status ?? "DRAFT") !== "FINAL"}
                />
              ))}
            </ul>
            <div className={styles.siSidebarAdd}>
              <button
                type="button"
                className={styles.siSidebarAddBtn}
                onClick={() => void handleCreate()}
                disabled={creating}
              >
                {creating ? "Creating…" : "+ Add Invoice"}
              </button>
            </div>
          </nav>
          <div className={styles.siWorkspace}>
            {invoices.length === 0 ? (
              <div className={styles.siWorkspaceEmpty}>
                <p className={styles.emptyMsg}>No invoices yet. Use &ldquo;+ Add Invoice&rdquo; in the sidebar.</p>
              </div>
            ) : (
              invoices.map((inv) => (
                <div
                  key={inv.id}
                  id={`invoice-panel-${inv.id}`}
                  role="tabpanel"
                  aria-labelledby={`invoice-tab-${inv.id}`}
                  className={inv.id === activeInvoiceId ? styles.siWorkspacePane : styles.siWorkspacePaneHidden}
                  hidden={inv.id !== activeInvoiceId}
                >
                  <InvoiceFormWorkspace
                    invoice={inv}
                    shipmentId={data.id}
                    shipment={data}
                    shippingInstructions={data.shipping_instructions}
                    accessToken={accessToken}
                    onSaved={onSaved}
                    toast={toast}
                    saveTrigger={saveTrigger}
                    onDirtyChange={(dirty) => handleCardDirty(inv.id, dirty)}
                    registerSave={(fn) => registerSave(inv.id, fn)}
                    onCreateLinkedInvoice={
                      inv.shipping_instruction_id?.trim()
                        ? () => void handleCreate(inv.shipping_instruction_id!.trim())
                        : undefined
                    }
                    creatingLinked={creating}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <DocDeleteConfirmModal
        open={deleteTarget != null}
        entityName="invoice"
        label={deleteTarget?.label ?? ""}
        deleting={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </SectionShell>
  );
}

function InvoiceFormWorkspace({
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
  onCreateLinkedInvoice,
  creatingLinked = false,
}: {
  invoice: Invoice;
  shipmentId: string;
  shipment: ExportBulkingShipmentDetail;
  shippingInstructions: ShippingInstruction[];
  accessToken: string;
  onSaved: OnSavedFn;
  toast: ReturnType<typeof useToast>;
  saveTrigger?: number;
  onDirtyChange?: (dirty: boolean) => void;
  registerSave?: (fn: () => Promise<void>) => void;
  onCreateLinkedInvoice?: () => void;
  creatingLinked?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);
  const [showFinalize, setShowFinalize] = useState(false);
  const [showAmend, setShowAmend] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [amending, setAmending] = useState(false);

  const isReadOnly = (invoice.status ?? "DRAFT") === "FINAL";
  const [qtyChangeReason, setQtyChangeReason] = useState("");
  const [pendingQtyChanges, setPendingQtyChanges] = useState<
    Array<{ lineIdx: number; cargo: string; oldQty: string; newQty: string }>
  >([]);
  const [showQtyReasonPrompt, setShowQtyReasonPrompt] = useState(false);

  const [form, setForm] = useState({
    invoice_no: invoice.invoice_no ?? "",
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
    () => invoiceDraftsToDisplayLines(lineDrafts, invoice.id, shipment, invoice.lines, selectedShippingInstruction),
    [lineDrafts, invoice.id, shipment, invoice.lines, selectedShippingInstruction],
  );

  useEffect(() => {
    setForm({
      invoice_no: invoice.invoice_no ?? "",
      shipping_instruction_id: invoice.shipping_instruction_id ?? "",
      invoice_date: toLocalDate(invoice.invoice_date),
      messrs: invoice.messrs ?? "",
      marks: invoice.marks ?? "",
    });
    setLineDrafts(invoiceLineDraftsFromInvoiceOrSi(invoice, shippingInstructions, shipment));
  }, [invoice, shippingInstructions, shipment]);

  const invoiceNumberError = useMemo(
    () => duplicateDocNumberMessage("invoice", form.invoice_no, shipment, invoice.id),
    [form.invoice_no, shipment, invoice.id],
  );

  useEffect(() => {
    if (invoice.lines.length > 0) return;
    const si = shippingInstructions.find((s) => s.id === form.shipping_instruction_id.trim());
    if (si?.lines?.length) {
      setLineDrafts(buildDraftsFromSiForInvoice(si, shipment, invoice.id));
    } else {
      setLineDrafts([]);
    }
  }, [form.shipping_instruction_id, invoice.lines.length, invoice.id, shippingInstructions, shipment]);

  const baselineDraftsFromSi = useMemo(() => {
    if (invoice.lines.length > 0 || !selectedShippingInstruction?.lines.length) return null;
    return buildDraftsFromSiForInvoice(selectedShippingInstruction, shipment, invoice.id);
  }, [invoice.lines.length, invoice.id, selectedShippingInstruction, shipment]);

  const headerDirty = useMemo(() => {
    const si = invoice.shipping_instruction_id ?? "";
    return (
      form.invoice_no !== (invoice.invoice_no ?? "") ||
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
          !numbersCloseForInvoice(resolveInvoiceLineQuantity(d, selectedShippingInstruction), line.quantity) ||
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
        !numbersCloseForInvoice(resolveInvoiceLineQuantity(d, selectedShippingInstruction), resolveInvoiceLineQuantity(b, selectedShippingInstruction)) ||
        (d.unit_price.trim() || "") !== (b.unit_price.trim() || "")
      );
    });
  }, [invoice.lines, lineDrafts, baselineDraftsFromSi]);

  const needsLinePersist = invoice.lines.length === 0 && lineDrafts.length > 0;

  const invoiceDirty = headerDirty || linesDirty || needsLinePersist;

  const invoiceQtySummary = useMemo(() => {
    if (!selectedShippingInstruction) return null;
    const overrideLineQtys = lineDrafts.map((d) => resolveInvoiceLineQuantity(d, selectedShippingInstruction));
    return siInvoiceSummary(selectedShippingInstruction, shipment.invoices, invoice.id, overrideLineQtys);
  }, [selectedShippingInstruction, lineDrafts, shipment.invoices, invoice.id]);

  const invoiceAllocation = useMemo(() => {
    if (!selectedShippingInstruction) return null;
    const overrideLineQtys = lineDrafts.map((d) => resolveInvoiceLineQuantity(d, selectedShippingInstruction));
    return siInvoiceAllocationOk(
      selectedShippingInstruction,
      shipment.invoices,
      invoice.id,
      overrideLineQtys,
    );
  }, [selectedShippingInstruction, lineDrafts, shipment.invoices, invoice.id]);

  const canFinalize = useMemo(() => {
    if (isReadOnly) return false;
    if (!form.invoice_no.trim()) return false;
    if (lineDrafts.length === 0) return false;
    if (selectedShippingInstruction && invoiceQtySummary && !invoiceQtySummary.matched) return false;
    return !invoiceDirty;
  }, [isReadOnly, form.invoice_no, lineDrafts.length, selectedShippingInstruction, invoiceQtySummary, invoiceDirty]);

  const previewInvoice = useMemo(
    () => buildInvoicePreviewFromDraft(invoice, form, lineDrafts, shipment, shippingInstructions),
    [invoice, form, lineDrafts, shipment, shippingInstructions],
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
      const remaining =
        selectedShippingInstruction != null
          ? remainingSiQtyForInvoice(selectedShippingInstruction, shipment.invoices, invoice.id, prev)
          : null;
      return [...prev, newInvoiceLineDraft(shipment, selectedShippingInstruction, usedIds, remaining)];
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

  const doSave = async (changeNote?: string) => {
    setSaving(true);
    const vv = vesselVoyageFromGeneral(shipment).trim() || null;
    const lp = shipment.loadport_name?.trim() || null;
    const dest = destinationSummaryFromCargo(shipment.cargo_lines).trim() || null;
    const body: Record<string, unknown> = {
      ...form,
      invoice_no: form.invoice_no.trim() || null,
      invoice_date: form.invoice_date || null,
      shipping_instruction_id: form.shipping_instruction_id.trim() === "" ? null : form.shipping_instruction_id,
      vessel_voyage_snapshot: vv,
      loadport_snapshot: lp,
      destination_snapshot: dest,
    };
    if (lineDrafts.length > 0) {
      body.lines = buildInvoiceLinesPayload(lineDrafts, selectedShippingInstruction, shipment);
    }
    if (changeNote) body.qty_change_reason = changeNote;
    const res = await updateInvoice(shipmentId, invoice.id, body, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else {
      toast.pushToast("Invoice saved", "success");
      onSaved({
        invoices: replaceNestedItem(shipment.invoices, res.data),
        refetch: "none",
      });
    }
    setSaving(false);
  };

  const handleSave = async () => {
    if (isReadOnly) return;
    if (invoiceNumberError) {
      toast.pushToast(invoiceNumberError, "error");
      return;
    }
    if (selectedShippingInstruction && invoiceAllocation && !invoiceAllocation.ok) {
      toast.pushToast(invoiceAllocation.message ?? "Invoice quantity exceeds shipping instruction total", "error");
      return;
    }

    // Detect qty changes on saved lines and prompt for a reason before persisting.
    if (invoice.lines.length > 0) {
      const changes: typeof pendingQtyChanges = [];
      lineDrafts.forEach((draft, idx) => {
        const saved = invoice.lines[idx];
        if (!saved) return;
        const newQtyNum = resolveInvoiceLineQuantity(draft, selectedShippingInstruction);
        const oldQty = saved.quantity;
        if (
          oldQty != null &&
          newQtyNum != null &&
          Math.abs(newQtyNum - oldQty) > 0.0001
        ) {
          const cargo = shipment.cargo_lines.find((c) => c.id === (draft.cargo_line_id ?? ""));
          changes.push({
            lineIdx: idx + 1,
            cargo: cargo?.cargo_name ?? `Line ${idx + 1}`,
            oldQty: formatNumericDisplay(oldQty),
            newQty: formatNumericDisplay(newQtyNum),
          });
        }
      });
      if (changes.length > 0) {
        setPendingQtyChanges(changes);
        setQtyChangeReason("");
        setShowQtyReasonPrompt(true);
        return;
      }
    }

    await doSave();
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

  const handleFinalize = async (note: string) => {
    if (invoiceDirty) {
      await doSave();
    }
    setFinalizing(true);
    const res = await finalizeInvoice(shipmentId, invoice.id, { note: note || undefined }, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else {
      toast.pushToast("Invoice finalized", "success");
      onSaved({
        invoices: replaceNestedItem(shipment.invoices, res.data),
        refetch: "none",
      });
      setShowFinalize(false);
    }
    setFinalizing(false);
  };

  const handleAmend = async (reason: string) => {
    setAmending(true);
    const res = await amendInvoice(shipmentId, invoice.id, { reason }, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else {
      toast.pushToast("Invoice reopened for editing", "success");
      onSaved({
        invoices: replaceNestedItem(shipment.invoices, res.data),
        refetch: "none",
      });
      setShowAmend(false);
    }
    setAmending(false);
  };

  return (
    <>
      <div className={`${styles.siWorkspaceScroll} ${isReadOnly ? styles.readOnlyRegion : ""}`}>
        <div className={`${styles.fieldGrid} ${styles.fieldGridSi}`}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Invoice No</label>
            <input
              className={`${styles.fieldInput} ${invoiceNumberError ? styles.fieldInputInvalid : ""}`}
              value={form.invoice_no}
              onChange={set("invoice_no")}
              readOnly={isReadOnly}
              disabled={isReadOnly}
              aria-invalid={Boolean(invoiceNumberError)}
              aria-describedby={invoiceNumberError ? `invoice-no-error-${invoice.id}` : undefined}
            />
            {invoiceNumberError ? (
              <span id={`invoice-no-error-${invoice.id}`} className={styles.fieldError} role="alert">
                {invoiceNumberError}
              </span>
            ) : (
              <span className={styles.fieldMuted}>Must be unique across all shipments.</span>
            )}
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Shipping instruction</label>
            <select
              className={styles.fieldInput}
              value={form.shipping_instruction_id}
              onChange={set("shipping_instruction_id")}
              aria-label="Shipping instruction"
              disabled={isReadOnly}
            >
              <option value="">— None —</option>
              {shippingInstructions.map((si) => (
                <option key={si.id} value={si.id}>
                  {shippingInstructionDisplayLabel(si)}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Invoice Date</label>
            <input
              className={styles.fieldInput}
              type="date"
              value={form.invoice_date}
              onChange={set("invoice_date")}
              readOnly={isReadOnly}
              disabled={isReadOnly}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Marks</label>
            <input
              className={styles.fieldInput}
              value={form.marks}
              onChange={set("marks")}
              readOnly={isReadOnly}
              disabled={isReadOnly}
            />
          </div>
          <div className={`${styles.field} ${styles.fieldSiFull}`}>
            <label className={styles.fieldLabel}>Messrs</label>
            <textarea
              className={`${styles.fieldInput} ${styles.textareaInput} ${styles.textareaCompact}`}
              value={form.messrs}
              onChange={set("messrs")}
              rows={3}
              aria-label="Messrs"
              readOnly={isReadOnly}
              disabled={isReadOnly}
            />
          </div>
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
          <div className={`${styles.field} ${styles.fieldSiFull}`}>
            <label className={styles.fieldLabel}>Destination</label>
            <input
              className={`${styles.fieldInput} ${styles.fieldInputReadonly}`}
              readOnly
              value={destinationDisplay}
              title="From destination port / country on Cargo Lines"
            />
          </div>
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
                No invoice lines yet. Use <strong>+ Add line</strong> below, or add cargo lines on the linked shipping instruction
                first.
              </p>
            ) : (
              lineDrafts.map((d, idx) => {
                  const line = displayLines[idx];
                  if (!line) return null;
                  const effCargoId = (d.cargo_line_id ?? "").trim() || null;
                  const lineForUnit: InvoiceLine = { ...line, cargo_line_id: effCargoId };
                  const linkedCargo = effCargoId ? shipment.cargo_lines.find((c) => c.id === effCargoId) : undefined;
                  const siLineQty =
                    selectedShippingInstruction && effCargoId
                      ? siQtyForCargoLine(selectedShippingInstruction, effCargoId)
                      : null;
                  const qtyDisplay = d?.quantity ?? "";
                  const qtyTitle =
                    siLineQty != null
                      ? `Shipping instruction line qty: ${formatNumericDisplay(siLineQty)}`
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
                                const siQty =
                                  selectedShippingInstruction && cid
                                    ? siQtyForCargoLine(selectedShippingInstruction, cid)
                                    : null;
                                updateLineDraft(idx, {
                                  cargo_line_id: cid,
                                  quantity: formatQuantityFieldValue(siQty ?? cargo?.quantity),
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
                            Qty (MT)
                          </label>
                          <input
                            className={styles.fieldInput}
                            type="text"
                            inputMode="decimal"
                            value={qtyDisplay}
                            onChange={(e) => updateLineDraft(idx, { quantity: e.target.value })}
                            aria-label={`Quantity, invoice line ${idx + 1}`}
                            title={qtyTitle}
                            readOnly={isReadOnly}
                            disabled={isReadOnly}
                          />
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
                            readOnly={isReadOnly}
                            disabled={isReadOnly}
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
                        {!isReadOnly && (
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
                        )}
                      </div>
                    </div>
                  );
                })
            )}
            <div className={styles.siCargoMetaBar}>
              {invoiceQtySummary && (
                <span
                  className={`${styles.siCargoMetaBadge} ${!invoiceQtySummary.matched ? styles.siCargoMetaBadgeWarn : ""}`}
                  role="status"
                >
                  <strong>SI allocation:</strong>{" "}
                  {formatNumericDisplay(invoiceQtySummary.invoiced)} / {formatNumericDisplay(invoiceQtySummary.siTotal)} MT
                  {!invoiceQtySummary.matched && (
                    <> · {formatNumericDisplay(invoiceQtySummary.remaining)} MT remaining</>
                  )}
                </span>
              )}
              {selectedShippingInstruction && (
                <span className={styles.siCargoMetaBadge}>
                  <strong>Linked SI:</strong> {shippingInstructionDisplayLabel(selectedShippingInstruction)}
                </span>
              )}
              {!isReadOnly && (
                <button
                  type="button"
                  className={`${styles.btnSecondary} ${styles.siCargoAddBtn}`}
                  onClick={addInvoiceLine}
                  disabled={shipment.cargo_lines.length === 0}
                >
                  + Add line
                </button>
              )}
              {shipment.cargo_lines.length === 0 && (
                <span className={styles.siCargoMetaHint}>Add cargo in section C first.</span>
              )}
              {!isReadOnly && onCreateLinkedInvoice && (
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={onCreateLinkedInvoice}
                  disabled={creatingLinked}
                >
                  {creatingLinked ? "Creating…" : "+ Add invoice for this SI"}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className={styles.siWorkspaceFooter}>
        <div className={`${styles.siDocumentPreviewActions} ${styles.siWorkspaceFooterPreview}`}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => setShowDocumentPreview(true)}
            disabled={lineDrafts.length === 0}
          >
            Preview invoice
          </button>
          <span className={styles.fieldMuted}>Printable commercial invoice.</span>
        </div>
        <div className={styles.actions}>
          {!isReadOnly && (
            <button className={styles.btnPrimary} onClick={handleSave} disabled={saving || !invoiceDirty || Boolean(invoiceNumberError)}>
              {saving ? "Saving…" : "Save draft"}
            </button>
          )}
          {!isReadOnly && (
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => setShowFinalize(true)}
              disabled={!canFinalize || finalizing}
              title={
                selectedShippingInstruction && invoiceQtySummary && !invoiceQtySummary.matched
                  ? "Shipping instruction must be fully allocated across all invoices before finalizing"
                  : invoiceDirty
                    ? "Save draft first"
                    : undefined
              }
            >
              Finalize…
            </button>
          )}
          {isReadOnly && (
            <>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowDiff(true)}>
                Draft → final changes
              </button>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowAudit(true)}>
                Audit trail
              </button>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowAmend(true)}>
                Amend…
              </button>
            </>
          )}
          {!isReadOnly && (
            <button type="button" className={styles.btnSecondary} onClick={() => setShowAudit(true)}>
              History
            </button>
          )}
        </div>
      </div>

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

      <InvoiceFinalizeModal
        open={showFinalize}
        shipmentId={shipmentId}
        invoice={{ ...invoice, ...form, lines: previewInvoice.lines }}
        accessToken={accessToken}
        onClose={() => setShowFinalize(false)}
        onConfirm={(note) => void handleFinalize(note)}
        busy={finalizing}
      />
      <InvoiceAmendPrompt
        open={showAmend}
        onClose={() => setShowAmend(false)}
        onConfirm={(reason) => void handleAmend(reason)}
        busy={amending}
      />
      <InvoiceDiffModal
        open={showDiff}
        shipmentId={shipmentId}
        invoiceId={invoice.id}
        accessToken={accessToken}
        title="Draft → final changes"
        onClose={() => setShowDiff(false)}
      />
      <InvoiceAuditModal
        open={showAudit}
        shipmentId={shipmentId}
        invoiceId={invoice.id}
        accessToken={accessToken}
        onClose={() => setShowAudit(false)}
      />

      {/* Qty change audit trail — reason prompt before saving */}
      {showQtyReasonPrompt && (
        <div className={styles.qtyAuditOverlay} role="dialog" aria-modal="true" aria-label="Quantity change reason">
          <div className={styles.qtyAuditPanel}>
            <h4 className={styles.qtyAuditTitle}>Quantity changed — reason required</h4>
            <p className={styles.qtyAuditHint}>
              The following invoice line quantities were modified from their saved values. Please
              select a reason so the change is recorded in the audit trail.
            </p>
            <ul className={styles.qtyAuditList}>
              {pendingQtyChanges.map((c) => (
                <li key={c.lineIdx} className={styles.qtyAuditItem}>
                  <span className={styles.qtyAuditCargo}>{c.cargo}</span>
                  <span className={styles.qtyAuditChange}>
                    {c.oldQty} MT → <strong>{c.newQty} MT</strong>
                  </span>
                </li>
              ))}
            </ul>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor={`qty-reason-${invoice.id}`}>
                Reason for change <span aria-hidden className={styles.required}>*</span>
              </label>
              <select
                id={`qty-reason-${invoice.id}`}
                className={styles.fieldInput}
                value={qtyChangeReason}
                onChange={(e) => setQtyChangeReason(e.target.value)}
              >
                <option value="">— Select reason —</option>
                <option value="Loading variance">Loading variance</option>
                <option value="Surveyor adjustment">Surveyor adjustment</option>
                <option value="BL split">BL split adjustment</option>
                <option value="Correction">Correction (data entry error)</option>
                <option value="Final reconciliation">Final reconciliation</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className={styles.qtyAuditActions}>
              <button
                className={styles.btnSecondary}
                onClick={() => {
                  setShowQtyReasonPrompt(false);
                  setPendingQtyChanges([]);
                }}
              >
                Cancel
              </button>
              <button
                className={styles.btnPrimary}
                disabled={!qtyChangeReason || saving}
                onClick={async () => {
                  setShowQtyReasonPrompt(false);
                  await doSave(qtyChangeReason);
                  setPendingQtyChanges([]);
                  setQtyChangeReason("");
                }}
              >
                {saving ? "Saving…" : "Confirm & save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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
  const [activePlId, setActivePlId] = useState(() => data.packing_lists[0]?.id ?? "");
  const [dirtyTabIds, setDirtyTabIds] = useState<Set<string>>(() => new Set());
  const [deleteTarget, setDeleteTarget] = useState<DocDeleteTarget>(null);
  const [deleting, setDeleting] = useState(false);

  const packingLists = data.packing_lists;

  const usedSiIds = useMemo(
    () => siIdsUsedInOtherPackingLists(packingLists, ""),
    [packingLists],
  );
  const maxPackingLists = data.shipping_instructions.length;
  const canAddPackingList = maxPackingLists > 0 && packingLists.length < maxPackingLists;

  useEffect(() => {
    if (!packingLists.length) {
      setActivePlId("");
      return;
    }
    if (!packingLists.some((pl) => pl.id === activePlId)) {
      setActivePlId(packingLists[packingLists.length - 1]?.id ?? "");
    }
  }, [packingLists, activePlId]);

  const handleCardDirty = useCallback(
    (id: string, dirty: boolean) => {
      setCardDirty(id, dirty);
      setDirtyTabIds((prev) => {
        const next = new Set(prev);
        if (dirty) next.add(id);
        else next.delete(id);
        return next;
      });
    },
    [setCardDirty],
  );

  const handleCreate = async () => {
    if (maxPackingLists === 0) {
      toast.pushToast("Add a shipping instruction first", "error");
      return;
    }
    if (!canAddPackingList) {
      toast.pushToast("Maximum packing lists reached (one per shipping instruction)", "error");
      return;
    }
    setCreating(true);
    const nextSi = data.shipping_instructions.find((s) => !usedSiIds.has(s.id));
    const body: Record<string, unknown> = {
      loadport_snapshot: data.loadport_name?.trim() ?? null,
      shipping_instruction_id: nextSi?.id ?? null,
    };
    const res = await createPackingList(data.id, body, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else {
      toast.pushToast("Packing list created", "success");
      if (res.data?.id) setActivePlId(res.data.id);
      onSaved({ refetch: "silent" });
    }
    setCreating(false);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await deletePackingList(data.id, deleteTarget.id, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else {
      toast.pushToast("Packing list deleted", "success");
      setDirtyTabIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget.id);
        return next;
      });
      onSaved({ refetch: "silent" });
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

  const showPackingShell = maxPackingLists > 0 || packingLists.length > 0;

  return (
    <SectionShell
      title="Packing Lists"
      titleIcon={<Box size={18} strokeWidth={2} />}
      anchorId="export-section-packing"
      open={open}
      onToggle={onToggle}
    >
      {!showPackingShell ? (
        <p className={styles.emptyMsg}>
          No packing lists. Add a shipping instruction first — then one packing list per shipping instruction.
        </p>
      ) : (
        <div className={styles.siShell}>
          <nav className={styles.siSidebar} aria-label="Packing lists">
            <ul className={styles.siNavList} role="tablist">
              {packingLists.map((pl) => (
                <DocSidebarNavItem
                  key={pl.id}
                  tabId={`pl-tab-${pl.id}`}
                  panelId={`pl-panel-${pl.id}`}
                  label={packingListNavTabLabel(pl)}
                  status={pl.status?.trim() || "Draft"}
                  isActive={pl.id === activePlId}
                  isDirty={dirtyTabIds.has(pl.id)}
                  onSelect={() => setActivePlId(pl.id)}
                  onDelete={() => setDeleteTarget({ id: pl.id, label: packingListNavTabLabel(pl) })}
                />
              ))}
            </ul>
            <div className={styles.siSidebarAdd}>
              <button
                type="button"
                className={styles.siSidebarAddBtn}
                onClick={handleCreate}
                disabled={creating || !canAddPackingList}
                title={
                  maxPackingLists === 0
                    ? "Add a shipping instruction first"
                    : !canAddPackingList
                      ? `All ${maxPackingLists} shipping instructions already have a packing list`
                      : `${packingLists.length} of ${maxPackingLists} packing lists`
                }
              >
                {creating ? "Creating…" : "+ Add Packing List"}
              </button>
            </div>
          </nav>
          <div className={styles.siWorkspace}>
            {packingLists.length === 0 ? (
              <div className={styles.siWorkspaceEmpty}>
                <p className={styles.emptyMsg}>No packing lists yet. Use &ldquo;+ Add Packing List&rdquo; in the sidebar.</p>
                {maxPackingLists > 0 && (
                  <p className={styles.fieldMuted}>
                    Up to {maxPackingLists} packing list{maxPackingLists === 1 ? "" : "s"} — one per shipping instruction.
                  </p>
                )}
              </div>
            ) : (
              packingLists.map((pl) => (
                <div
                  key={pl.id}
                  id={`pl-panel-${pl.id}`}
                  role="tabpanel"
                  aria-labelledby={`pl-tab-${pl.id}`}
                  className={pl.id === activePlId ? styles.siWorkspacePane : styles.siWorkspacePaneHidden}
                  hidden={pl.id !== activePlId}
                >
                  <PackingListFormWorkspace
                    packingList={pl}
                    allPackingLists={packingLists}
                    shippingInstructions={data.shipping_instructions}
                    shipmentId={data.id}
                    shipment={data}
                    cargoLines={data.cargo_lines}
                    accessToken={accessToken}
                    onSaved={onSaved}
                    toast={toast}
                    saveTrigger={saveTrigger}
                    onDirtyChange={(dirty) => handleCardDirty(pl.id, dirty)}
                    registerSave={(fn) => registerSave(pl.id, fn)}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <DocDeleteConfirmModal
        open={deleteTarget != null}
        entityName="packing list"
        label={deleteTarget?.label ?? ""}
        deleting={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </SectionShell>
  );
}

function PackingListFormWorkspace({
  packingList,
  allPackingLists,
  shippingInstructions,
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
  shippingInstructions: ShippingInstruction[];
  shipmentId: string;
  shipment: ExportBulkingShipmentDetail;
  cargoLines: CargoLine[];
  accessToken: string;
  onSaved: OnSavedFn;
  toast: ReturnType<typeof useToast>;
  saveTrigger?: number;
  onDirtyChange?: (dirty: boolean) => void;
  registerSave?: (fn: () => Promise<void>) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);

  const [siId, setSiId] = useState(packingList.shipping_instruction_id ?? "");
  const [plNumber, setPlNumber] = useState(packingList.packing_list_number ?? "");

  const otherUsedSiIds = useMemo(
    () => siIdsUsedInOtherPackingLists(allPackingLists, packingList.id),
    [allPackingLists, packingList.id],
  );

  const linkedSi = useMemo(() => {
    const id = siId.trim();
    return id ? shippingInstructions.find((s) => s.id === id) : undefined;
  }, [siId, shippingInstructions]);

  const [lineDrafts, setLineDrafts] = useState<PackingListLineDraft[]>(() =>
    packingListLineDraftsFromPl(packingList, shippingInstructions),
  );

  useEffect(() => {
    setSiId(packingList.shipping_instruction_id ?? "");
    setPlNumber(packingList.packing_list_number ?? "");
    setLineDrafts(packingListLineDraftsFromPl(packingList, shippingInstructions));
  }, [packingList, shippingInstructions]);

  const plNumberError = useMemo(
    () => duplicateDocNumberMessage("packing_list", plNumber, shipment, packingList.id),
    [plNumber, shipment, packingList.id],
  );

  useEffect(() => {
    if (!linkedSi?.lines?.length) return;
    setLineDrafts((prev) => {
      const fromSi = packingListLineDraftsFromSi(linkedSi, packingList.lines);
      return fromSi.map((row) => {
        const kept = prev.find((p) => p.cargo_line_id === row.cargo_line_id);
        return kept ? { ...row, packing: kept.packing } : row;
      });
    });
  }, [linkedSi, packingList.lines]);

  const loadPortDisplay = shipment.loadport_name?.trim() || "—";
  const siHeaderLabel = linkedSi?.si_number?.trim() || null;

  const headerDirty =
    (packingList.shipping_instruction_id ?? "") !== siId.trim() ||
    (packingList.packing_list_number ?? "") !== plNumber;

  const linesDirty = useMemo(() => {
    const base = packingListLineDraftsFromPl(packingList, shippingInstructions);
    if (lineDrafts.length !== base.length) return true;
    return lineDrafts.some((d, i) => (d.packing ?? "").trim() !== (base[i]?.packing ?? "").trim());
  }, [packingList, shippingInstructions, lineDrafts]);

  const plDirty = headerDirty || linesDirty || (Boolean(siId.trim()) && packingList.lines.length === 0);

  const previewPackingList = useMemo(
    () => buildPackingListPreviewFromDraft(packingList, lineDrafts, shipment, cargoLines, linkedSi),
    [packingList, lineDrafts, shipment, cargoLines, linkedSi],
  );

  const canPreviewPackingList = Boolean(siId.trim() && lineDrafts.length > 0);

  const plDirtyRef = useRef(false);
  plDirtyRef.current = plDirty;

  useEffect(() => {
    onDirtyChange?.(plDirty);
  }, [plDirty, onDirtyChange]);

  function updatePlLineDraft(index: number, patch: Partial<PackingListLineDraft>) {
    setLineDrafts((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  const handleSave = async () => {
    if (plNumberError) {
      toast.pushToast(plNumberError, "error");
      return;
    }
    if (!siId.trim()) {
      toast.pushToast("Select a shipping instruction", "error");
      return;
    }
    setSaving(true);
    const body: Record<string, unknown> = {
      loadport_snapshot: shipment.loadport_name?.trim() ?? null,
      packing_list_number: plNumber.trim() || null,
      shipping_instruction_id: siId.trim(),
      lines: buildPackingListLinesPayload(lineDrafts),
    };
    const res = await updatePackingList(shipmentId, packingList.id, body, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else {
      toast.pushToast("Packing list saved", "success");
      onSaved({
        packing_lists: replaceNestedItem(shipment.packing_lists, res.data),
        refetch: "none",
      });
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

  return (
    <>
      <div className={styles.siWorkspaceScroll}>
        {linkedSi && (
          <p className={styles.siWorkspaceCargoHint}>
            <span className={styles.siCargoLinkLabel}>Linked shipping instruction:</span>{" "}
            <span className={styles.siCargoLinkEm}>
              {shippingInstructionDisplayLabel(linkedSi)}
              {siHeaderLabel ? ` (${siHeaderLabel})` : ""}
            </span>
          </p>
        )}
        <div className={`${styles.fieldGrid} ${styles.fieldGridSi}`}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Packing List Number</label>
            <input
              className={`${styles.fieldInput} ${plNumberError ? styles.fieldInputInvalid : ""}`}
              value={plNumber}
              onChange={(e) => setPlNumber(e.target.value)}
              aria-invalid={Boolean(plNumberError)}
              aria-describedby={plNumberError ? `pl-number-error-${packingList.id}` : undefined}
            />
            {plNumberError ? (
              <span id={`pl-number-error-${packingList.id}`} className={styles.fieldError} role="alert">
                {plNumberError}
              </span>
            ) : (
              <span className={styles.fieldMuted}>Must be unique across all shipments.</span>
            )}
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Shipping instruction</label>
            <select
              className={styles.fieldInput}
              value={siId}
              onChange={(e) => setSiId(e.target.value)}
              aria-label="Shipping instruction for packing list"
            >
              <option value="">— Select shipping instruction —</option>
              {shippingInstructions.map((si) => {
                const used = otherUsedSiIds.has(si.id) && si.id !== siId.trim();
                return (
                  <option key={si.id} value={si.id} disabled={used}>
                    {shippingInstructionDisplayLabel(si)}
                    {used ? " (already has PL)" : ""}
                  </option>
                );
              })}
            </select>
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
          {linkedSi && (
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Shipping instruction total qty</label>
              <input
                className={`${styles.fieldInput} ${styles.fieldInputReadonly}`}
                readOnly
                value={`${formatNumericDisplay(siTotalQuantity(linkedSi))} MT`}
                title="Read-only — follows shipping instruction"
              />
            </div>
          )}
        </div>

        <div className={styles.sectionGroupLabel}>Lines (from shipping instruction)</div>
        {!siId.trim() ? (
          <p className={styles.emptyMsg}>Select a shipping instruction above.</p>
        ) : !linkedSi?.lines?.length ? (
          <p className={styles.emptyMsg}>Linked shipping instruction has no cargo lines.</p>
        ) : (
          <>
            <div className={styles.siCargoMetaBar}>
              <span className={styles.siCargoMetaBadge} role="status">
                <strong>Lines:</strong> {lineDrafts.length}
              </span>
              {linkedSi && (
                <span className={styles.siCargoMetaBadge}>
                  <strong>SI total:</strong> {formatNumericDisplay(siTotalQuantity(linkedSi))} MT
                </span>
              )}
            </div>
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
                    <th scope="col">Description of goods</th>
                    <th scope="col">Qty (shipping instruction)</th>
                    <th scope="col">Load port</th>
                    <th scope="col">Destination</th>
                    <th scope="col">Packing</th>
                  </tr>
                </thead>
                <tbody>
                  {lineDrafts.map((draft, idx) => {
                    const saved = packingList.lines.find((l) => l.cargo_line_id === draft.cargo_line_id);
                    const cargo = packingLineResolvedCargo(cargoLines, draft, saved?.cargo_line_id);
                    const qtyShown = packingLineQtyDisplay(linkedSi, draft.cargo_line_id, saved);
                    const destShown = packingLineDestinationDisplay(cargo, saved);
                    return (
                      <tr key={draft.rowKey}>
                        <td>
                          <span className={styles.cargoCellReadonly}>
                            {packingLineDescriptionDisplay(cargo, saved)}
                          </span>
                        </td>
                        <td>
                          <span className={styles.cargoCellReadonly} title="From shipping instruction">
                            {qtyShown}
                          </span>
                        </td>
                        <td>
                          <span className={styles.cargoCellReadonly}>{loadPortDisplay}</span>
                        </td>
                        <td>
                          <span className={styles.cargoCellReadonly}>{destShown}</span>
                        </td>
                        <td>
                          <input
                            className={styles.cargoCellInput}
                            value={draft.packing}
                            onChange={(e) => updatePlLineDraft(idx, { packing: e.target.value })}
                            aria-label={`Packing, line ${idx + 1}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className={styles.siWorkspaceFooter}>
        <div className={`${styles.siDocumentPreviewActions} ${styles.siWorkspaceFooterPreview}`}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => setShowDocumentPreview(true)}
            disabled={!canPreviewPackingList}
          >
            Preview packing list
          </button>
          <span className={styles.fieldMuted}>One packing list per cargo line.</span>
        </div>
        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={handleSave} disabled={saving || !plDirty || Boolean(plNumberError)}>
            {saving ? "Saving…" : "Save Packing List"}
          </button>
        </div>
      </div>

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
    </>
  );
}

// ─── Shipping Instruction receipt date ────────────────────────────────────────

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
    else { toast.pushToast("Shipping instruction receipt date saved", "success"); onSaved({ patch: listItemToDetailPatch(res.data), refetch: "none" }); }
    setSaving(false);
  }, [data.id, form, accessToken, toast, onSaved]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  useEffect(() => {
    if (saveTrigger === 0) return;
    if (isDirtyRef.current) handleSaveRef.current();
  }, [saveTrigger]);

  return (
    <SectionShell
      title="Shipping Instruction Receipt Date"
      titleIcon={<CalendarCheck size={18} strokeWidth={2} />}
      open={open}
      onToggle={onToggle}
      dirty={isDirty}
      anchorId="export-section-si-receive-date"
    >
      <div className={styles.docSectionPanel}>
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
          <button type="button" className={styles.btnPrimary} onClick={() => void handleSave()} disabled={saving || !isDirty}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
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
    else { toast.pushToast(`${title} saved`, "success"); onSaved({ patch: listItemToDetailPatch(res.data), refetch: "none" }); }
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

// ─── Documentation field groups (NPE, B/L, sent docs, PEB, billing) ───────────

type ShipmentPatchForm = Record<string, string>;

function useShipmentPatchSection(
  sectionKey: string,
  props: SectionProps,
  getOrigForm: (data: ExportBulkingShipmentDetail) => ShipmentPatchForm,
  toPatchBody: (form: ShipmentPatchForm) => Record<string, string | number | null>,
  saveSuccessMessage: string,
) {
  const { data, accessToken, onSaved, toast, saveTrigger, onDirtyChange } = props;
  const getOrig = useCallback(() => getOrigForm(data), [data, getOrigForm]);
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
  }, [form, getOrig, onDirtyChange, sectionKey]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const res = await updateExportBulkingShipment(data.id, toPatchBody(form), accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else {
      toast.pushToast(saveSuccessMessage, "success");
      onSaved({ patch: listItemToDetailPatch(res.data), refetch: "none" });
    }
    setSaving(false);
  }, [data.id, form, toPatchBody, accessToken, toast, onSaved, saveSuccessMessage]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  useEffect(() => {
    if (saveTrigger === 0) return;
    if (isDirtyRef.current) handleSaveRef.current();
  }, [saveTrigger]);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return { form, set, setForm, saving, isDirty, handleSave };
}

function DataSapSection(props: SectionProps & { open: boolean; onToggle: () => void }) {
  const sectionKey = "npeSpb";
  const { data, accessToken, onSaved, toast, saveTrigger, onDirtyChange, open, onToggle } = props;

  const getOrigLines = useCallback(
    () => buildSapLineDrafts(data, formatQuantityFieldValue),
    [data],
  );
  const getOrigSpr = useCallback(() => resolveShipmentSpr(data), [data]);

  const [lines, setLines] = useState<SapLineDraft[]>(getOrigLines);
  const [spr, setSpr] = useState(getOrigSpr);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);

  const invoiceSos = useMemo(() => distinctSoNosFromShipment(data), [data]);

  useEffect(() => {
    setLines(getOrigLines());
    setSpr(getOrigSpr());
  }, [getOrigLines, getOrigSpr]);

  useEffect(() => {
    const dirty =
      JSON.stringify(lines) !== JSON.stringify(getOrigLines()) || spr !== getOrigSpr();
    isDirtyRef.current = dirty;
    setIsDirty(dirty);
    onDirtyChange(sectionKey, dirty);
  }, [lines, spr, getOrigLines, getOrigSpr, onDirtyChange]);

  const updateLine = (idx: number, patch: Partial<SapLineDraft>) =>
    setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));

  const handleSave = useCallback(async () => {
    setSaving(true);
    const payload = sapDraftsToUpsertPayload(lines, parseQuantityInput);
    const res = await upsertSapLines(data.id, payload, accessToken, {
      spr: spr.trim() || null,
    });
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else {
      toast.pushToast("Data SAP saved", "success");
      onSaved({
        sap_lines: res.data,
        patch: { spr: spr.trim() || null },
        refetch: "none",
      });
    }
    setSaving(false);
  }, [data.id, lines, spr, accessToken, toast, onSaved]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  useEffect(() => {
    if (saveTrigger === 0) return;
    if (isDirtyRef.current) handleSaveRef.current();
  }, [saveTrigger]);

  return (
    <SectionShell
      title="Data SAP"
      titleIcon={<ClipboardCheck size={18} strokeWidth={2} />}
      open={open}
      onToggle={onToggle}
      dirty={isDirty}
      anchorId="export-section-npe-spb"
    >
      <Card>
        <p className={styles.fieldMuted} style={{ marginTop: 0, marginBottom: 12 }}>
          One row per sales order (SO) from invoice lines. SPR is one value per shipment.
        </p>
        {invoiceSos.length === 0 ? (
          <p className={styles.emptyMsg}>
            No sales orders yet. Enter SO numbers on invoice lines under Pre-shipment Documents.
          </p>
        ) : (
          <>
          <div className={styles.sapTableWrap}>
            <table className={styles.sapTable}>
              <thead>
                <tr>
                  <th scope="col">SO No</th>
                  <th scope="col">Quantity SPB</th>
                  <th scope="col">SPB</th>
                  <th scope="col">Delivery Order PGI</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((row, idx) => (
                  <tr key={row.rowKey}>
                    <td className={styles.sapSoCell}>
                      <span className={styles.sapSoLabel} title={row.so_no}>
                        {row.so_no}
                      </span>
                    </td>
                    <td>
                      <input
                        className={styles.sapInput}
                        type="text"
                        inputMode="decimal"
                        value={row.quantity_spb}
                        onChange={(e) => updateLine(idx, { quantity_spb: e.target.value })}
                        aria-label={`Quantity SPB for SO ${row.so_no}`}
                      />
                    </td>
                    <td>
                      <input
                        className={styles.sapInput}
                        type="text"
                        value={row.spb}
                        onChange={(e) => updateLine(idx, { spb: e.target.value })}
                        aria-label={`SPB for SO ${row.so_no}`}
                      />
                    </td>
                    <td>
                      <input
                        className={styles.sapInput}
                        type="text"
                        value={row.delivery_order_pgi}
                        onChange={(e) => updateLine(idx, { delivery_order_pgi: e.target.value })}
                        aria-label={`Delivery Order PGI for SO ${row.so_no}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.sapSprField}>
            <label className={styles.fieldLabel} htmlFor="data-sap-spr">
              SPR
            </label>
            <input
              id="data-sap-spr"
              className={styles.fieldInput}
              type="text"
              value={spr}
              onChange={(e) => setSpr(e.target.value)}
              aria-label="SPR for this shipment"
            />
            <span className={styles.fieldMuted}>One SPR per shipment — shared across all SOs.</span>
          </div>
          </>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => void handleSave()}
            disabled={saving || !isDirty || invoiceSos.length === 0}
          >
            {saving ? "Saving…" : "Save Data SAP"}
          </button>
        </div>
      </Card>
    </SectionShell>
  );
}

function BillOfLadingSection(props: SectionProps & { open: boolean; onToggle: () => void }) {
  const sectionKey = "billOfLading";
  const { data, accessToken, onSaved, toast, saveTrigger, onDirtyChange, open, onToggle } = props;

  const getOrig = useCallback(() => buildBillOfLadingDrafts(data), [data]);
  const [rows, setRows] = useState<BillOfLadingDraft[]>(getOrig);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);

  useEffect(() => { setRows(getOrig()); }, [getOrig]);
  useEffect(() => {
    const dirty = JSON.stringify(rows) !== JSON.stringify(getOrig());
    isDirtyRef.current = dirty;
    setIsDirty(dirty);
    onDirtyChange(sectionKey, dirty);
  }, [rows, getOrig, onDirtyChange]);

  const updateRow = (idx: number, patch: Partial<BillOfLadingDraft>) =>
    setRows((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        rowKey: `new-bl-${Date.now()}`,
        bill_of_lading_no: "",
        bill_of_lading_date: "",
        bill_of_lading_nn_obl: "",
      },
    ]);
  };

  const removeRow = (idx: number) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    const payload = billOfLadingDraftsToPayload(rows);
    const res = await upsertBillsOfLading(data.id, payload, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else {
      toast.pushToast("Bill of Lading saved — configure required sent documents next", "success");
      const first = res.data[0];
      onSaved({
        bills_of_lading: res.data,
        patch: first
          ? {
              bill_of_lading_no: first.bill_of_lading_no,
              bill_of_lading_date: first.bill_of_lading_date,
              bill_of_lading_nn_obl: first.bill_of_lading_nn_obl,
            }
          : {
              bill_of_lading_no: null,
              bill_of_lading_date: null,
              bill_of_lading_nn_obl: null,
            },
        refetch: "none",
      });
    }
    setSaving(false);
  }, [data.id, rows, accessToken, toast, onSaved]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  useEffect(() => {
    if (saveTrigger === 0) return;
    if (isDirtyRef.current) handleSaveRef.current();
  }, [saveTrigger]);

  return (
    <SectionShell
      title="Bill of Lading"
      titleIcon={<FileSignature size={18} strokeWidth={2} />}
      open={open}
      onToggle={onToggle}
      dirty={isDirty}
      anchorId="export-section-bill-of-lading"
    >
      <Card>
        <p className={styles.fieldMuted} style={{ marginTop: 0, marginBottom: 12 }}>
          Add one or more Bill of Lading records for this shipment.
        </p>
        {rows.map((row, idx) => (
          <div key={row.rowKey} className={styles.pebSiBlock}>
            <div className={styles.pebSiBlockHeader}>
              <strong>Bill of Lading {idx + 1}</strong>
              {rows.length > 1 && (
                <button type="button" className={styles.btnGhostSm} onClick={() => removeRow(idx)}>
                  Remove
                </button>
              )}
            </div>
            <div className={styles.fieldGrid}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Bill of Lading No.</label>
                <input
                  className={styles.fieldInput}
                  type="text"
                  value={row.bill_of_lading_no}
                  onChange={(e) => updateRow(idx, { bill_of_lading_no: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Bill of Lading Date</label>
                <input
                  className={styles.fieldInput}
                  type="date"
                  value={row.bill_of_lading_date}
                  onChange={(e) => updateRow(idx, { bill_of_lading_date: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Bill of Lading NN / OBL</label>
                <select
                  className={styles.fieldInput}
                  value={row.bill_of_lading_nn_obl}
                  onChange={(e) => updateRow(idx, { bill_of_lading_nn_obl: e.target.value })}
                >
                  <option value="">— Select —</option>
                  {BL_NN_OBL_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ))}
        <div className={styles.actions} style={{ marginTop: 8 }}>
          <button type="button" className={styles.btnSecondary} onClick={addRow}>
            + Add Bill of Lading
          </button>
          <button type="button" className={styles.btnPrimary} onClick={() => void handleSave()} disabled={saving || !isDirty}>
            {saving ? "Saving…" : "Save Bill of Lading"}
          </button>
        </div>
      </Card>
    </SectionShell>
  );
}

type SentDocumentsFormState = {
  required: ExportSentDocumentKey[];
  dates: Record<ExportSentDocumentKey, string>;
};

function buildSentDocumentsFormState(d: ExportBulkingShipmentDetail): SentDocumentsFormState {
  const dates = {} as Record<ExportSentDocumentKey, string>;
  for (const key of EXPORT_SENT_DOCUMENT_KEYS) {
    const raw = d[sentFieldForKey(key)];
    dates[key] = toLocalDate(typeof raw === "string" ? raw : null);
  }
  return {
    required: parseRequiredSentDocuments(d.required_sent_documents),
    dates,
  };
}

function SentDocumentsSection(props: SectionProps & { open: boolean; onToggle: () => void }) {
  const { data, accessToken, onSaved, toast, saveTrigger, onDirtyChange } = props;
  const sectionKey = "sentDocuments";
  const blSaved = isBillOfLadingSaved(data);

  const getOrig = useCallback(() => buildSentDocumentsFormState(data), [data]);
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

  const missingLabels = useMemo(() => {
    if (!blSaved || form.required.length === 0) return [];
    const preview = {
      ...data,
      required_sent_documents: form.required,
      ...Object.fromEntries(
        form.required.map((key) => {
          const field = sentFieldForKey(key);
          const dateVal = form.dates[key];
          return [field, dateVal ? new Date(dateVal).toISOString() : null];
        }),
      ),
    } as ExportBulkingShipmentDetail;
    return getMissingRequiredSentDocumentLabels(preview);
  }, [blSaved, data, form]);

  const toggleRequired = (key: ExportSentDocumentKey) => {
    setForm((prev) => {
      const has = prev.required.includes(key);
      const required = has
        ? prev.required.filter((k) => k !== key)
        : [...prev.required, key];
      return { ...prev, required };
    });
  };

  const setDate = (key: ExportSentDocumentKey) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({
      ...prev,
      dates: { ...prev.dates, [key]: e.target.value },
    }));
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    const body: Record<string, string | string[] | null> = {
      required_sent_documents: form.required,
    };
    for (const key of EXPORT_SENT_DOCUMENT_KEYS) {
      const field = sentFieldForKey(key);
      if (form.required.includes(key)) {
        body[field] = form.dates[key] ? new Date(form.dates[key]).toISOString() : null;
      } else {
        body[field] = null;
      }
    }
    const res = await updateExportBulkingShipment(data.id, body, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else {
      toast.pushToast("Sent Documents saved", "success");
      onSaved({ patch: listItemToDetailPatch(res.data), refetch: "none" });
    }
    setSaving(false);
  }, [data.id, form, accessToken, toast, onSaved]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  useEffect(() => {
    if (saveTrigger === 0) return;
    if (isDirtyRef.current) handleSaveRef.current();
  }, [saveTrigger]);

  return (
    <SectionShell
      title="Sent Documents"
      titleIcon={<Send size={18} strokeWidth={2} />}
      open={props.open}
      onToggle={props.onToggle}
      dirty={isDirty}
      anchorId="export-section-sent-documents"
    >
      <Card>
        {!blSaved ? (
          <p className={styles.sentDocsGate}>
            Save <strong>Bill of Lading</strong> first, then choose which documents must be sent and record sent dates here.
          </p>
        ) : (
          <>
            <p className={styles.sentDocsIntro}>
              Check each document that must be sent for this shipment. Record the sent date when it has been dispatched.
            </p>
            {missingLabels.length > 0 && (
              <div className={styles.sentDocsAlert} role="alert">
                <strong>Action needed:</strong> sent date still missing for {missingLabels.join(", ")}.
                The documentation team will be notified until these are recorded.
              </div>
            )}
            <div className={styles.sentDocsChecklist}>
              <p className={styles.sentDocsChecklistTitle}>Required documents to send</p>
              {EXPORT_SENT_DOCUMENT_KEYS.map((key) => (
                <label key={key} className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={form.required.includes(key)}
                    onChange={() => toggleRequired(key)}
                  />
                  {EXPORT_SENT_DOCUMENT_LABELS[key]}
                </label>
              ))}
            </div>
            {form.required.length > 0 ? (
              <div className={styles.fieldGrid}>
                {form.required.map((key) => (
                  <div key={key} className={styles.field}>
                    <label className={styles.fieldLabel}>{EXPORT_SENT_DOCUMENT_LABELS[key]} — Sent date</label>
                    <input
                      className={styles.fieldInput}
                      type="date"
                      value={form.dates[key]}
                      onChange={setDate(key)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.sentDocsEmpty}>No required sent documents selected yet.</p>
            )}
            <div className={styles.actions}>
              <button className={styles.btnPrimary} onClick={handleSave} disabled={saving || !isDirty}>
                {saving ? "Saving…" : "Save Sent Documents"}
              </button>
            </div>
          </>
        )}
      </Card>
    </SectionShell>
  );
}

type SiPebDraft = {
  si_id: string;
  si_label: string;
  peb_request_no: string;
  peb_no: string;
  peb_date: string;
  hs_code: string;
};

function buildSiPebDrafts(data: ExportBulkingShipmentDetail): SiPebDraft[] {
  return data.shipping_instructions.map((si, idx) => ({
    si_id: si.id,
    si_label: si.si_number?.trim() || `Shipping Instruction ${idx + 1}`,
    peb_request_no: si.peb_request_no ?? (idx === 0 ? data.peb_request_no ?? "" : ""),
    peb_no: si.peb_no ?? (idx === 0 ? data.peb_no ?? "" : ""),
    peb_date: toLocalDate(si.peb_date ?? (idx === 0 ? data.peb_date ?? null : null)),
    hs_code: si.hs_code ?? (idx === 0 ? data.hs_code ?? "" : ""),
  }));
}

function mergeSiPebUpdates(prev: ShippingInstruction[], updated: ShippingInstruction[]): ShippingInstruction[] {
  const byId = new Map(updated.map((si) => [si.id, si]));
  return prev.map((si) => byId.get(si.id) ?? si);
}

function PebSection(props: SectionProps & { open: boolean; onToggle: () => void }) {
  const sectionKey = "peb";
  const { data, accessToken, onSaved, toast, saveTrigger, onDirtyChange, open, onToggle } = props;

  const getOrig = useCallback(() => buildSiPebDrafts(data), [data]);
  const [rows, setRows] = useState<SiPebDraft[]>(getOrig);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);

  useEffect(() => { setRows(getOrig()); }, [getOrig]);
  useEffect(() => {
    const dirty = JSON.stringify(rows) !== JSON.stringify(getOrig());
    isDirtyRef.current = dirty;
    setIsDirty(dirty);
    onDirtyChange(sectionKey, dirty);
  }, [rows, getOrig, onDirtyChange]);

  const updateRow = (idx: number, patch: Partial<SiPebDraft>) =>
    setRows((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));

  const handleSave = useCallback(async () => {
    if (rows.length === 0) {
      toast.pushToast("Create at least one Shipping Instruction before saving PEB details.", "error");
      return;
    }
    setSaving(true);
    const items = rows.map((row) => ({
      id: row.si_id,
      peb_request_no: row.peb_request_no.trim() || null,
      peb_no: row.peb_no.trim() || null,
      peb_date: row.peb_date ? new Date(`${row.peb_date}T00:00:00`).toISOString() : null,
      hs_code: row.hs_code.trim() || null,
    }));
    const res = await upsertSiPebFields(data.id, items, accessToken);
    if (isApiError(res)) toast.pushToast(res.message, "error");
    else {
      toast.pushToast("PEB saved", "success");
      onSaved({
        shipping_instructions: mergeSiPebUpdates(data.shipping_instructions, res.data),
        refetch: "none",
      });
    }
    setSaving(false);
  }, [data.id, data.shipping_instructions, rows, accessToken, toast, onSaved]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  useEffect(() => {
    if (saveTrigger === 0) return;
    if (isDirtyRef.current) handleSaveRef.current();
  }, [saveTrigger]);

  return (
    <SectionShell
      title="PEB"
      titleIcon={<BadgeCheck size={18} strokeWidth={2} />}
      open={open}
      onToggle={onToggle}
      dirty={isDirty}
      anchorId="export-section-peb"
    >
      <Card>
        {rows.length === 0 ? (
          <p className={styles.fieldMuted}>Add a shipping instruction first — each shipping instruction needs its own PEB details.</p>
        ) : (
          <>
            <p className={styles.fieldMuted} style={{ marginTop: 0, marginBottom: 12 }}>
              PEB details are recorded per shipping instruction ({rows.length} shipping instruction{rows.length === 1 ? "" : "s"}).
            </p>
            {rows.map((row, idx) => (
              <div key={row.si_id} className={styles.pebSiBlock}>
                <div className={styles.pebSiBlockHeader}>
                  <strong>{row.si_label}</strong>
                </div>
                <div className={styles.fieldGrid}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>PEB Request No</label>
                    <input
                      className={styles.fieldInput}
                      type="text"
                      value={row.peb_request_no}
                      onChange={(e) => updateRow(idx, { peb_request_no: e.target.value })}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>PEB No</label>
                    <input
                      className={styles.fieldInput}
                      type="text"
                      value={row.peb_no}
                      onChange={(e) => updateRow(idx, { peb_no: e.target.value })}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>PEB Date</label>
                    <input
                      className={styles.fieldInput}
                      type="date"
                      value={row.peb_date}
                      onChange={(e) => updateRow(idx, { peb_date: e.target.value })}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor={`peb-hs-code-${row.si_id}`}>
                      HS Code
                    </label>
                    <input
                      id={`peb-hs-code-${row.si_id}`}
                      className={styles.fieldInput}
                      type="text"
                      value={row.hs_code}
                      onChange={(e) => updateRow(idx, { hs_code: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => void handleSave()}
            disabled={saving || !isDirty || rows.length === 0}
          >
            {saving ? "Saving…" : "Save PEB"}
          </button>
        </div>
      </Card>
    </SectionShell>
  );
}

function BillingLevySection(
  props: SectionProps & { open: boolean; onToggle: () => void; ocrDisabled?: boolean },
) {
  const sectionKey = "billingLevy";
  const { data, accessToken, onSaved, toast, saveTrigger, onDirtyChange, open, onToggle, ocrDisabled = false } = props;

  const getOrigShipmentForm = useCallback(
    () => buildBillingShipmentForm(data, formatNumericFieldValue),
    [data],
  );
  const getOrigBillingLines = useCallback(
    () => buildBillingLineDrafts(data, formatQuantityFieldValue),
    [data],
  );

  const [shipmentForm, setShipmentForm] = useState<BillingShipmentForm>(getOrigShipmentForm);
  const [billingLines, setBillingLines] = useState<BillingLineDraft[]>(getOrigBillingLines);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);

  const invoiceSos = useMemo(() => distinctSoNosFromShipment(data), [data]);
  const qtyBySo = useMemo(() => sumInvoiceQtyBySo(data.invoices), [data.invoices]);

  useEffect(() => {
    setShipmentForm(getOrigShipmentForm());
    setBillingLines(getOrigBillingLines());
  }, [getOrigShipmentForm, getOrigBillingLines]);

  useEffect(() => {
    const dirty =
      JSON.stringify(shipmentForm) !== JSON.stringify(getOrigShipmentForm()) ||
      JSON.stringify(billingLines) !== JSON.stringify(getOrigBillingLines());
    isDirtyRef.current = dirty;
    setIsDirty(dirty);
    onDirtyChange(sectionKey, dirty);
  }, [shipmentForm, billingLines, getOrigShipmentForm, getOrigBillingLines, onDirtyChange]);

  const updateBillingLine = (idx: number, patch: Partial<BillingLineDraft>) =>
    setBillingLines((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));

  const handleApplyPaymentRequestOcr = useCallback(
    (d: ApplyPaymentRequestOcrData) => {
      const validation = validatePaymentRequestAgainstInvoice(invoiceSos, d.lines);
      if (!validation.canApply) {
        toast.pushToast(validation.blockReason ?? "Cannot apply Payment of Request.", "error");
        return;
      }

      const matchedLines = d.lines.filter((l) => validation.matched.includes(l.so_no));
      const scopeInput = matchedLines.map((l) => ({
        so_no: l.so_no,
        qty_mt: l.qty_mt ?? null,
        biaya_keluar_amount_idr: l.biaya_keluar_amount_idr,
        levy_amount_idr: l.levy_amount_idr,
      }));

      const amountsBySo = allocatePaymentRequestAmounts(
        scopeInput,
        d.duty_usd_mt,
        d.levy_usd_mt,
        d.currency_tax,
        qtyBySo,
      );

      const matchedSet = new Set(validation.matched);

      if (d.currency_tax != null) {
        setShipmentForm((p) => {
          const existing = p.currency_tax.trim();
          if (existing && existing !== String(d.currency_tax)) {
            toast.pushToast(
              `Currency tax updated from ${existing} to ${d.currency_tax} (from PR).`,
              "error",
            );
          }
          return { ...p, currency_tax: String(d.currency_tax) };
        });
      }

      setBillingLines((prev) =>
        prev.map((row) => {
          if (!matchedSet.has(row.so_no)) return row;

          const ocr = matchedLines.find((l) => l.so_no === row.so_no);
          const allocated = amountsBySo.get(row.so_no);
          if (!ocr) return row;

          return {
            ...row,
            biaya_keluar_price_usd_mt:
              d.duty_usd_mt != null ? String(d.duty_usd_mt) : row.biaya_keluar_price_usd_mt,
            levy_price_usd_mt:
              d.levy_usd_mt != null ? String(d.levy_usd_mt) : row.levy_price_usd_mt,
            biaya_keluar_billing_no:
              ocr.biaya_keluar_billing_no ?? row.biaya_keluar_billing_no,
            levy_billing_no: ocr.levy_billing_no ?? row.levy_billing_no,
            biaya_keluar_amount_idr:
              allocated?.biaya_keluar_amount_idr != null
                ? String(allocated.biaya_keluar_amount_idr)
                : ocr.biaya_keluar_amount_idr != null
                  ? String(ocr.biaya_keluar_amount_idr)
                  : row.biaya_keluar_amount_idr,
            levy_amount_idr:
              allocated?.levy_amount_idr != null
                ? String(allocated.levy_amount_idr)
                : ocr.levy_amount_idr != null
                  ? String(ocr.levy_amount_idr)
                  : row.levy_amount_idr,
          };
        }),
      );

      const applied = validation.matched.join(", ");
      const pending =
        validation.missingFromDocument.length > 0
          ? ` Pending invoice SO(s): ${validation.missingFromDocument.join(", ")} — upload another PR.`
          : "";
      toast.pushToast(`Applied PR to SO ${applied}.${pending}`, "success");
    },
    [invoiceSos, qtyBySo, toast],
  );

  const billingFillStatus = useMemo(
    () => countFilledBillingSos(billingLines),
    [billingLines],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    const shipmentPatch = billingShipmentFormToPatch(shipmentForm, parseQuantityInput);
    const billingPayload = billingDraftsToUpsertPayload(billingLines, parseQuantityInput);
    const [shipRes, billRes] = await Promise.all([
      updateExportBulkingShipment(data.id, shipmentPatch, accessToken),
      upsertBillingLines(data.id, billingPayload, accessToken),
    ]);
    if (isApiError(shipRes)) toast.pushToast(shipRes.message, "error");
    else if (isApiError(billRes)) toast.pushToast(billRes.message, "error");
    else {
      toast.pushToast("Billing & Levy saved", "success");
      onSaved({
        patch: listItemToDetailPatch(shipRes.data),
        billing_lines: billRes.data,
        refetch: "none",
      });
    }
    setSaving(false);
  }, [data.id, shipmentForm, billingLines, accessToken, toast, onSaved]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  useEffect(() => {
    if (saveTrigger === 0) return;
    if (isDirtyRef.current) handleSaveRef.current();
  }, [saveTrigger]);

  const formatIdrDisplay = (raw: string) => {
    if (!raw.trim()) return "";
    const n = parseInt(raw.replace(/,/g, ""), 10);
    return Number.isNaN(n) ? raw : n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  };

  const billingTotals = useMemo(() => {
    let bkTotal = 0;
    let levyTotal = 0;
    for (const row of billingLines) {
      const bk = parseInt(row.biaya_keluar_amount_idr.replace(/,/g, ""), 10);
      const levy = parseInt(row.levy_amount_idr.replace(/,/g, ""), 10);
      if (!Number.isNaN(bk)) bkTotal += bk;
      if (!Number.isNaN(levy)) levyTotal += levy;
    }
    return { bkTotal, levyTotal, grandTotal: bkTotal + levyTotal };
  }, [billingLines]);

  const formatIdrSummary = (n: number) =>
    n.toLocaleString("en-US", { maximumFractionDigits: 0 });

  return (
    <SectionShell
      title="Billing & Levy"
      titleIcon={<Coins size={18} strokeWidth={2} />}
      open={open}
      onToggle={onToggle}
      dirty={isDirty}
      anchorId="export-section-billing-levy"
    >
      <Card>
        <p className={styles.fieldMuted} style={{ marginTop: 0, marginBottom: 12 }}>
          Upload a Payment of Request PDF to auto-fill billing per SO. You can upload multiple PR documents over time —
          each apply updates only the SO rows found in that document that match invoice lines.
          {invoiceSos.length > 0 && billingFillStatus.total > 0 && (
            <>
              {" "}
              Billing filled: {billingFillStatus.filled}/{billingFillStatus.total} SO
              {billingFillStatus.filled < billingFillStatus.total ? " (upload another PR for remaining SOs)" : ""}.
            </>
          )}
        </p>

        <div className={styles.billingOcrRow}>
          <div className={styles.billingOcrColFull}>
            <p className={styles.billingOcrLabel}>
              Payment of Request — Levy or Duty Taxes
            </p>
            <PaymentRequestOcrUpload
              accessToken={accessToken}
              invoiceSos={invoiceSos}
              onApply={handleApplyPaymentRequestOcr}
              disabled={ocrDisabled || invoiceSos.length === 0}
            />
          </div>
        </div>

        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="billing-currency-tax">
              Currency Tax
            </label>
            <input
              id="billing-currency-tax"
              className={styles.fieldInput}
              type="text"
              inputMode="decimal"
              value={shipmentForm.currency_tax}
              onChange={(e) => setShipmentForm((p) => ({ ...p, currency_tax: e.target.value }))}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="billing-to-gl">
              Billing to GL
            </label>
            <input
              id="billing-to-gl"
              className={styles.fieldInput}
              type="date"
              value={shipmentForm.billing_to_gl}
              onChange={(e) => setShipmentForm((p) => ({ ...p, billing_to_gl: e.target.value }))}
            />
          </div>
        </div>

        {invoiceSos.length === 0 ? (
          <p className={styles.emptyMsg}>
            No sales orders yet. Enter SO numbers on invoice lines under Pre-shipment Documents.
          </p>
        ) : (
          <div className={`${styles.sapTableWrap} ${styles.billingTableWrap}`}>
            <table className={styles.sapTable}>
              <thead>
                <tr>
                  <th scope="col">SO No</th>
                  <th scope="col">Invoice Qty (MT)</th>
                  <th scope="col">BK Price ($/MT)</th>
                  <th scope="col">BK Amount (IDR)</th>
                  <th scope="col">BK Billing No</th>
                  <th scope="col">Levy Price ($/MT)</th>
                  <th scope="col">Levy Amount (IDR)</th>
                  <th scope="col">Levy Billing No</th>
                </tr>
              </thead>
              <tbody>
                {billingLines.map((row, idx) => {
                  const invQty = qtyBySo.get(row.so_no);
                  return (
                    <tr key={row.rowKey}>
                      <td className={styles.sapSoCell}>
                        <span className={styles.sapSoLabel} title={row.so_no}>
                          {row.so_no}
                        </span>
                      </td>
                      <td className={styles.billingQtyCell}>
                        {invQty != null && invQty > 0 ? formatNumericDisplay(invQty) : "—"}
                      </td>
                      <td>
                        <input
                          className={styles.sapInput}
                          type="text"
                          inputMode="decimal"
                          value={row.biaya_keluar_price_usd_mt}
                          onChange={(e) => updateBillingLine(idx, { biaya_keluar_price_usd_mt: e.target.value })}
                          aria-label={`Biaya Keluar price for SO ${row.so_no}`}
                        />
                      </td>
                      <td>
                        <input
                          className={styles.sapInput}
                          type="text"
                          inputMode="numeric"
                          value={formatIdrDisplay(row.biaya_keluar_amount_idr)}
                          onChange={(e) =>
                            updateBillingLine(idx, { biaya_keluar_amount_idr: e.target.value.replace(/,/g, "") })
                          }
                          aria-label={`Biaya Keluar amount for SO ${row.so_no}`}
                        />
                      </td>
                      <td>
                        <input
                          className={styles.sapInput}
                          type="text"
                          value={row.biaya_keluar_billing_no}
                          onChange={(e) => updateBillingLine(idx, { biaya_keluar_billing_no: e.target.value })}
                          aria-label={`Biaya Keluar billing no for SO ${row.so_no}`}
                        />
                      </td>
                      <td>
                        <input
                          className={styles.sapInput}
                          type="text"
                          inputMode="decimal"
                          value={row.levy_price_usd_mt}
                          onChange={(e) => updateBillingLine(idx, { levy_price_usd_mt: e.target.value })}
                          aria-label={`Levy price for SO ${row.so_no}`}
                        />
                      </td>
                      <td>
                        <input
                          className={styles.sapInput}
                          type="text"
                          inputMode="numeric"
                          value={formatIdrDisplay(row.levy_amount_idr)}
                          onChange={(e) =>
                            updateBillingLine(idx, { levy_amount_idr: e.target.value.replace(/,/g, "") })
                          }
                          aria-label={`Levy amount for SO ${row.so_no}`}
                        />
                      </td>
                      <td>
                        <input
                          className={styles.sapInput}
                          type="text"
                          value={row.levy_billing_no}
                          onChange={(e) => updateBillingLine(idx, { levy_billing_no: e.target.value })}
                          aria-label={`Levy billing no for SO ${row.so_no}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className={styles.billingSummary}>
          <div className={styles.billingSummaryItem}>
            <span className={styles.billingSummaryLabel}>BK Amount Total</span>
            <strong className={styles.billingSummaryValue}>{formatIdrSummary(billingTotals.bkTotal)} IDR</strong>
          </div>
          <div className={styles.billingSummaryItem}>
            <span className={styles.billingSummaryLabel}>Levy Amount Total</span>
            <strong className={styles.billingSummaryValue}>{formatIdrSummary(billingTotals.levyTotal)} IDR</strong>
          </div>
          <div className={`${styles.billingSummaryItem} ${styles.billingSummaryItemTotal}`}>
            <span className={styles.billingSummaryLabel}>Total Amount</span>
            <strong className={styles.billingSummaryValue}>{formatIdrSummary(billingTotals.grandTotal)} IDR</strong>
          </div>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => void handleSave()}
            disabled={saving || !isDirty}
          >
            {saving ? "Saving…" : "Save Billing & Levy"}
          </button>
        </div>
      </Card>
    </SectionShell>
  );
}

// ─── Documentation progress bar ──────────────────────────────────────────────

function DocProgressBar({ data }: { data: ExportBulkingShipmentDetail }) {
  const summary = buildDocumentationProgress(data);
  const barTone =
    summary.percent >= 70
      ? styles.docBarHigh
      : summary.percent >= 30
        ? styles.docBarMid
        : styles.docBarLow;

  return (
    <div className={styles.docProgressWrap} data-tour="export-bulking-doc-progress" aria-label={`Documentation progress ${summary.percent}%`}>
      <div className={styles.docProgressHeader}>
        <span className={styles.docProgressTitle}>Documentation Progress</span>
        <span className={styles.docProgressMeta}>
          {summary.doneCount}/{summary.totalCount} tasks
          {summary.percent === 100 && (
            <span className={styles.docProgressComplete}> ✓ Complete</span>
          )}
        </span>
      </div>
      <div className={styles.docProgressBar} role="progressbar" aria-valuenow={summary.percent} aria-valuemin={0} aria-valuemax={100}>
        <div className={`${styles.docProgressFill} ${barTone}`} style={{ width: `${summary.percent}%` }} />
      </div>
      <div className={styles.docProgressSteps}>
        {summary.steps.map((step, idx) => (
          <div key={step.key} className={`${styles.docProgressStep} ${step.complete ? styles.docProgressStepDone : ""}`}>
            <span className={styles.docProgressStepNum}>{idx + 1}</span>
            <span className={styles.docProgressStepLabel}>{step.label}</span>
            <span className={styles.docProgressStepCount}>{step.doneCount}/{step.totalCount}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Documentation step wrapper ───────────────────────────────────────────────

function DocStepCard({
  stepNumber,
  title,
  doneCount,
  totalCount,
  children,
}: {
  stepNumber: number;
  title: string;
  doneCount: number;
  totalCount: number;
  children: React.ReactNode;
}) {
  const complete = doneCount === totalCount;
  return (
    <div className={`${styles.docStepCard} ${complete ? styles.docStepCardDone : ""}`}>
      <div className={styles.docStepCardHeader}>
        <span className={`${styles.docStepNum} ${complete ? styles.docStepNumDone : ""}`}>
          {complete ? "✓" : stepNumber}
        </span>
        <span className={styles.docStepTitle}>{title}</span>
        <span className={`${styles.docStepBadge} ${complete ? styles.docStepBadgeDone : ""}`}>
          {doneCount}/{totalCount}
        </span>
      </div>
      <div className={styles.docStepBody}>{children}</div>
    </div>
  );
}

// ─── Structured Documentation tab sections ────────────────────────────────────

function DocumentationDetailSections({
  sectionProps,
  openSections,
  toggleSection,
  billingOcrDisabled = false,
}: {
  sectionProps: SectionCoreProps;
  openSections: OpenSectionsState;
  toggleSection: (key: keyof OpenSectionsState) => void;
  billingOcrDisabled?: boolean;
}) {
  const progress = buildDocumentationProgress(sectionProps.data);
  const stepMap = Object.fromEntries(progress.steps.map((s) => [s.key, s]));

  return (
    <>
      {/* Step 2 — Customs Compliance (PEB + Data SAP) */}
      <DocStepCard
        stepNumber={2}
        title="Customs Compliance"
        doneCount={stepMap.customs?.doneCount ?? 0}
        totalCount={stepMap.customs?.totalCount ?? 2}
      >
        <PebSection {...sectionProps} open={openSections.peb} onToggle={() => toggleSection("peb")} />
        <DataSapSection {...sectionProps} open={openSections.npeSpb} onToggle={() => toggleSection("npeSpb")} />
      </DocStepCard>

      {/* Step 3 — Billing & Levy */}
      <DocStepCard
        stepNumber={3}
        title="Billing & Levy"
        doneCount={stepMap.billing?.doneCount ?? 0}
        totalCount={stepMap.billing?.totalCount ?? 3}
      >
        <BillingLevySection
          {...sectionProps}
          open={openSections.billingLevy}
          onToggle={() => toggleSection("billingLevy")}
          ocrDisabled={billingOcrDisabled}
        />
      </DocStepCard>

      {/* Step 4 — Final Shipping Documents */}
      <DocStepCard
        stepNumber={4}
        title="Final Shipping Documents"
        doneCount={stepMap.finalDocs?.doneCount ?? 0}
        totalCount={stepMap.finalDocs?.totalCount ?? 2}
      >
        <BillOfLadingSection {...sectionProps} open={openSections.billOfLading} onToggle={() => toggleSection("billOfLading")} />
        <SentDocumentsSection {...sectionProps} open={openSections.sentDocuments} onToggle={() => toggleSection("sentDocuments")} />
      </DocStepCard>
    </>
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

function cargoToReconciliation(c: CargoLine): ReconciliationLineDraft {
  return {
    id: c.id,
    cargo_name: c.cargo_name ?? "",
    item_description: c.item_description ?? "",
    shore_figure: formatQuantityFieldValue(c.quantity_delivered),
    ship_figure: formatQuantityFieldValue(c.ship_figure),
    remarks: c.reconciliation_remarks ?? "",
  };
}

function LoadingSection({
  data, accessToken, open, onToggle, onSaved, toast, saveTrigger, onDirtyChange,
}: SectionProps) {
  const sectionKey = "loading";
  const [commodityList, setCommodityList] = useState<Commodity[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    listCommodities(accessToken).then((res) => {
      if (!isApiError(res)) setCommodityList((res as { data: Commodity[] }).data ?? []);
    });
  }, [accessToken]);

  const hasLiquidCargo = useMemo(
    () => shipmentHasLiquidCargo(data.cargo_lines, commodityList),
    [data.cargo_lines, commodityList],
  );

  const actualLaytimeStart = useMemo(
    () => calcActualLaytimeStart(data.ata, data.atb, data.nor, data.laycan_from, data.laycan_to),
    [data.ata, data.atb, data.nor, data.laycan_from, data.laycan_to],
  );
  const actualLaytimeEnd = useMemo(
    () => calcActualLaytimeEnd(actualLaytimeStart, resolveShipmentTotalQuantity(data), data.laytime_rate_mtph),
    [actualLaytimeStart, data.cargo_lines, data.total_quantity, data.laytime_rate_mtph],
  );

  const getOrigLoading = useCallback((): LoadingDatetimeForm => ({
    commence_loading: toLocalDatetime(data.commence_loading),
    etc: toLocalDatetime(data.etc),
    atc: toLocalDatetime(data.atc),
    hose_on: toLocalDatetime(data.hose_on),
    hose_off: toLocalDatetime(data.hose_off),
    npe_date: toLocalDatetime(data.npe_date),
  }), [data]);

  const getOrigReconciliation = useCallback(
    () => data.cargo_lines.map(cargoToReconciliation),
    [data.cargo_lines],
  );

  const getOrigBlSource = useCallback(
    (): ReconciliationBlSource => inferReconciliationBlSource(data.cargo_lines),
    [data.cargo_lines],
  );

  const [form, setForm] = useState(getOrigLoading);
  const [reconciliationLines, setReconciliationLines] = useState<ReconciliationLineDraft[]>(getOrigReconciliation);
  const [blSource, setBlSource] = useState<ReconciliationBlSource>(getOrigBlSource);
  const [expandedRemarkIds, setExpandedRemarkIds] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);

  useEffect(() => { setForm(getOrigLoading()); }, [getOrigLoading]);
  useEffect(() => {
    setReconciliationLines(getOrigReconciliation());
    setBlSource(getOrigBlSource());
    setExpandedRemarkIds(new Set());
  }, [getOrigReconciliation, getOrigBlSource]);
  useEffect(() => {
    const dirty =
      JSON.stringify(form) !== JSON.stringify(getOrigLoading()) ||
      JSON.stringify(reconciliationLines) !== JSON.stringify(getOrigReconciliation()) ||
      blSource !== getOrigBlSource();
    isDirtyRef.current = dirty;
    setIsDirty(dirty);
    onDirtyChange(sectionKey, dirty);
  }, [form, reconciliationLines, blSource, getOrigLoading, getOrigReconciliation, getOrigBlSource, onDirtyChange]);

  const toggleRemarks = (lineId: string) => {
    setExpandedRemarkIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  const handleSave = useCallback(async () => {
    const validation = validateLoadingDatetimeForm(form);
    setFieldErrors(validation);
    if (Object.keys(validation).length > 0) {
      toast.pushToast(Object.values(validation)[0] ?? "Fix loading date/time fields", "error");
      return;
    }

    setSaving(true);
    const body: Record<string, string | null> = {
      commence_loading: form.commence_loading ? new Date(form.commence_loading).toISOString() : null,
      etc: form.etc ? new Date(form.etc).toISOString() : null,
      atc: form.atc ? new Date(form.atc).toISOString() : null,
      hose_on: hasLiquidCargo && form.hose_on ? new Date(form.hose_on).toISOString() : null,
      hose_off: form.hose_off ? new Date(form.hose_off).toISOString() : null,
      npe_date: form.npe_date ? new Date(form.npe_date).toISOString() : null,
    };
    const cargoPayload = reconciliationLines.map((row, idx) => {
      const orig = data.cargo_lines.find((c) => c.id === row.id);
      const inheritedBl = resolveInheritedBlFigure(row, blSource);
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
        pe_no: orig?.pe_no ?? null,
        pe_date: orig?.pe_date ?? null,
        quantity_delivered: parseReconQuantityInput(row.shore_figure),
        bl_figure: parseReconQuantityInput(inheritedBl),
        ship_figure: parseReconQuantityInput(row.ship_figure),
        reconciliation_remarks: row.remarks.trim() || null,
      };
    });
    const [shipmentRes, cargoRes] = await Promise.all([
      updateExportBulkingShipment(data.id, body, accessToken),
      upsertCargoLines(data.id, cargoPayload, accessToken),
    ]);
    if (isApiError(shipmentRes)) toast.pushToast(shipmentRes.message, "error");
    else if (isApiError(cargoRes)) toast.pushToast(cargoRes.message, "error");
    else {
      toast.pushToast("Loading operations saved", "success");
      onSaved({
        patch: listItemToDetailPatch(shipmentRes.data),
        cargo_lines: cargoRes.data,
        refetch: "none",
      });
    }
    setSaving(false);
  }, [data.id, data.cargo_lines, form, reconciliationLines, blSource, hasLiquidCargo, accessToken, toast, onSaved]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  useEffect(() => {
    if (saveTrigger === 0) return;
    if (isDirtyRef.current) handleSaveRef.current();
  }, [saveTrigger]);

  const setLoadingField = (key: keyof LoadingDatetimeForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const renderLoadingDatetimeField = (
    key: keyof LoadingDatetimeForm,
    label: string,
  ) => (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={`loading-${key}`}>{label}</label>
      <input
        id={`loading-${key}`}
        className={`${styles.fieldInput}${fieldErrors[key] ? ` ${styles.fieldInputInvalid}` : ""}`}
        type="datetime-local"
        value={form[key]}
        onChange={setLoadingField(key)}
      />
      {fieldErrors[key] ? <span className={styles.fieldError}>{fieldErrors[key]}</span> : null}
    </div>
  );

  return (
    <SectionShell title="Loading Operations" open={open} onToggle={onToggle} dirty={isDirty} anchorId="export-section-loading">
      <Card>
        <div className={styles.fieldGrid}>
          {renderLoadingDatetimeField("commence_loading", "Commence Loading")}
          {renderLoadingDatetimeField("etc", "ETC — Estimated Time of Completion")}
          {renderLoadingDatetimeField("atc", "ATC — Actual Time of Completion")}
          {hasLiquidCargo ? renderLoadingDatetimeField("hose_on", "Hose On") : null}
          {renderLoadingDatetimeField("hose_off", "Hose Off")}
          {renderLoadingDatetimeField("npe_date", "NPE Date")}
        </div>

        <div className={styles.sectionGroupLabel}>Quantity Reconciliation</div>
        <p className={styles.reconCautionHint}>
          Diff % outside ±0.3% is highlighted as a caution.
        </p>
        {reconciliationLines.length === 0 ? (
          <p className={styles.emptyMsg}>No cargo lines yet. Add cargo in the Document tab first.</p>
        ) : (
          <QuantityReconciliationTable
            lines={reconciliationLines}
            blSource={blSource}
            expandedRemarkIds={expandedRemarkIds}
            onLinesChange={setReconciliationLines}
            onBlSourceChange={setBlSource}
            onToggleRemarks={toggleRemarks}
          />
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
    () => calcActualLaytimeEnd(actualLaytimeStart, resolveShipmentTotalQuantity(data), data.laytime_rate_mtph),
    [actualLaytimeStart, data.cargo_lines, data.total_quantity, data.laytime_rate_mtph],
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
    else { toast.pushToast("Case Off saved", "success"); onSaved({ patch: listItemToDetailPatch(res.data), refetch: "none" }); }
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
  const tabFromUrl = searchParams.get("tab");
  const { accessToken, user } = useAuth();
  const toast = useToast();

  const canViewDocs = can(user, "VIEW_EXPORT_DOCUMENTATION");
  const canEditOps = canEditExportOperations(user);
  const canEditDocs = canEditExportDocumentation(user);
  const canEditCargo = canEditExportCargo(user);
  const canUploadExportDocs = canEditDocs || can(user, "UPLOAD_DOCUMENT");
  const isDocumentationOnly = isExportDocumentationOnly(user);
  const isOperationsOnly = isExportOperationsOnly(user);
  const isFullyReadOnly = !canEditOps && !canEditDocs;
  const forceViewMode = searchParams.get("mode") === "view";
  const opsReadOnly = !canEditOps;
  const docsReadOnly = !canEditDocs;
  const cargoReadOnly = !canEditCargo || forceViewMode;
  const showDocumentationTab = canViewDocs;

  const wantsDocumentationFocus =
    focusDocumentsFromUrl || tabFromUrl === "documentation" || isDocumentationOnly;

  const defaultDetailTab = parseDetailTab(tabFromUrl, wantsDocumentationFocus);
  const [detailTab, setDetailTab] = useState<ExportDetailTab>(defaultDetailTab);
  const [isInfoSidebarOpen, setIsInfoSidebarOpen] = useSessionPersistedState(
    "export-bulking-detail-info-sidebar-open",
    false,
  );

  const listReturnUrl = useMemo(
    () => buildBulkingListReturnUrl(detailTab === "documentation" ? "documentation" : "operations"),
    [detailTab],
  );

  const [data, setData] = useState<ExportBulkingShipmentDetail | null>(null);
  const dataRef = useRef<ExportBulkingShipmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusEvents, setStatusEvents] = useState<StatusEvent[]>([]);
  const [activityPanelOpen, setActivityPanelOpen] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityItems, setActivityItems] = useState<ActivityLogItem[]>([]);
  const savingAllRef = useRef(false);

  const [openSections, setOpenSections] = useState<OpenSectionsState>(() =>
    wantsDocumentationFocus ? { ...DOCS_OPEN_SECTIONS } : { ...OPS_OPEN_SECTIONS },
  );
  const [sectionDefaultsApplied, setSectionDefaultsApplied] = useState(wantsDocumentationFocus);

  const syncDetailTabToUrl = useCallback(
    (tab: ExportDetailTab) => {
      const p = new URLSearchParams(searchParams.toString());
      if (tab === "documentation") p.set("tab", "documentation");
      else p.delete("tab");
      p.delete("focus");
      const qs = p.toString();
      router.replace(`/export/bulking/${id}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [id, router, searchParams],
  );

  const handleDetailTabChange = useCallback(
    (tab: ExportDetailTab) => {
      setDetailTab(tab);
      syncDetailTabToUrl(tab);
    },
    [syncDetailTabToUrl],
  );

  const detailTourHooks = useMemo(
    () => ({
      onBeforeStep: (stepIndex: number) => {
        if (stepIndex === 3 && showDocumentationTab) {
          flushSync(() => handleDetailTabChange("documentation"));
        }
      },
    }),
    [handleDetailTabChange, showDocumentationTab],
  );
  useRegisterGuideTourHooks("exportBulkingDetail", detailTourHooks);

  useEffect(() => {
    const resolved = parseDetailTab(tabFromUrl, focusDocumentsFromUrl);
    if ((tabFromUrl === "documentation" || focusDocumentsFromUrl) && !canViewDocs) {
      router.replace(`/export/bulking/${id}`);
      return;
    }
    setDetailTab(resolved);
  }, [tabFromUrl, focusDocumentsFromUrl, canViewDocs, id, router]);

  useEffect(() => {
    if (sectionDefaultsApplied || wantsDocumentationFocus) return;
    if (isDocumentationOnly) {
      setOpenSections({ ...DOCS_OPEN_SECTIONS });
    } else if (canEditOps && !canViewDocs) {
      setOpenSections({ ...OPS_OPEN_SECTIONS });
    }
    setSectionDefaultsApplied(true);
  }, [
    user,
    id,
    router,
    wantsDocumentationFocus,
    sectionDefaultsApplied,
    isDocumentationOnly,
    canEditOps,
    canViewDocs,
  ]);
  const toggleSection = (key: keyof OpenSectionsState) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const jumpToSection = useCallback((key: ExportDetailSectionKey) => {
    const documentTabKeys = new Set<ExportDetailSectionKey>([
      "cargo",
      "si",
      "invoices",
      "packing",
    ]);
    if (documentTabKeys.has(key) && detailTab !== "documentation") {
      handleDetailTabChange("documentation");
    }
    setOpenSections((prev) => ({ ...prev, [key]: true }));
    const anchorId = EXPORT_SECTION_ANCHORS[key];
    window.requestAnimationFrame(() => {
      document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [detailTab, handleDetailTabChange]);

  const jumpToAnchor = useCallback((anchorId: string, sectionKey?: keyof OpenSectionsState) => {
    const documentTabAnchors = new Set([
      "export-section-cargo",
      "export-section-si-receive-date",
      "export-section-si",
      "export-section-invoices",
      "export-section-packing",
      "export-section-npe-spb",
      "export-section-bill-of-lading",
      "export-section-sent-documents",
      "export-section-peb",
      "export-section-billing-levy",
    ]);
    if (documentTabAnchors.has(anchorId) && detailTab !== "documentation") {
      handleDetailTabChange("documentation");
    }
    if (sectionKey) {
      setOpenSections((prev) => ({ ...prev, [sectionKey]: true }));
    }
    window.requestAnimationFrame(() => {
      document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [detailTab, handleDetailTabChange]);

  // Save All mechanism
  const [dirtySections, setDirtySections] = useState<Record<string, boolean>>({});
  const [saveTrigger, setSaveTrigger] = useState(0);
  const [savingAll, setSavingAll] = useState(false);

  const onDirtyChange = useCallback((key: string, dirty: boolean) => {
    setDirtySections((prev) => (prev[key] === dirty ? prev : { ...prev, [key]: dirty }));
    if (dirty) {
      const openKey = DIRTY_SECTION_OPEN_KEYS[key];
      if (openKey) {
        setOpenSections((prev) => (prev[openKey] ? prev : { ...prev, [openKey]: true }));
      }
    }
  }, []);

  const isAnyDirty = Object.values(dirtySections).some(Boolean);

  const handleSaveAll = useCallback(() => {
    savingAllRef.current = true;
    setSavingAll(true);
    setSaveTrigger((t) => t + 1);
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

  const fetchDetail = useCallback(async (opts?: { mode?: DetailRefreshMode }) => {
    if (!id || !accessToken) return;
    const mode = opts?.mode ?? (dataRef.current ? "silent" : "initial");
    const isInitial = mode === "initial";
    const scrollY = !isInitial ? window.scrollY : undefined;

    if (isInitial) setLoading(true);
    else setRefreshing(true);

    const [res, eventsRes] = await Promise.all([
      getExportBulkingShipment(id, accessToken),
      getStatusEvents(id, accessToken),
    ]);

    if (isApiError(res)) {
      if (isInitial) setError(res.message);
      else toast.pushToast(res.message, "error");
    } else {
      setData({
        ...res.data,
        sap_lines: res.data.sap_lines ?? [],
        billing_lines: res.data.billing_lines ?? [],
        bills_of_lading: res.data.bills_of_lading ?? [],
      });
      setError(null);
    }
    if (!isApiError(eventsRes)) setStatusEvents(eventsRes.data ?? []);

    if (isInitial) setLoading(false);
    else {
      setRefreshing(false);
      if (scrollY !== undefined) {
        requestAnimationFrame(() => window.scrollTo(0, scrollY));
      }
    }
  }, [id, accessToken, toast]);

  const fetchActivityLog = useCallback(async () => {
    if (!accessToken || !id) return;
    setActivityLoading(true);
    setActivityError(null);
    const res = await getExportBulkingActivityLog(id, accessToken);
    if (isApiError(res)) {
      setActivityError(res.message);
      setActivityItems([]);
    } else {
      setActivityItems(res.data?.items ?? []);
    }
    setActivityLoading(false);
  }, [accessToken, id]);

  const openActivityPanel = useCallback(() => {
    setActivityPanelOpen(true);
    void fetchActivityLog();
  }, [fetchActivityLog]);

  const closeActivityPanel = useCallback(() => {
    setActivityPanelOpen(false);
  }, []);

  const handleSaved = useCallback<OnSavedFn>((options) => {
    const hasPatch =
      options?.patch != null ||
      options?.cargo_lines !== undefined ||
      options?.shipping_instructions !== undefined ||
      options?.invoices !== undefined ||
      options?.packing_lists !== undefined ||
      options?.sap_lines !== undefined ||
      options?.billing_lines !== undefined ||
      options?.bills_of_lading !== undefined;

    if (hasPatch) {
      setData((prev) => (prev && options ? mergeDetailSaved(prev, options) : prev));
    }

    if (savingAllRef.current) return;

    const refetch = options?.refetch ?? "none";
    if (refetch === "silent") {
      void fetchDetail({ mode: "silent" });
    }
  }, [fetchDetail]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => { void fetchDetail({ mode: "initial" }); }, [fetchDetail]);

  useEffect(() => {
    if (!savingAll) return;
    if (isAnyDirty) return;
    savingAllRef.current = false;
    void fetchDetail({ mode: "silent" }).finally(() => setSavingAll(false));
  }, [savingAll, isAnyDirty, fetchDetail]);

  useEffect(() => {
    if (!savingAll) return;
    const timeout = window.setTimeout(() => {
      savingAllRef.current = false;
      setSavingAll(false);
    }, 12000);
    return () => window.clearTimeout(timeout);
  }, [savingAll]);

  // Advance status
  const handleAdvanceStatus = async () => {
    if (opsReadOnly || forceViewMode) return;
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
      void fetchDetail({ mode: "silent" });
    }
  };

  if (loading) {
    return (
      <>
        <PageHeader title="Loading…" backHref={listReturnUrl} backLabel="Bulking" />
        <LoadingSkeleton lines={8} />
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <PageHeader title="Error" backHref={listReturnUrl} backLabel="Bulking" />
        <Card><p className={styles.errorMsg}>{friendlyExportDetailError(error)}</p></Card>
      </>
    );
  }

  const sectionProps = {
    data,
    accessToken: accessToken!,
    onSaved: handleSaved,
    toast,
    saveTrigger,
    onDirtyChange,
    canEditDestinations: canEditDocs && !forceViewMode,
  };

  return (
    <div className={`${styles.page} ${isFullyReadOnly || forceViewMode ? styles.readOnlyPage : ""}`}>
      <PageHeader
        title={data.shipment_no}
        backHref={listReturnUrl}
        backLabel="Bulking"
        onBackClick={
          !isFullyReadOnly && !forceViewMode && isAnyDirty
            ? () => {
                if (window.confirm("You have unsaved changes. Leave without saving?")) {
                  router.push(listReturnUrl);
                }
              }
            : undefined
        }
        subtitle={
          isFullyReadOnly || forceViewMode
            ? "View only — you cannot change shipment data."
            : isDocumentationOnly && canEditDocs
              ? "Documentation workspace — operational fields are read-only."
              : isDocumentationOnly
                ? "Documentation workspace — read-only access."
                : isOperationsOnly && canViewDocs
                  ? "Operations workspace — Document tab is read-only."
                  : "Summary and quick navigation below — expand sections as you need them."
        }
        titleAddon={
          <StatusBadge domain="export-bulking" status={data.current_status} visual="pillDetail" />
        }
      />

      {isDocumentationOnly && canEditDocs && (
        <ExportWorkspaceBanner variant="documentation" />
      )}
      {isFullyReadOnly && !forceViewMode && <ExportWorkspaceBanner variant="view-only" />}

      {/* Status workflow stepper */}
      <StatusStepper data={data} onAdvance={handleAdvanceStatus} readOnly={opsReadOnly || forceViewMode} />

      {detailTab === "operations" && (
        <div className={styles.checklistWrap}>
          <ProcessChecklist input={detailToCompletionInput(data)} collapsible defaultExpanded={false} />
        </div>
      )}

      {/* Unsaved changes banner */}
      {!isFullyReadOnly && !forceViewMode && (
        <UnsavedBanner dirtySections={dirtySections} onSaveAll={handleSaveAll} saving={savingAll} />
      )}

      {refreshing && (
        <div className={styles.refreshingBar} role="status" aria-live="polite">
          Syncing latest data…
        </div>
      )}

      {/* Two-column layout */}
      <div
        className={`${styles.pageLayout}${isInfoSidebarOpen ? "" : ` ${styles.pageLayoutSidebarCollapsed}`}`}
      >
        <div className={`${styles.mainContent}${isInfoSidebarOpen ? "" : ` ${styles.mainContentExpanded}`}`}>
          <ShipmentOverviewStrip data={data} showDocCounts={canViewDocs} />

          <SectionJumpNav
            onJump={jumpToSection}
            onJumpAnchor={jumpToAnchor}
            infoSidebarOpen={isInfoSidebarOpen}
            onToggleInfoSidebar={() => setIsInfoSidebarOpen((open) => !open)}
            infoSidebarCollapsedLabel={
              detailTab === "documentation" ? "Summary and documents upload" : "Summary"
            }
            canViewDocs={showDocumentationTab}
            showVoyageNav={!showDocumentationTab || detailTab === "operations"}
            showDocComplianceNav={showDocumentationTab && detailTab === "documentation"}
            dirtySections={dirtySections}
          />

          {showDocumentationTab && (
            <DetailWorkspaceTabs active={detailTab} onChange={handleDetailTabChange} />
          )}

          {(!showDocumentationTab || detailTab === "operations") && (
          <div className={`${styles.stageTimeline} ${opsReadOnly || forceViewMode ? styles.readOnlyRegion : ""}`}>
            {opsReadOnly && canViewDocs && detailTab === "operations" && (
              <ExportWorkspaceBanner variant="operations-readonly" />
            )}

            {/* Shipment Planning */}
            <StageCard
              stageStatus="SHIPMENT_PLANNING"
              currentStatus={data.current_status}
              shipmentData={data}
              title="Shipment Planning"
              icon={<ClipboardList size={16} />}
              readOnly={opsReadOnly || forceViewMode}
              completedSummary={[
                data.vessel_name,
                data.loadport_name,
                resolveShipmentTotalQuantity(data) != null
                  ? `${formatNumericDisplay(resolveShipmentTotalQuantity(data)!)} MT`
                  : null,
              ].filter(Boolean).join(" · ")}
              upcomingFields={["Vessel", "Voyage no.", "Shipper", "Load port"]}
              onAdvance={handleAdvanceStatus}
            >
              <GeneralSection {...sectionProps} open={openSections.general} onToggle={() => toggleSection("general")} />
            </StageCard>

            {/* Nomination */}
            <StageCard
              stageStatus="NOMINATION"
              currentStatus={data.current_status}
              shipmentData={data}
              title="Nomination"
              icon={<CalendarClock size={16} />}
              readOnly={opsReadOnly || forceViewMode}
              completedSummary={[
                data.laycan_from && data.laycan_to ? `Laycan ${formatDate(data.laycan_from)} – ${formatDate(data.laycan_to)}` : null,
                data.eta ? `ETA ${formatDate(data.eta)}` : null,
                data.incoterms ?? null,
              ].filter(Boolean).join(" · ")}
              upcomingFields={["Received nomination", "Laycan", "Est. cargo readiness", "ETA", "Length Over All", "Laytime rate", "Demurrage rate", "Incoterms", "Agent", "Surveyor"]}
              onAdvance={handleAdvanceStatus}
            >
              <NominationSection {...sectionProps} open={openSections.nomination} onToggle={() => toggleSection("nomination")} />
            </StageCard>

            {/* Arrival */}
            <StageCard
              stageStatus="ARRIVAL"
              currentStatus={data.current_status}
              shipmentData={data}
              title="Arrival"
              icon={<Anchor size={16} />}
              readOnly={opsReadOnly || forceViewMode}
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
              readOnly={opsReadOnly || forceViewMode}
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
              readOnly={opsReadOnly || forceViewMode}
              completedSummary={[
                data.commence_loading ? `Started ${formatDatetime(data.commence_loading)}` : null,
                data.atc ? `ATC ${formatDatetime(data.atc)}` : null,
                data.npe_date ? `NPE ${formatDatetime(data.npe_date)}` : null,
                (() => {
                  const totalBl = data.cargo_lines.reduce((sum, c) => sum + (c.bl_figure ?? 0), 0);
                  return totalBl > 0 ? `B/L ${formatNumericDisplay(totalBl)} MT` : null;
                })(),
              ].filter(Boolean).join(" · ")}
              upcomingFields={["Commence loading", "ETC", "ATC", "Hose On (liquid)", "Hose Off", "NPE Date", "Qty reconciliation per cargo"]}
              onAdvance={handleAdvanceStatus}
            >
              <LoadingSection
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
              readOnly={opsReadOnly || forceViewMode}
              completedSummary={[
                data.td ? `Departed ${formatDatetime(data.td)}` : null,
                (() => {
                  const ls = calcActualLaytimeStart(data.ata, data.atb, data.nor, data.laycan_from, data.laycan_to);
                  const le = calcActualLaytimeEnd(ls, resolveShipmentTotalQuantity(data), data.laytime_rate_mtph);
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
          )}

          {showDocumentationTab && detailTab === "documentation" && (
            <div className={styles.stageTimeline}>
              {docsReadOnly && canEditOps && (
                <ExportWorkspaceBanner variant="documentation-readonly" />
              )}
              {isDocumentationOnly && !canEditDocs && (
                <ExportWorkspaceBanner variant="view-only" />
              )}

              {/* Overall documentation progress across all 4 steps */}
              <DocProgressBar data={data} />

              {/* Step 1 — Pre-shipment Documents */}
              {(() => {
                const progress = buildDocumentationProgress(data);
                const step1 = progress.steps.find((s) => s.key === "preShipment");
                return (
                  <DocStepCard
                    stepNumber={1}
                    title="Pre-shipment Documents"
                    doneCount={step1?.doneCount ?? 0}
                    totalCount={step1?.totalCount ?? 4}
                  >
                    <div className={cargoReadOnly ? styles.readOnlyRegion : undefined}>
                      <div className={styles.docStepSections}>
                        <CargoSection {...sectionProps} open={openSections.cargo} onToggle={() => toggleSection("cargo")} />
                        <div className={docsReadOnly || forceViewMode ? styles.readOnlyRegion : undefined}>
                          <SiReceiveDateSection
                            {...sectionProps}
                            open={openSections.siReceiveDate}
                            onToggle={() => toggleSection("siReceiveDate")}
                          />
                          <SISection {...sectionProps} open={openSections.si} onToggle={() => toggleSection("si")} />
                          <InvoiceSection {...sectionProps} open={openSections.invoices} onToggle={() => toggleSection("invoices")} />
                          <PackingListSection {...sectionProps} open={openSections.packing} onToggle={() => toggleSection("packing")} />
                        </div>
                      </div>
                    </div>
                  </DocStepCard>
                );
              })()}

              {/* Steps 2, 3, 4 */}
              <div className={docsReadOnly || forceViewMode ? styles.readOnlyRegion : undefined}>
                <DocumentationDetailSections
                  sectionProps={sectionProps}
                  openSections={openSections}
                  toggleSection={toggleSection}
                  billingOcrDisabled={docsReadOnly || forceViewMode}
                />
              </div>
            </div>
          )}
        </div>

        <aside
          className={`${styles.detailSidebarAside}${isInfoSidebarOpen ? "" : ` ${styles.detailSidebarAsideCollapsed}`}`}
          aria-hidden={!isInfoSidebarOpen}
        >
          <div id="export-bulking-detail-info-panel" className={styles.detailSidebarInner}>
            <div className={styles.sidebarContent}>
              <SummarySidebar data={data} showDocDetails={canViewDocs} />
              {showDocumentationTab && detailTab === "documentation" ? (
                accessToken ? (
                  <ExportBulkingDocumentsSection
                    shipmentId={id!}
                    accessToken={accessToken}
                    canUpload={canUploadExportDocs && !docsReadOnly && !forceViewMode}
                    cargoLines={data.cargo_lines}
                  />
                ) : null
              ) : (
                <DemurrageSimulationSidebar data={data} />
              )}
              <StatusHistorySidebar events={statusEvents} currentStatus={data.current_status} />
            </div>
          </div>
        </aside>
      </div>

      <ActivityLogRibbon
        panelId="export-bulking-activity-panel"
        open={activityPanelOpen}
        loading={activityLoading}
        error={activityError}
        items={activityItems}
        onOpen={openActivityPanel}
        onClose={closeActivityPanel}
        typeLabel={exportBulkingActivityTypeLabel}
        visible={!!data && !loading}
      />
    </div>
  );
}
