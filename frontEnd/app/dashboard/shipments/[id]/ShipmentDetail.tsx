"use client";

import { useEffect, useState, useCallback, useMemo, useId, type DragEvent } from "react";
import type { Dispatch, SetStateAction } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import {
  getShipmentDetail,
  getShipmentTimeline,
  getShipmentStatusSummary,
  getShipmentActivityLog,
  updateShipmentStatus,
  updateShipment,
  softDeleteShipment,
  couplePo,
  decouplePo,
  updateShipmentPoMapping,
  updateShipmentPoLines,
  listShipmentBids,
  listRecentShipmentForwarders,
  createShipmentBid,
  updateShipmentBid,
  deleteShipmentBid,
  uploadShipmentBidQuotation,
  listShipmentNotes,
  createShipmentNote,
  listShipmentDocuments,
  uploadShipmentDocument,
  deleteShipmentDocument,
} from "@/services/shipments-service";
import { getPoDetail, lookupPoByPoNumber } from "@/services/po-service";
import { Card } from "@/components/cards";
import { Badge } from "@/components/badges";
import { Timeline } from "@/components/timeline";
import { PageHeader } from "@/components/navigation";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeaderCell,
} from "@/components/tables";
import { Button, ComboboxSelect } from "@/components/forms";
import { useToast } from "@/components/providers/ToastProvider";
import { ShipmentNoteMentionTextarea } from "@/components/shipments/ShipmentNoteMentionTextarea";
import { renderNoteWithMentions } from "@/lib/render-note-mentions";
import { DutyFormulaInfoIcon } from "@/components/icons/DutyFormulaInfoIcon";
import { ActivityLogRibbonIcon } from "@/components/icons/ActivityLogRibbonIcon";
import { statusToBadgeVariant, formatStatusLabel } from "@/lib/status-badge";
import {
  formatDecimal,
  formatPoUnitPrice,
  formatPriceInputWithCommas,
  roundTo2Decimals,
  stripCommaThousands,
} from "@/lib/format-number";
import {
  formatPoLineQtyDisplay,
  parseDeliveredQtyInput,
  deliveredQtyToInputString,
  projectedRemainingQtyForShipmentLine,
} from "@/lib/po-line-qty";
import { isApiError } from "@/types/api";
import {
  getMissingRequiredFields,
  getMissingRequiredDocuments,
  getRequiredDocsForTransition,
  getRequiredFieldsForTransition,
  getFieldLabel,
  getApplicableStatuses,
  isShipmentMethodSea,
  INCOTERMS_WITH_BIDDING_TRANSPORTER,
} from "@/lib/shipment-status-requirements";
import type { TimelineItem as TimelineItemType, TimelineItemVariant } from "@/components/timeline";
import type {
  ShipmentDetail as ShipmentDetailType,
  ShipmentTimelineEntry,
  ShipmentBid,
  RecentForwarderBid,
  LinkedPoSummary,
  ShipmentNote,
  ShipmentActivityItem,
  ShipmentDocumentListItem,
  FreightChargeCurrency,
} from "@/types/shipments";
import type { PoDetail, PoItemSummary } from "@/types/po";
import { config } from "@/lib/config";
import { getCountryOptions } from "@/lib/countries";
import { getVisibleShipmentDocumentSlots } from "@/lib/shipment-document-slots";
import {
  canUploadPO,
  isPOUploaded,
  getShipmentDocumentUploadBlockReason,
  getShipmentDocUploadButtonTitle,
  documentRestrictionToastMessage,
  type DocumentUploadBlockReason,
} from "@/lib/shipment-document-prerequisites";
import { Lock } from "lucide-react";
import { parseYesNoSelectValue, formatYesNoOrLegacy } from "@/lib/yes-no-field";
import { can } from "@/lib/permissions";
import {
  PRODUCT_CLASSIFICATION_OPTIONS,
  displayProductClassification,
  normalizeProductClassificationForEdit,
} from "@/lib/product-classification";
import styles from "./ShipmentDetail.module.css";
import { formatDayMonthYear } from "@/lib/format-date";
import { displayPibTypeLabel, normalizePibTypeForEdit, isPibTypeBc23 } from "@/lib/pib-type-label";

/** Destination port country is fixed for this product. */
const DESTINATION_PORT_COUNTRY = "Indonesia";

/** Select value: choose a bid/recent row or free-text "Other" for Forwarder / liner. */
const FORWARDER_LINER_PICK_OTHER = "__forwarder_liner_other__";

function normalizeBidShipViaToShipmentMethod(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  const u = t.toUpperCase();
  if (u === "SEA") return "Sea";
  if (u === "AIR") return "Air";
  return t;
}
function docKeyForDocumentType(documentType: string): string | null {
  switch (documentType) {
    case "PO":
      return "doc:po";
    case "INVOICE":
      return "doc:commercial_invoice";
    case "PACKING_LIST":
      return "doc:packing_list";
    case "BL":
      return "doc:bl";
    case "PIB_BC":
      return "doc:pib_bc";
    case "SPPB":
      return "doc:sppb";
    case "VO":
      return "doc:vo";
    default:
      return null;
  }
}

const SHIPMENT_STATUSES = [
  "INITIATE_SHIPPING_DOCUMENT",
  "BIDDING_TRANSPORTER",
  "TRANSPORT_CONFIRMED",
  "READY_PICKUP",
  "PICKED_UP",
  "ON_SHIPMENT",
  "CUSTOMS_CLEARANCE",
  "DELIVERED",
];

const DUTY_FORMULA_PDRI = "PDRI = BM + PPN + PPH.";

function formatDocumentBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type ShipmentDocIntakeFilter =
  | { kind: "shipment_level" }
  | { kind: "intake"; intakeId: string };

/**
 * Shipment-level docs have no intake_id except legacy packing rows (shown in one Packing List bucket).
 * Commercial Invoice (INVOICE): one bucket; legacy rows may have status DRAFT/FINAL or null.
 * Bill of Lading (BL): single bucket (rows may have legacy status DRAFT/FINAL/null).
 */
function filterShipmentDocumentsBySlot(
  docs: ShipmentDocumentListItem[],
  documentType: string,
  status: string | null,
  intake: ShipmentDocIntakeFilter = { kind: "shipment_level" }
): ShipmentDocumentListItem[] {
  return docs.filter((d) => {
    if (d.document_type !== documentType) return false;

    if (documentType === "PACKING_LIST") {
      if (status == null ? d.status != null : d.status !== status) return false;
      return true;
    }

    if (documentType === "INVOICE" && status == null && intake.kind === "shipment_level") {
      const legacyInv =
        d.status == null || d.status === "DRAFT" || d.status === "FINAL";
      if (!legacyInv) return false;
      return d.intake_id == null;
    }

    if (documentType === "BL" && status == null && intake.kind === "shipment_level") {
      const legacyBl =
        d.status == null || d.status === "DRAFT" || d.status === "FINAL";
      if (!legacyBl) return false;
      return d.intake_id == null;
    }

    if (status == null ? d.status != null : d.status !== status) return false;
    if (intake.kind === "shipment_level") return d.intake_id == null;
    return d.intake_id === intake.intakeId;
  });
}

function activityTypeLabel(type: ShipmentActivityItem["type"]): string {
  switch (type) {
    case "shipment_created":
      return "Created";
    case "status_change":
      return "Status";
    case "note":
      return "Note";
    case "couple_po":
      return "PO grouped";
    case "decouple_po":
      return "PO removed";
    case "shipment_updated":
      return "Update";
    default:
      return "Activity";
  }
}

function renderActivityValue(value: string | null | undefined): string {
  if (value == null) return "—";
  const trimmed = value.trim();
  return trimmed === "" ? "—" : trimmed;
}

function resolvePoCurrencyCode(linkedPo: LinkedPoSummary, poDetailLoaded: PoDetail | undefined): string | null {
  const fromPo = poDetailLoaded?.currency?.trim();
  if (fromPo) return fromPo;
  return linkedPo.currency?.trim() || null;
}

function isCurrencyIdr(currency: string | null | undefined): boolean {
  const c = (currency ?? "").trim().toUpperCase();
  return c === "IDR" || c === "RP";
}

function getCurrencySymbol(currency: string | null | undefined): string {
  const c = (currency ?? "").trim().toUpperCase();
  if (c === "USD") return "$";
  if (c === "IDR" || c === "RP") return "Rp ";
  if (c === "EUR") return "€";
  if (c === "GBP") return "£";
  if (c === "JPY") return "¥";
  return c ? `${c} ` : "";
}

function displayPoField(value: string | null | undefined): string {
  return value != null && String(value).trim() !== "" ? String(value).trim() : "—";
}

function hasValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return value;
  return true;
}

function normalizeDecimalInput(raw: string): string {
  // Enforce dot-decimal input; commas are normalized out.
  return raw.replace(/,/g, ".");
}

/** Parse PO-style amount input (comma thousands, dot decimal). */
function parseCommaFormattedDecimal(raw: string): number | undefined {
  const t = stripCommaThousands(raw).trim();
  if (t === "" || t === ".") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** PPN/PPH total (IDR): free-text; empty → 0; invalid → null. */
function parseDutyTotalAmountInput(raw: string): number | null {
  const t = stripCommaThousands(raw.trim());
  if (t === "") return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return roundTo2Decimals(n);
}

function localTodayYmd(): string {
  const n = new Date();
  const y = n.getFullYear();
  const mo = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/** Legacy: first run of digits in stored duration text (e.g. "5 days" → "5"). */
function parseDurationDaysDigits(stored: string | null | undefined): string {
  if (stored == null || String(stored).trim() === "") return "";
  const m = String(stored).match(/(\d+)/);
  return m?.[1] ?? "";
}

function getForwarderQuotationExpiryMeta(
  quotationExpiresAtYmd: string | null | undefined,
  duration: string | null | undefined,
  updatedAtIso: string
): { expiresAt: Date | null; isValidNow: boolean } {
  const ymd = quotationExpiresAtYmd?.trim();
  if (ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const today = localTodayYmd();
    const isValidNow = today <= ymd;
    const expiresAt = new Date(`${ymd}T23:59:59.999`);
    return { expiresAt: Number.isNaN(expiresAt.getTime()) ? null : expiresAt, isValidNow };
  }
  const d = parseDurationDaysDigits(duration);
  const days = Number(d);
  if (!Number.isFinite(days) || days <= 0) {
    return { expiresAt: null, isValidNow: true };
  }
  const updatedAt = new Date(updatedAtIso);
  if (Number.isNaN(updatedAt.getTime())) {
    return { expiresAt: null, isValidNow: true };
  }
  const expiresAt = new Date(updatedAt.getTime() + days * 24 * 60 * 60 * 1000);
  return { expiresAt, isValidNow: Date.now() <= expiresAt.getTime() };
}

function formatRupiah(value: number | null | undefined): string {
  return `Rp ${formatDecimal(value ?? 0)}`;
}

function formatFreightChargeLine(amount: number | null | undefined, currency: FreightChargeCurrency): string {
  if (amount == null) return "—";
  const n = formatDecimal(amount);
  return currency === "USD" ? `$${n}` : `Rp ${n}`;
}

type PoLineItemsEditorBlockProps = {
  po: LinkedPoSummary;
  poDetail: PoDetail | undefined;
  items: PoItemSummary[];
  intakeId: string;
  isExpanded: boolean;
  poEditReceivedQtyByIntake: Record<string, Record<string, string>>;
  setPoEditReceivedQtyByIntake: Dispatch<SetStateAction<Record<string, Record<string, string>>>>;
  poEditDutyPctByIntake: Record<string, Record<string, { bm: string; ppn: string; pph: string }>>;
  setPoEditDutyPctByIntake: Dispatch<
    SetStateAction<Record<string, Record<string, { bm: string; ppn: string; pph: string }>>>
  >;
  dutyCalculationSkipped: boolean;
  /** Editable only during “Update shipment” (draft on client until Save). */
  canEditPoLineFields: boolean;
  /** True while header Save is persisting shipment + linked PO data. */
  savingShipmentEdits: boolean;
  tableClassName: string;
  tableWrapperClassName?: string;
};

function PoLineItemsEditorBlock({
  po,
  poDetail,
  items,
  intakeId,
  isExpanded,
  poEditReceivedQtyByIntake,
  setPoEditReceivedQtyByIntake,
  poEditDutyPctByIntake,
  setPoEditDutyPctByIntake,
  dutyCalculationSkipped,
  canEditPoLineFields,
  savingShipmentEdits,
  tableClassName,
  tableWrapperClassName,
}: PoLineItemsEditorBlockProps) {
  const poDraftReceivedQty = poEditReceivedQtyByIntake[intakeId] ?? {};
  const poDraftDuty = poEditDutyPctByIntake[intakeId] ?? {};
  const currencyCode = resolvePoCurrencyCode(po, poDetail);
  const currencySymbol = getCurrencySymbol(currencyCode);
  const lineReceivedByItemId = useMemo(() => {
    const map = new Map<string, number>();
    (po.line_received ?? []).forEach((line) => {
      map.set(line.item_id, line.received_qty ?? 0);
    });
    return map;
  }, [po.line_received]);
  const computedTotalAmount = useMemo(
    () =>
      items.reduce((sum, item) => {
        const unitPrice = Number(item.value ?? 0);
        const savedThisShipmentQty = lineReceivedByItemId.get(item.id) ?? 0;
        const draftReceivedQty = poDraftReceivedQty[item.id];
        const deliveredQty =
          canEditPoLineFields && isExpanded
            ? parseDeliveredQtyInput(draftReceivedQty ?? deliveredQtyToInputString(savedThisShipmentQty))
            : savedThisShipmentQty;
        return sum + (Number.isFinite(unitPrice) ? unitPrice : 0) * deliveredQty;
      }, 0),
    [items, lineReceivedByItemId, isExpanded, poDraftReceivedQty, canEditPoLineFields]
  );
  return (
    <>
      <div className={styles.poItemsTableScrollSurface}>
        <Table className={tableClassName} wrapperClassName={tableWrapperClassName}>
          <TableHead>
            <TableRow>
              <TableHeaderCell className={styles.poItemColDesc}>Items</TableHeaderCell>
              <TableHeaderCell className={styles.poItemColNum}>
                {canEditPoLineFields ? "PO qty" : "Qty"}
              </TableHeaderCell>
              <TableHeaderCell className={styles.poItemColRecv}>Qty delivered</TableHeaderCell>
              <TableHeaderCell className={styles.poItemColPct}>BM %</TableHeaderCell>
              <TableHeaderCell className={styles.poItemColPct}>PPN %</TableHeaderCell>
              <TableHeaderCell className={styles.poItemColPct}>PPH %</TableHeaderCell>
              <TableHeaderCell className={styles.poItemColNum}>Remaining qty</TableHeaderCell>
              <TableHeaderCell className={styles.poItemColUnit}>Unit</TableHeaderCell>
              <TableHeaderCell className={styles.poItemColNum}>
                {canEditPoLineFields ? "PO unit price" : "Price per unit"}
              </TableHeaderCell>
              <TableHeaderCell className={styles.poItemColAmt}>Total amount</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => {
              const savedThisShipmentQty = lineReceivedByItemId.get(item.id) ?? 0;
              const draftReceivedQty = poDraftReceivedQty[item.id];
              const receivedQty =
                canEditPoLineFields && isExpanded
                  ? (draftReceivedQty ?? deliveredQtyToInputString(savedThisShipmentQty))
                  : deliveredQtyToInputString(savedThisShipmentQty);
              const deliveredQty =
                canEditPoLineFields && isExpanded ? parseDeliveredQtyInput(receivedQty) : savedThisShipmentQty;
              const remainingQty = projectedRemainingQtyForShipmentLine(item, savedThisShipmentQty, deliveredQty);
              const unitPrice = Number(item.value ?? 0);
              const amount = (Number.isFinite(unitPrice) ? unitPrice : 0) * deliveredQty;
              const savedLine = po.line_received?.find((l) => l.item_id === item.id);
              const pctReadonly = (n: number | null | undefined) =>
                n != null && Number.isFinite(Number(n)) ? `${formatDecimal(Number(n))}%` : "—";
              const dutyRow = poDraftDuty[item.id];
              const pctInput = (key: "bm" | "ppn" | "pph", aria: string) => {
                if (dutyCalculationSkipped) return <span className={styles.poItemPctReadonly}>—</span>;
                if (canEditPoLineFields && isExpanded) {
                  return (
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      className={`${styles.input} ${styles.poItemPctInput}`}
                      value={dutyRow?.[key] ?? ""}
                      onChange={(e) =>
                        setPoEditDutyPctByIntake((prev) => {
                          const curIntake = prev[intakeId] ?? {};
                          const curRow = curIntake[item.id] ?? { bm: "", ppn: "", pph: "" };
                          const nextVal = formatPriceInputWithCommas(e.target.value, 2);
                          return {
                            ...prev,
                            [intakeId]: {
                              ...curIntake,
                              [item.id]: {
                                bm: key === "bm" ? nextVal : curRow.bm,
                                ppn: key === "ppn" ? nextVal : curRow.ppn,
                                pph: key === "pph" ? nextVal : curRow.pph,
                              },
                            },
                          };
                        })
                      }
                      placeholder="0"
                      disabled={savingShipmentEdits}
                      aria-label={aria}
                    />
                  );
                }
                const v =
                  key === "bm"
                    ? savedLine?.bm_percentage
                    : key === "ppn"
                      ? savedLine?.ppn_percentage
                      : savedLine?.pph_percentage;
                return <span className={styles.poItemPctReadonly}>{pctReadonly(v)}</span>;
              };
              return (
                <TableRow key={item.id}>
                  <TableCell className={styles.poItemColDesc}>{displayPoField(item.item_description)}</TableCell>
                  <TableCell className={styles.poItemColNum}>{formatPoLineQtyDisplay(item.qty)}</TableCell>
                  <TableCell className={styles.poItemColRecv}>
                    {canEditPoLineFields ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        className={`${styles.input} ${styles.poItemRecvInput}`}
                        value={receivedQty}
                        onChange={(e) =>
                          setPoEditReceivedQtyByIntake((prev) => ({
                            ...prev,
                            [intakeId]: {
                              ...(prev[intakeId] ?? {}),
                              [item.id]: formatPriceInputWithCommas(e.target.value),
                            },
                          }))
                        }
                        placeholder="0.00"
                        disabled={savingShipmentEdits}
                        aria-label="Qty delivered"
                      />
                    ) : (
                      <span className={styles.poItemRecvReadonly}>{formatPoLineQtyDisplay(savedThisShipmentQty)}</span>
                    )}
                  </TableCell>
                  <TableCell className={styles.poItemColPct}>{pctInput("bm", "BM percent")}</TableCell>
                  <TableCell className={styles.poItemColPct}>{pctInput("ppn", "PPN percent")}</TableCell>
                  <TableCell className={styles.poItemColPct}>{pctInput("pph", "PPH percent")}</TableCell>
                  <TableCell className={styles.poItemColNum}>
                    {remainingQty != null ? formatPoLineQtyDisplay(remainingQty) : "—"}
                  </TableCell>
                  <TableCell className={styles.poItemColUnit}>{displayPoField(item.unit)}</TableCell>
                  <TableCell className={styles.poItemColNum}>
                    {item.value != null ? `${currencySymbol}${formatPoUnitPrice(item.value)}` : "—"}
                  </TableCell>
                  <TableCell className={`${styles.poItemColAmt} ${styles.poItemAmtCell}`}>
                    {`${currencySymbol}${formatDecimal(amount)}`}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className={styles.poDetailTotal}>
        <span className={styles.poDetailTotalLabel}>Total amount</span>
        <span className={styles.poDetailTotalValue}>
          {getCurrencySymbol(currencyCode)}
          {formatDecimal(computedTotalAmount)}
        </span>
      </div>
    </>
  );
}

function DutyFormulaHint({ text }: { text: string }) {
  return (
    <span className={styles.dutyFormulaWrap}>
      <button type="button" className={styles.dutyFormulaTrigger} aria-label="Show calculation formula">
        <DutyFormulaInfoIcon />
      </button>
      <span className={styles.dutyFormulaTooltip} role="tooltip">
        {text}
      </span>
    </span>
  );
}

const SHIPMENT_DOC_FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,image/*";

/** Matches `accept` on the file input (PDF, Word, Excel, images). */
function isAcceptedShipmentDocFile(file: File): boolean {
  const n = file.name.toLowerCase();
  if (n.endsWith(".pdf") || n.endsWith(".doc") || n.endsWith(".docx") || n.endsWith(".xls") || n.endsWith(".xlsx")) {
    return true;
  }
  const t = (file.type ?? "").toLowerCase();
  return t.startsWith("image/");
}

/**
 * Native label → file input (htmlFor). Avoids programmatic input.click(), which many browsers block
 * in embedded / cloud contexts (iframe, strict CSP-adjacent policies) while local top-level dev still works.
 */
function ShipmentDocUploadControl({
  disabled,
  isUploading,
  onFile,
  labelTitle,
  buttonLabel = "Upload",
}: {
  disabled: boolean;
  isUploading: boolean;
  onFile: (file: File) => void;
  /** Shown on hover when disabled (native tooltip). */
  labelTitle?: string;
  buttonLabel?: string;
}) {
  const inputId = useId();
  return (
    <span className={styles.shipmentDocUploadWrap}>
      <input
        id={inputId}
        type="file"
        className={styles.shipmentDocFileInputHidden}
        accept={SHIPMENT_DOC_FILE_ACCEPT}
        disabled={disabled}
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <label
        htmlFor={inputId}
        title={labelTitle}
        className={[styles.shipmentDocUploadBtn, disabled ? styles.shipmentDocUploadBtnDisabled : ""].filter(Boolean).join(" ")}
        aria-disabled={disabled}
      >
        {isUploading ? "Uploading…" : buttonLabel}
      </label>
    </span>
  );
}

function ShipmentDocDropZone({
  className,
  blockReason,
  canAct,
  onToastRestricted,
  onFile,
  showDropHint,
  children,
}: {
  className?: string;
  blockReason: DocumentUploadBlockReason | null;
  canAct: boolean;
  onToastRestricted: (reason: DocumentUploadBlockReason) => void;
  onFile: (file: File) => void;
  /** Show helper text when this slot can accept drops. */
  showDropHint?: boolean;
  children: React.ReactNode;
}) {
  const [dragDepth, setDragDepth] = useState(0);
  const allowDropVisual = canAct && !blockReason;

  const resetDragDepth = useCallback(() => {
    setDragDepth(0);
  }, []);

  useEffect(() => {
    const onWindowDragEnd = () => resetDragDepth();
    window.addEventListener("dragend", onWindowDragEnd);
    return () => window.removeEventListener("dragend", onWindowDragEnd);
  }, [resetDragDepth]);

  const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!allowDropVisual) return;
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    setDragDepth((d) => d + 1);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!allowDropVisual) return;
    const next = e.currentTarget;
    const rel = e.relatedTarget as Node | null;
    if (rel && next.contains(rel)) return;
    setDragDepth((d) => Math.max(0, d - 1));
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canAct || blockReason) e.dataTransfer.dropEffect = "none";
    else e.dataTransfer.dropEffect = "copy";
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    resetDragDepth();
    if (!canAct) return;
    if (blockReason) {
      onToastRestricted(blockReason);
      return;
    }
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  const rootClass = [
    className,
    styles.shipmentDocDropZone,
    allowDropVisual && dragDepth > 0 ? styles.shipmentDocDropZoneDragging : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rootClass}
      role="region"
      aria-label="Document upload"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {children}
      {showDropHint && allowDropVisual ? (
        <p className={styles.shipmentDocDropHint}>Drag and drop a file here, or use Upload.</p>
      ) : null}
    </div>
  );
}

export function ShipmentDetail({ id }: { id: string }) {
  const router = useRouter();
  const { user, accessToken } = useAuth();
  const { pushToast } = useToast();
  /** Matches backend PUT/PATCH shipment, bids, PO mapping/lines, doc delete, POST notes. */
  const canEditShipment = can(user, "UPDATE_SHIPMENT");
  const canUploadDocument = can(user, "UPLOAD_DOCUMENT");
  const canUpdateStatus = can(user, "UPDATE_STATUS");
  const canCoupleDecouplePo = can(user, "COUPLE_DECOUPLE_PO");
  const [detail, setDetail] = useState<ShipmentDetailType | null>(null);
  const [timeline, setTimeline] = useState<ShipmentTimelineEntry[]>([]);
  const [statusSummary, setStatusSummary] = useState<{ current_status: string; last_updated_at?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [remarks, setRemarks] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [coupleModal, setCoupleModal] = useState(false);
  const [coupleModalError, setCoupleModalError] = useState<string | null>(null);
  const [coupleIntakeIds, setCoupleIntakeIds] = useState("");
  const [coupling, setCoupling] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingShipment, setDeletingShipment] = useState(false);
  const [decouplingId, setDecouplingId] = useState<string | null>(null);
  const [expandedPoIds, setExpandedPoIds] = useState<string[]>([]);
  const [activePoOverlayId, setActivePoOverlayId] = useState<string | null>(null);
  const [poDetailsCache, setPoDetailsCache] = useState<Record<string, PoDetail>>({});
  const [loadingPoId, setLoadingPoId] = useState<string | null>(null);
  const [shipmentNotes, setShipmentNotes] = useState<ShipmentNote[]>([]);
  const [shipmentDocuments, setShipmentDocuments] = useState<ShipmentDocumentListItem[]>([]);
  const [uploadingDocSlotKey, setUploadingDocSlotKey] = useState<string | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [isUpdatingShipment, setIsUpdatingShipment] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [editVendorName, setEditVendorName] = useState("");
  const [editForwarderName, setEditForwarderName] = useState("");
  /** Bidding incoterms: `bid:<id>`, `recent:<i>`, FORWARDER_LINER_PICK_OTHER, or "". */
  const [editForwarderPick, setEditForwarderPick] = useState("");
  const [editWarehouseName, setEditWarehouseName] = useState("");
  const [editIncoterm, setEditIncoterm] = useState("");
  const [editKawasanBerikat, setEditKawasanBerikat] = useState<"" | "Yes" | "No">("");
  const [editSurveyor, setEditSurveyor] = useState<"" | "Yes" | "No">("");
  const [editShipmentMethod, setEditShipmentMethod] = useState("");
  const [editShipBy, setEditShipBy] = useState("");
  const [editProductClassification, setEditProductClassification] = useState("");
  const [editPibType, setEditPibType] = useState("");
  const [editNoRequestPib, setEditNoRequestPib] = useState("");
  const [editPpjkMkl, setEditPpjkMkl] = useState("");
  const [editNopen, setEditNopen] = useState("");
  const [editNopenDate, setEditNopenDate] = useState("");
  const [editBlAwb, setEditBlAwb] = useState("");
  const [editInsuranceNo, setEditInsuranceNo] = useState("");
  const [editCoo, setEditCoo] = useState("");
  const [editOriginPortName, setEditOriginPortName] = useState("");
  const [editOriginPortCountry, setEditOriginPortCountry] = useState("");
  const [editEtd, setEditEtd] = useState("");
  const [editAtd, setEditAtd] = useState("");
  const [editDestinationPortName, setEditDestinationPortName] = useState("");
  const [editEta, setEditEta] = useState("");
  const [editAta, setEditAta] = useState("");
  const [editDepo, setEditDepo] = useState<"" | "yes" | "no">("");
  const [editDepoLocation, setEditDepoLocation] = useState("");
  const [editUnit20ft, setEditUnit20ft] = useState(false);
  const [editUnit40ft, setEditUnit40ft] = useState(false);
  const [editUnitPackage, setEditUnitPackage] = useState(false);
  const [editUnit20IsoTank, setEditUnit20IsoTank] = useState(false);
  const [editContainerCount20ft, setEditContainerCount20ft] = useState("");
  const [editContainerCount40ft, setEditContainerCount40ft] = useState("");
  const [editPackageCount, setEditPackageCount] = useState("");
  const [editContainerCount20IsoTank, setEditContainerCount20IsoTank] = useState("");
  const [editIncotermAmount, setEditIncotermAmount] = useState("");
  const [editIncotermCurrency, setEditIncotermCurrency] = useState<FreightChargeCurrency>("IDR");
  const [editBmTotal, setEditBmTotal] = useState("");
  const [editPpnTotal, setEditPpnTotal] = useState("");
  const [editPphTotal, setEditPphTotal] = useState("");
  const [editCbm, setEditCbm] = useState("");
  const [editNetWeightMt, setEditNetWeightMt] = useState("");
  const [editGrossWeightMt, setEditGrossWeightMt] = useState("");
  const [editClosedAt, setEditClosedAt] = useState("");
  const [bids, setBids] = useState<ShipmentBid[]>([]);
  const [loadingBids, setLoadingBids] = useState(false);
  const [recentForwarders, setRecentForwarders] = useState<RecentForwarderBid[]>([]);
  const [loadingRecentForwarders, setLoadingRecentForwarders] = useState(false);
  const [bidForwarder, setBidForwarder] = useState("");
  const [bidServiceAmount, setBidServiceAmount] = useState("");
  const [bidServiceCurrency, setBidServiceCurrency] = useState<FreightChargeCurrency>("IDR");
  const [bidQuotationExpiresAt, setBidQuotationExpiresAt] = useState("");
  const [bidDestinationPort, setBidDestinationPort] = useState("");
  const [bidShipVia, setBidShipVia] = useState("");
  const [addingBid, setAddingBid] = useState(false);
  const [editingBidId, setEditingBidId] = useState<string | null>(null);
  const [editBidForwarder, setEditBidForwarder] = useState("");
  const [editBidServiceAmount, setEditBidServiceAmount] = useState("");
  const [editBidServiceCurrency, setEditBidServiceCurrency] = useState<FreightChargeCurrency>("IDR");
  const [editBidQuotationExpiresAt, setEditBidQuotationExpiresAt] = useState("");
  const [editBidDestinationPort, setEditBidDestinationPort] = useState("");
  const [editBidShipVia, setEditBidShipVia] = useState("");
  const [uploadingQuotationForBidId, setUploadingQuotationForBidId] = useState<string | null>(null);
  const [applyingRecentForwarderKey, setApplyingRecentForwarderKey] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<"details" | "forwarder-bidding">("details");
  /** EXW/FCA/FOB: edit state for origin on Details (Pre Shipment); same values persist via Save shipment. */
  const [biddingLaneCountry, setBiddingLaneCountry] = useState("");
  const [biddingLanePort, setBiddingLanePort] = useState("");
  const [debouncedLaneCountry, setDebouncedLaneCountry] = useState("");
  const [poEditInvoiceNoByIntake, setPoEditInvoiceNoByIntake] = useState<Record<string, string>>({});
  const [poEditCurrencyRateByIntake, setPoEditCurrencyRateByIntake] = useState<Record<string, string>>({});
  const [poEditReceivedQtyByIntake, setPoEditReceivedQtyByIntake] = useState<Record<string, Record<string, string>>>(
    {}
  );
  const [poEditDutyPctByIntake, setPoEditDutyPctByIntake] = useState<
    Record<string, Record<string, { bm: string; ppn: string; pph: string }>>
  >({});
  /** Full-bleed width for the linked PO line-items table only (invoice/rate rows stay normal). */
  const [poLineItemsWide, setPoLineItemsWide] = useState(false);

  /** Block shipment document upload/delete when status is DELIVERED (not based on closed/delivered date alone). */
  const shipmentDocumentsLockedByDeliveredStatus = detail?.current_status === "DELIVERED";

  const load = useCallback(() => {
    if (!accessToken || !id) return;
    setLoading(true);
    setError(null);
    Promise.all([
      getShipmentDetail(id, accessToken),
      getShipmentTimeline(id, accessToken),
      getShipmentStatusSummary(id, accessToken),
      listShipmentNotes(id, accessToken),
      listShipmentDocuments(id, accessToken),
    ])
      .then(([detailRes, timelineRes, summaryRes, notesRes, documentsRes]) => {
        if (isApiError(detailRes)) {
          setError(detailRes.message);
          return;
        }
        setDetail(detailRes.data ?? null);
        if (!isApiError(timelineRes)) setTimeline(timelineRes.data ?? []);
        if (!isApiError(summaryRes)) setStatusSummary(summaryRes.data ?? null);
        if (!isApiError(notesRes) && notesRes.data) setShipmentNotes(notesRes.data);
        else setShipmentNotes([]);
        if (!isApiError(documentsRes) && Array.isArray(documentsRes.data)) setShipmentDocuments(documentsRes.data);
        else setShipmentDocuments([]);
      })
      .catch(() => setError("Failed to load shipment"))
      .finally(() => setLoading(false));
  }, [accessToken, id]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Incoterm that drives workflow UI (bidding tab, origin lane vs free-text, bid loading) and must match
   * `detailForStatusValidation` / status rules. Uses draft incoterm while Update shipment is open.
   */
  const workflowIncoterm = useMemo(() => {
    if (!detail) return null;
    if (isUpdatingShipment) return editIncoterm.trim() || detail.incoterm || null;
    return detail.incoterm;
  }, [detail, isUpdatingShipment, editIncoterm]);

  const hasBiddingStep = useMemo(() => {
    const n = (workflowIncoterm ?? "").trim().toUpperCase();
    return INCOTERMS_WITH_BIDDING_TRANSPORTER.includes(n as (typeof INCOTERMS_WITH_BIDDING_TRANSPORTER)[number]);
  }, [workflowIncoterm]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedLaneCountry(biddingLaneCountry.trim()), 400);
    return () => window.clearTimeout(t);
  }, [biddingLaneCountry]);

  useEffect(() => {
    if (!detail || !hasBiddingStep) return;
    setBiddingLaneCountry(detail.origin_port_country ?? "");
    setBiddingLanePort(detail.origin_port_name ?? "");
  }, [detail?.id, detail?.origin_port_country, detail?.origin_port_name, hasBiddingStep]);

  const hasForwarderNamesOnShipment = useMemo(() => {
    const liner = (detail?.forwarder_name ?? "").trim();
    return liner.length > 0 || bids.length > 0;
  }, [detail?.forwarder_name, bids.length]);

  const effectiveLaneOriginCountry = useMemo(
    () => (biddingLaneCountry.trim() || (detail?.origin_port_country ?? "").trim()),
    [biddingLaneCountry, detail?.origin_port_country]
  );

  const fetchRecentForwarders = useCallback(() => {
    if (!accessToken || !id || !hasBiddingStep) return;
    setLoadingRecentForwarders(true);
    const originQ = debouncedLaneCountry.trim() || (detail?.origin_port_country ?? "").trim();
    listRecentShipmentForwarders(id, 30, accessToken, originQ || undefined)
      .then((res) => {
        if (!isApiError(res) && res.data) setRecentForwarders(res.data);
      })
      .finally(() => setLoadingRecentForwarders(false));
  }, [accessToken, id, hasBiddingStep, debouncedLaneCountry, detail?.origin_port_country]);

  const originPortCountryOptions = useMemo(
    () => getCountryOptions(editOriginPortCountry).filter((o) => o !== ""),
    [editOriginPortCountry]
  );

  const biddingLaneCountryOptions = useMemo(
    () => getCountryOptions(biddingLaneCountry).filter((o) => o !== ""),
    [biddingLaneCountry]
  );

  const loadBids = useCallback(() => {
    if (!accessToken || !id || !hasBiddingStep) return;
    setLoadingBids(true);
    listShipmentBids(id, accessToken)
      .then((res) => {
        if (!isApiError(res) && res.data) setBids(res.data);
      })
      .finally(() => {
        setLoadingBids(false);
        fetchRecentForwarders();
      });
  }, [accessToken, id, hasBiddingStep, fetchRecentForwarders]);

  useEffect(() => {
    if (hasBiddingStep && id) loadBids();
    else {
      setBids([]);
      setRecentForwarders([]);
    }
  }, [hasBiddingStep, id, loadBids]);

  useEffect(() => {
    if (!hasBiddingStep || !id || !accessToken) return;
    fetchRecentForwarders();
  }, [hasBiddingStep, id, accessToken, fetchRecentForwarders, debouncedLaneCountry, detail?.forwarder_name]);

  // When incoterm is no longer EXW/FCA/FOB, switch back to Details tab (Forwarder Bidding only applies to those incoterms)
  useEffect(() => {
    if (!hasBiddingStep && activeDetailTab === "forwarder-bidding") setActiveDetailTab("details");
  }, [hasBiddingStep, activeDetailTab]);

  useEffect(() => {
    if (!activePoOverlayId) return;
    if (expandedPoIds.includes(activePoOverlayId)) return;
    setPoLineItemsWide(false);
    setActivePoOverlayId(null);
  }, [activePoOverlayId, expandedPoIds]);

  function handleAddShipmentNote(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !id || !canEditShipment) return;
    const text = noteDraft.trim();
    if (!text) return;
    setActionError(null);
    setSavingNote(true);
    createShipmentNote(id, text, accessToken)
      .then((res) => {
        if (isApiError(res)) {
          setActionError(res.message);
          pushToast(res.message, "error");
          return;
        }
        if (res.data) {
          setShipmentNotes((prev) => [res.data!, ...prev]);
          setNoteDraft("");
          pushToast("Note added.", "success");
        }
      })
      .finally(() => setSavingNote(false));
  }

  function enterUpdateMode() {
    if (!detail || !canEditShipment) return;
    setEditVendorName(detail.vendor_name ?? "");
    setEditForwarderName(detail.forwarder_name ?? "");
    setEditWarehouseName(detail.warehouse_name ?? "");
    setEditIncoterm(detail.incoterm ?? "");
    setEditKawasanBerikat(parseYesNoSelectValue(detail.kawasan_berikat));
    setEditSurveyor(parseYesNoSelectValue(detail.surveyor));
    setEditShipmentMethod(detail.shipment_method ?? "");
    setEditShipBy(detail.ship_by ?? "");
    setEditProductClassification(normalizeProductClassificationForEdit(detail.product_classification));
    setEditPibType(normalizePibTypeForEdit(detail.pib_type));
    setEditNoRequestPib(detail.no_request_pib ?? "");
    setEditPpjkMkl(detail.ppjk_mkl ?? "");
    setEditNopen(detail.nopen ?? "");
    setEditNopenDate(detail.nopen_date ? detail.nopen_date.slice(0, 10) : "");
    setEditBlAwb(detail.bl_awb ?? "");
    setEditInsuranceNo(detail.insurance_no ?? "");
    setEditCoo(detail.coo ?? "");
    setEditOriginPortName(detail.origin_port_name ?? "");
    setEditOriginPortCountry(detail.origin_port_country ?? "");
    const incForLane = (detail.incoterm ?? "").trim().toUpperCase();
    if (INCOTERMS_WITH_BIDDING_TRANSPORTER.includes(incForLane as (typeof INCOTERMS_WITH_BIDDING_TRANSPORTER)[number])) {
      setBiddingLaneCountry(detail.origin_port_country ?? "");
      setBiddingLanePort(detail.origin_port_name ?? "");
    }
    setEditEtd(detail.etd ? detail.etd.slice(0, 10) : "");
    setEditAtd(detail.atd ? detail.atd.slice(0, 10) : "");
    setEditDestinationPortName(detail.destination_port_name ?? "");
    setEditEta(detail.eta ? detail.eta.slice(0, 10) : "");
    setEditAta(detail.ata ? detail.ata.slice(0, 10) : "");
    setEditDepo(detail.depo === true ? "yes" : detail.depo === false ? "no" : "");
    setEditDepoLocation(detail.depo_location ?? "");
    setEditUnit20ft(detail.unit_20ft === true);
    setEditUnit40ft(detail.unit_40ft === true);
    setEditUnitPackage(detail.unit_package === true);
    setEditUnit20IsoTank(detail.unit_20_iso_tank === true);
    setEditContainerCount20ft(detail.container_count_20ft != null ? String(detail.container_count_20ft) : "");
    setEditContainerCount40ft(detail.container_count_40ft != null ? String(detail.container_count_40ft) : "");
    setEditPackageCount(detail.package_count != null ? String(detail.package_count) : "");
    setEditContainerCount20IsoTank(
      detail.container_count_20_iso_tank != null ? String(detail.container_count_20_iso_tank) : ""
    );
    setEditIncotermAmount(
      detail.incoterm_amount != null
        ? formatPriceInputWithCommas(
            roundTo2Decimals(Number(detail.incoterm_amount)).toFixed(2),
            2
          )
        : ""
    );
    setEditIncotermCurrency(detail.incoterm_currency ?? "IDR");
    setEditBmTotal(detail.bm != null && detail.bm !== 0 ? String(detail.bm) : "");
    setEditPpnTotal(detail.ppn != null && detail.ppn !== 0 ? String(detail.ppn) : "");
    setEditPphTotal(detail.pph != null && detail.pph !== 0 ? String(detail.pph) : "");
    setEditCbm(detail.cbm != null ? String(detail.cbm) : "");
    setEditNetWeightMt(detail.net_weight_mt != null ? String(detail.net_weight_mt) : "");
    setEditGrossWeightMt(detail.gross_weight_mt != null ? String(detail.gross_weight_mt) : "");
    setEditClosedAt(detail.closed_at ? detail.closed_at.slice(0, 10) : "");
    initPoMappingEditsFromDetail(detail);
    {
      const inc = (detail.incoterm ?? "").trim().toUpperCase();
      if (INCOTERMS_WITH_BIDDING_TRANSPORTER.includes(inc as (typeof INCOTERMS_WITH_BIDDING_TRANSPORTER)[number])) {
        const fn = (detail.forwarder_name ?? "").trim();
        if (!fn) {
          setEditForwarderPick("");
        } else {
          const bidMatch = bids.find((b) => (b.forwarder_name ?? "").trim() === fn);
          if (bidMatch) {
            setEditForwarderPick(`bid:${bidMatch.id}`);
          } else {
            const ri = recentForwarders.findIndex((r) => (r.forwarder_name ?? "").trim() === fn);
            if (ri >= 0) {
              setEditForwarderPick(`recent:${ri}`);
            } else {
              setEditForwarderPick(FORWARDER_LINER_PICK_OTHER);
            }
          }
        }
      } else {
        setEditForwarderPick("");
      }
    }
    setIsUpdatingShipment(true);
    setActionError(null);
  }

  function handleUpdateStatus(e: React.FormEvent) {
    e.preventDefault();
    if (isUpdatingShipment) return;
    if (!canUpdateStatus) return;
    if (!accessToken || !id || !newStatus.trim()) return;
    setActionError(null);
    setUpdatingStatus(true);
    const statusToApply = newStatus.trim();
    updateShipmentStatus(id, statusToApply, remarks.trim() || undefined, accessToken)
      .then((res) => {
        if (isApiError(res)) {
          setActionError(res.message);
          pushToast(res.message, "error");
          return;
        }
        setNewStatus("");
        setRemarks("");
        pushToast(`Status updated to ${formatStatusLabel(statusToApply)}.`, "success");
        load();
      })
      .finally(() => setUpdatingStatus(false));
  }

  const INTAKE_UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function handleCouplePo(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !id || !canCoupleDecouplePo) return;
    const tokens = coupleIntakeIds
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (tokens.length === 0) {
      setCoupleModalError("Enter at least one PO number or intake ID");
      return;
    }
    setCoupleModalError(null);
    setCoupling(true);
    (async () => {
      try {
        const resolved: string[] = [];
        for (const t of tokens) {
          if (INTAKE_UUID_RE.test(t)) {
            resolved.push(t);
            continue;
          }
          const lookup = await lookupPoByPoNumber(t, accessToken);
          if (isApiError(lookup)) {
            setCoupleModalError(lookup.message);
            pushToast(lookup.message, "error");
            return;
          }
          const intakeId = lookup.data?.id;
          if (!intakeId) {
            const msg = `PO number not found: ${t}`;
            setCoupleModalError(msg);
            pushToast(msg, "error");
            return;
          }
          resolved.push(intakeId);
        }
        const uniqueIds = [...new Set(resolved)];
        const res = await couplePo(id, uniqueIds, accessToken);
        if (isApiError(res)) {
          setCoupleModalError(res.message);
          pushToast(res.message, "error");
          return;
        }
        pushToast("Purchase Order added to group.", "success");
        setCoupleModal(false);
        setCoupleIntakeIds("");
        setCoupleModalError(null);
        load();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to add PO";
        setCoupleModalError(msg);
        pushToast(msg, "error");
      } finally {
        setCoupling(false);
      }
    })();
  }

  function handleConfirmSoftDelete() {
    if (!accessToken || !id || !canEditShipment) return;
    setDeletingShipment(true);
    setActionError(null);
    softDeleteShipment(id, accessToken)
      .then((res) => {
        if (isApiError(res)) {
          setActionError(res.message);
          pushToast(res.message, "error");
          return;
        }
        pushToast("Shipment removed from the active list. Linked Purchase Orders were detached.", "success");
        router.push("/dashboard/shipments");
      })
      .finally(() => {
        setDeletingShipment(false);
        setDeleteConfirmOpen(false);
      });
  }

  function handleDecouple(intakeId: string) {
    if (!accessToken || !id || !canCoupleDecouplePo) return;
    setActionError(null);
    setDecouplingId(intakeId);
    decouplePo(id, intakeId, undefined, accessToken)
      .then((res) => {
        if (isApiError(res)) {
          setActionError(res.message);
          pushToast(res.message, "error");
          return;
        }
        pushToast("Purchase Order removed from this shipment.", "success");
        load();
      })
      .finally(() => setDecouplingId(null));
  }

  function handleAddBid(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !id || !bidForwarder.trim() || !canEditShipment) return;
    const laneCountry = (biddingLaneCountry.trim() || (detail?.origin_port_country ?? "").trim());
    const lanePort = (biddingLanePort.trim() || (detail?.origin_port_name ?? "").trim());
    if (!laneCountry) {
      pushToast("Set origin port country under Lane origin before adding a participant.", "error");
      return;
    }
    if (!lanePort) {
      pushToast("Set origin port name under Lane origin before adding a participant.", "error");
      return;
    }
    setActionError(null);
    setAddingBid(true);
    createShipmentBid(
      id,
      {
        forwarder_name: bidForwarder.trim(),
        service_amount: (() => {
          const n = parseCommaFormattedDecimal(bidServiceAmount);
          return n != null ? roundTo2Decimals(n) : undefined;
        })(),
        service_amount_currency: bidServiceCurrency,
        quotation_expires_at: bidQuotationExpiresAt.trim() || undefined,
        origin_port: lanePort || undefined,
        destination_port: bidDestinationPort.trim() || undefined,
        ship_via: bidShipVia.trim() || undefined,
      },
      accessToken
    )
      .then((res) => {
        if (isApiError(res)) {
          setActionError(res.message);
          pushToast(res.message, "error");
          return;
        }
        if (res.data) setBids((prev) => [...prev, res.data!]);
        setBidForwarder("");
        setBidServiceAmount("");
        setBidServiceCurrency("IDR");
        setBidQuotationExpiresAt("");
        setBidDestinationPort("");
        setBidShipVia("");
        pushToast("Forwarder bid added.", "success");
        fetchRecentForwarders();
      })
      .finally(() => setAddingBid(false));
  }

  function applyForwarderFromRecent(row: RecentForwarderBid) {
    const name = row.forwarder_name.trim();
    if (!name || !accessToken || !id) return;
    const rowKey = `${row.shipment_id}:${name}`;
    setBidForwarder(name);
    setEditForwarderName(name);
    if (!canEditShipment) return;
    setApplyingRecentForwarderKey(rowKey);
    updateShipment(id, { forwarder_name: name }, accessToken)
      .then((res) => {
        if (isApiError(res)) {
          pushToast(res.message, "error");
          return;
        }
        if (res.data) setDetail(res.data);
        fetchRecentForwarders();
        pushToast("Forwarder / liner saved — opening Details so you can confirm.", "success");
        setActiveDetailTab("details");
        window.setTimeout(() => {
          document.getElementById("field-forwarder-liner")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 120);
      })
      .finally(() => setApplyingRecentForwarderKey(null));
  }

  function startEditBid(bid: ShipmentBid) {
    setEditingBidId(bid.id);
    setEditBidForwarder(bid.forwarder_name);
    setEditBidServiceAmount(
      bid.service_amount != null
        ? formatPriceInputWithCommas(roundTo2Decimals(Number(bid.service_amount)).toFixed(2), 2)
        : ""
    );
    setEditBidQuotationExpiresAt(bid.quotation_expires_at?.trim().slice(0, 10) ?? "");
    setEditBidDestinationPort(bid.destination_port ?? "");
    setEditBidShipVia(bid.ship_via ?? "");
    setEditBidServiceCurrency(bid.service_amount_currency ?? "IDR");
  }

  function handleSaveBid(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !id || !editingBidId || !canEditShipment) return;
    const laneCountry = (biddingLaneCountry.trim() || (detail?.origin_port_country ?? "").trim());
    const lanePort = (biddingLanePort.trim() || (detail?.origin_port_name ?? "").trim());
    if (!laneCountry || !lanePort) {
      pushToast("Set lane origin country and port before saving the bid.", "error");
      return;
    }
    setActionError(null);
    updateShipmentBid(
      id,
      editingBidId,
      {
        forwarder_name: editBidForwarder.trim(),
        service_amount: (() => {
          if (!editBidServiceAmount.trim()) return undefined;
          const n = parseCommaFormattedDecimal(editBidServiceAmount);
          return n != null ? roundTo2Decimals(n) : undefined;
        })(),
        service_amount_currency: editBidServiceCurrency,
        quotation_expires_at: editBidQuotationExpiresAt.trim() || null,
        origin_port: lanePort || undefined,
        destination_port: editBidDestinationPort.trim() || undefined,
        ship_via: editBidShipVia.trim() || undefined,
      },
      accessToken
    )
      .then((res) => {
        if (isApiError(res)) {
          setActionError(res.message);
          pushToast(res.message, "error");
          return;
        }
        if (res.data) setBids((prev) => prev.map((b) => (b.id === editingBidId ? res.data! : b)));
        setEditingBidId(null);
        pushToast("Bid updated.", "success");
        fetchRecentForwarders();
      });
  }

  function handleDeleteBid(bidId: string) {
    if (!accessToken || !id || !canEditShipment) return;
    setActionError(null);
    deleteShipmentBid(id, bidId, accessToken).then((res) => {
      if (isApiError(res)) {
        setActionError(res.message);
        pushToast(res.message, "error");
        return;
      }
      setBids((prev) => prev.filter((b) => b.id !== bidId));
      pushToast("Bid removed.", "success");
      fetchRecentForwarders();
    });
  }

  function handleQuotationUpload(bidId: string, file: File | null) {
    if (!accessToken || !id || !file || !canUploadDocument) return;
    setActionError(null);
    setUploadingQuotationForBidId(bidId);
    uploadShipmentBidQuotation(id, bidId, file, accessToken)
      .then((res) => {
        if (isApiError(res)) {
          setActionError(res.message);
          pushToast(res.message, "error");
          return;
        }
        if (res.data) setBids((prev) => prev.map((b) => (b.id === bidId ? res.data! : b)));
        pushToast("Quotation uploaded.", "success");
      })
      .finally(() => setUploadingQuotationForBidId(null));
  }

  function handleQuotationDownload(bid: ShipmentBid) {
    if (!bid.quotation_storage_key || !accessToken) return;
    const base = config.apiBaseUrl.replace(/\/$/, "");
    const url = `${base}/shipments/${id}/bids/${bid.id}/quotation`;
    fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = bid.quotation_file_name || "quotation";
        a.click();
        URL.revokeObjectURL(a.href);
        pushToast("Quotation downloaded.", "success");
      })
      .catch(() => {
        setActionError("Failed to download quotation");
        pushToast("Failed to download quotation.", "error");
      });
  }

  function shipmentDocSlotKey(documentType: string, status: string | null, intakeId?: string | null) {
    return `${documentType}_${status ?? "NONE"}_${intakeId ?? "SHIP"}`;
  }

  function handleShipmentDocumentUpload(
    documentType: string,
    status: "DRAFT" | "FINAL" | null,
    file: File | null,
    intakeId?: string | null
  ) {
    if (!accessToken || !id || !file || !detail) return;
    const block = getShipmentDocumentUploadBlockReason({
      shipment: detail,
      documentType,
      documents: shipmentDocuments,
      shipmentStatusDelivered: shipmentDocumentsLockedByDeliveredStatus,
    });
    if (block) {
      pushToast(documentRestrictionToastMessage(block), "error");
      return;
    }
    if (!isAcceptedShipmentDocFile(file)) {
      pushToast("This file type is not accepted. Use PDF, Word, Excel, or an image.", "error");
      return;
    }
    const key = shipmentDocSlotKey(documentType, status, intakeId);
    setActionError(null);
    setUploadingDocSlotKey(key);
    uploadShipmentDocument(id, file, documentType, status, accessToken, intakeId ?? undefined)
      .then(async (res) => {
        if (isApiError(res)) {
          setActionError(res.message);
          pushToast(res.message, "error");
          return;
        }
        const listRes = await listShipmentDocuments(id, accessToken);
        if (!isApiError(listRes) && Array.isArray(listRes.data)) {
          setShipmentDocuments(listRes.data);
        } else if (res.data) {
          setShipmentDocuments((prev) => [res.data!, ...prev]);
        }
        pushToast("Document uploaded.", "success");
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setActionError(msg);
        pushToast(msg, "error");
      })
      .finally(() => setUploadingDocSlotKey(null));
  }

  function handleShipmentDocumentDownload(doc: ShipmentDocumentListItem) {
    if (!id) return;
    const base = config.apiBaseUrl.replace(/\/$/, "");
    const url = `${base}/shipments/${id}/documents/${doc.id}/download`;
    const downloadWithAuth = () =>
      fetch(url, {
        credentials: "include",
      });

    downloadWithAuth()
      .then(async (r) => {
        if (r.status === 401) {
          const refreshUrl = `${base}/auth/refresh`;
          const refresh = await fetch(refreshUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
            credentials: "include",
          });
          if (!refresh.ok) throw new Error("download failed");
          r = await downloadWithAuth();
        }
        if (!r.ok) throw new Error("download failed");
        return r.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = doc.original_file_name || "document";
        a.click();
        URL.revokeObjectURL(a.href);
        pushToast("Download started.", "success");
      })
      .catch(() => {
        setActionError("Failed to download document");
        pushToast("Failed to download document.", "error");
      });
  }

  function handleShipmentDocumentDelete(docId: string) {
    if (!accessToken || !id) return;
    setActionError(null);
    setDeletingDocId(docId);
    deleteShipmentDocument(id, docId, accessToken)
      .then((res) => {
        if (isApiError(res)) {
          setActionError(res.message);
          pushToast(res.message, "error");
          return;
        }
        setShipmentDocuments((prev) => prev.filter((d) => d.id !== docId));
        pushToast("Document removed.", "success");
      })
      .finally(() => setDeletingDocId(null));
  }

  function renderShipmentDocumentFileList(files: ShipmentDocumentListItem[]) {
    if (files.length === 0) {
      return <li className={styles.shipmentDocFileEmpty}>No file yet.</li>;
    }
    return files.map((doc) => (
      <li key={doc.id} className={styles.shipmentDocFileRow}>
        <div className={styles.shipmentDocFileInfo}>
          <span className={styles.shipmentDocFileName}>{doc.original_file_name}</span>
          <span className={styles.shipmentDocFileMeta}>
            {formatDocumentBytes(doc.size_bytes)} · {formatDate(doc.uploaded_at)} · {display(doc.uploaded_by)}
            {doc.po_number ? ` · PO ${doc.po_number}` : ""}
          </span>
        </div>
        <div className={styles.shipmentDocFileActions}>
          <Button
            type="button"
            variant="secondary"
            className={styles.docIconBtn}
            onClick={() => handleShipmentDocumentDownload(doc)}
            aria-label={`Download ${doc.original_file_name}`}
            title="Download"
          >
            <span aria-hidden>↓</span>
          </Button>
          {canEditShipment && (
            <Button
              type="button"
              variant="secondary"
              className={styles.docIconBtn}
              onClick={() => handleShipmentDocumentDelete(doc.id)}
              disabled={deletingDocId === doc.id || shipmentDocumentsLockedByDeliveredStatus}
              aria-label={deletingDocId === doc.id ? "Removing document" : `Remove ${doc.original_file_name}`}
              title={deletingDocId === doc.id ? "Removing…" : "Remove"}
            >
              <span aria-hidden>{deletingDocId === doc.id ? "…" : "🗑"}</span>
            </Button>
          )}
        </div>
      </li>
    ));
  }

  function formatDate(value: string | null | undefined): string {
    if (!value) return "—";
    try {
      const d = new Date(value);
      return isNaN(d.getTime()) ? value : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return value;
    }
  }

  function display(value: string | null | undefined): string {
    return value != null && String(value).trim() !== "" ? String(value).trim() : "—";
  }

  function handleShipByEditChange(next: string) {
    if (!next.trim()) {
      setEditShipBy("");
      setEditUnit20ft(false);
      setEditUnit40ft(false);
      setEditUnitPackage(false);
      setEditUnit20IsoTank(false);
      setEditContainerCount20ft("");
      setEditContainerCount40ft("");
      setEditPackageCount("");
      setEditContainerCount20IsoTank("");
      setEditCbm("");
      return;
    }
    setEditShipBy(next);
    if (next === "Bulk") {
      setEditUnit20ft(false);
      setEditUnit40ft(false);
      setEditUnitPackage(false);
      setEditUnit20IsoTank(false);
      setEditContainerCount20ft("");
      setEditContainerCount40ft("");
      setEditPackageCount("");
      setEditContainerCount20IsoTank("");
    } else if (next === "LCL") {
      setEditUnit20ft(false);
      setEditUnit40ft(false);
      setEditUnit20IsoTank(false);
      setEditContainerCount20ft("");
      setEditContainerCount40ft("");
      setEditContainerCount20IsoTank("");
    } else if (next === "FCL") {
      setEditUnitPackage(false);
      setEditPackageCount("");
    }
    if (next !== "LCL") {
      setEditCbm("");
    }
  }

  function applyLinerFieldsFromBidOrRecent(
    forwarderName: string,
    shipVia: string | null | undefined,
    destinationPort: string | null | undefined
  ) {
    setEditForwarderName((forwarderName ?? "").trim());
    const m = normalizeBidShipViaToShipmentMethod(shipVia);
    setEditShipmentMethod(m);
    if (m === "Air") handleShipByEditChange("");
    setEditDestinationPortName((destinationPort ?? "").trim());
  }

  function handleForwarderPickChange(value: string) {
    setEditForwarderPick(value);
    if (value === "") {
      setEditForwarderName("");
      return;
    }
    if (value === FORWARDER_LINER_PICK_OTHER) {
      setEditForwarderName("");
      return;
    }
    if (value.startsWith("bid:")) {
      const bidId = value.slice(4);
      const bid = bids.find((b) => b.id === bidId);
      if (bid) {
        applyLinerFieldsFromBidOrRecent(bid.forwarder_name, bid.ship_via, bid.destination_port);
      }
      return;
    }
    if (value.startsWith("recent:")) {
      const idx = Number(value.slice(7));
      const row = recentForwarders[idx];
      if (row) {
        applyLinerFieldsFromBidOrRecent(row.forwarder_name, row.ship_via, row.destination_port);
      }
    }
  }

  function formatShipmentUnits(d: ShipmentDetailType): string {
    const inch = "\u2033";
    const sb = (d.ship_by ?? "").trim();
    if (sb === "Bulk") return "—";
    if (sb === "LCL") {
      if (d.unit_package === true) {
        const cnt = d.package_count != null ? ` × ${d.package_count}` : "";
        return `Package${cnt}`;
      }
      return "—";
    }
    if (sb === "FCL") {
      const parts: string[] = [];
      if (d.unit_20ft === true) {
        parts.push(
          `20${inch}${d.container_count_20ft != null ? ` × ${d.container_count_20ft}` : ""}`.trim()
        );
      }
      if (d.unit_40ft === true) {
        parts.push(
          `40${inch}${d.container_count_40ft != null ? ` × ${d.container_count_40ft}` : ""}`.trim()
        );
      }
      if (d.unit_20_iso_tank === true) {
        parts.push(
          `20${inch} ISO Tank${d.container_count_20_iso_tank != null ? ` × ${d.container_count_20_iso_tank}` : ""}`.trim()
        );
      }
      return parts.length > 0 ? parts.join(", ") : "—";
    }
    const parts: string[] = [];
    if (d.unit_20ft === true) {
      parts.push(
        `20${inch}${d.container_count_20ft != null ? ` × ${d.container_count_20ft}` : ""}`.trim()
      );
    }
    if (d.unit_40ft === true) {
      parts.push(
        `40${inch}${d.container_count_40ft != null ? ` × ${d.container_count_40ft}` : ""}`.trim()
      );
    }
    if (d.unit_package === true) {
      parts.push(
        `Package${d.package_count != null ? ` × ${d.package_count}` : ""}`.trim()
      );
    }
    if (d.unit_20_iso_tank === true) {
      parts.push(
        `20${inch} ISO Tank${d.container_count_20_iso_tank != null ? ` × ${d.container_count_20_iso_tank}` : ""}`.trim()
      );
    }
    return parts.length > 0 ? parts.join(", ") : "—";
  }

  /**
   * Snapshot used for status-transition validation and highlights.
   * When "Update shipment" is open, merge edit state so checks match unsaved form values (and PO mapping / delivered qty drafts).
   */
  const detailForStatusValidation = useMemo((): ShipmentDetailType | null => {
    if (!detail) return null;
    if (!isUpdatingShipment) return detail;

    const method =
      editShipmentMethod.trim() !== "" ? editShipmentMethod.trim() : detail.shipment_method;
    const sea = isShipmentMethodSea(method);

    const origin_port_name = (hasBiddingStep ? biddingLanePort : editOriginPortName).trim() || null;
    const origin_port_country = (hasBiddingStep ? biddingLaneCountry : editOriginPortCountry).trim() || null;

    const depoVal: boolean | null =
      editDepo === "yes" ? true : editDepo === "no" ? false : detail.depo;

    const surveyorVal =
      editSurveyor === "Yes" || editSurveyor === "No" ? editSurveyor : detail.surveyor;

    const incotermAmtFromEdit = editIncotermAmount.trim()
      ? roundTo2Decimals(Number(stripCommaThousands(editIncotermAmount.trim())))
      : null;
    const incoterm_amount =
      incotermAmtFromEdit != null && Number.isFinite(incotermAmtFromEdit)
        ? incotermAmtFromEdit
        : detail.incoterm_amount;

    const linkedPosEff = (() => {
      const base = detail.linked_pos ?? [];
      if (base.length === 0) return base;

      const rateRawFromAnyPo = base
        .map((po) => stripCommaThousands((poEditCurrencyRateByIntake[po.intake_id] ?? "").trim()))
        .find((s) => s.length > 0);
      const parsedSharedRate = rateRawFromAnyPo ? Number(rateRawFromAnyPo) : NaN;
      const sharedNonIdrRate =
        Number.isFinite(parsedSharedRate) && parsedSharedRate > 0
          ? roundTo2Decimals(parsedSharedRate)
          : undefined;

      const parseDraftPct = (raw: string | undefined, fallback: number | null): number | null => {
        if (raw === undefined) return fallback;
        const t = stripCommaThousands(raw.trim());
        if (!t) return null;
        const n = roundTo2Decimals(Number(t));
        return Number.isFinite(n) ? n : fallback;
      };

      return base.map((po) => {
        const pd = poDetailsCache[po.intake_id];
        const idr = isCurrencyIdr(resolvePoCurrencyCode(po, pd));
        let currency_rate = po.currency_rate;
        if (!idr && sharedNonIdrRate !== undefined) {
          currency_rate = sharedNonIdrRate;
        }

        const qtyDraft = poEditReceivedQtyByIntake[po.intake_id];
        const dutyDraft = poEditDutyPctByIntake[po.intake_id];
        let line_received = po.line_received;
        if (qtyDraft || dutyDraft) {
          const items = pd?.items ?? [];
          if (items.length > 0) {
            line_received = items.map((it) => {
              const saved = po.line_received?.find((l) => l.item_id === it.id);
              const received_qty =
                qtyDraft != null
                  ? parseDeliveredQtyInput(qtyDraft[it.id] ?? "")
                  : (saved?.received_qty ?? 0);
              const d = dutyDraft?.[it.id];
              return {
                item_id: it.id,
                received_qty,
                item_description: it.item_description ?? saved?.item_description ?? null,
                bm_percentage: d ? parseDraftPct(d.bm, saved?.bm_percentage ?? null) : (saved?.bm_percentage ?? null),
                ppn_percentage: d ? parseDraftPct(d.ppn, saved?.ppn_percentage ?? null) : (saved?.ppn_percentage ?? null),
                pph_percentage: d ? parseDraftPct(d.pph, saved?.pph_percentage ?? null) : (saved?.pph_percentage ?? null),
              };
            });
          } else if (line_received && line_received.length > 0) {
            line_received = line_received.map((l) => {
              const d = dutyDraft?.[l.item_id];
              return {
                ...l,
                received_qty:
                  qtyDraft != null ? parseDeliveredQtyInput(qtyDraft[l.item_id] ?? "") : l.received_qty,
                bm_percentage: d ? parseDraftPct(d.bm, l.bm_percentage ?? null) : l.bm_percentage,
                ppn_percentage: d ? parseDraftPct(d.ppn, l.ppn_percentage ?? null) : l.ppn_percentage,
                pph_percentage: d ? parseDraftPct(d.pph, l.pph_percentage ?? null) : l.pph_percentage,
              };
            });
          }
        }

        return { ...po, currency_rate, line_received };
      });
    })();

    return {
      ...detail,
      incoterm: workflowIncoterm ?? detail.incoterm,
      forwarder_name: editForwarderName.trim() || detail.forwarder_name,
      shipment_method: method ?? detail.shipment_method,
      ship_by: sea ? (editShipBy.trim() || detail.ship_by) : null,
      pib_type: editPibType.trim() || detail.pib_type,
      origin_port_name,
      origin_port_country,
      etd: editEtd.trim() || detail.etd,
      eta: editEta.trim() || detail.eta,
      product_classification: editProductClassification.trim() || detail.product_classification,
      depo: depoVal,
      surveyor: surveyorVal,
      destination_port_name: editDestinationPortName.trim() || detail.destination_port_name,
      destination_port_country: DESTINATION_PORT_COUNTRY,
      incoterm_amount,
      incoterm_currency: editIncotermCurrency,
      atd: editAtd.trim() || detail.atd,
      bl_awb: editBlAwb.trim() || detail.bl_awb,
      no_request_pib: editNoRequestPib.trim() || detail.no_request_pib,
      ppjk_mkl: editPpjkMkl.trim() || detail.ppjk_mkl,
      ata: editAta.trim() || detail.ata,
      nopen: editNopen.trim() || detail.nopen,
      nopen_date: editNopenDate.trim() || detail.nopen_date,
      closed_at: editClosedAt.trim() || detail.closed_at,
      linked_pos: linkedPosEff,
    };
  }, [
    detail,
    isUpdatingShipment,
    hasBiddingStep,
    workflowIncoterm,
    biddingLanePort,
    biddingLaneCountry,
    editForwarderName,
    editShipmentMethod,
    editShipBy,
    editPibType,
    editOriginPortName,
    editOriginPortCountry,
    editEtd,
    editEta,
    editProductClassification,
    editDepo,
    editSurveyor,
    editDestinationPortName,
    editIncotermAmount,
    editIncotermCurrency,
    editAtd,
    editBlAwb,
    editNoRequestPib,
    editPpjkMkl,
    editAta,
    editNopen,
    editNopenDate,
    editClosedAt,
    poEditCurrencyRateByIntake,
    poEditReceivedQtyByIntake,
    poEditDutyPctByIntake,
    poDetailsCache,
  ]);

  const applicableStatuses = useMemo(
    () => getApplicableStatuses(workflowIncoterm),
    [workflowIncoterm]
  );

  const steppedTimeline = useMemo((): TimelineItemType[] => {
    const current = detail?.current_status ?? "";
    const currentIndex = applicableStatuses.indexOf(current);
    const byStatus = new Map<string, ShipmentTimelineEntry>();
    timeline.forEach((e) => byStatus.set(e.status, e));
    return applicableStatuses.map((status, index) => {
      const entry = byStatus.get(status);
      let variant: TimelineItemVariant = "pending";
      if (currentIndex >= 0) {
        if (index < currentIndex) variant = "complete";
        else if (index === currentIndex) variant = "active";
        else if (index === currentIndex + 1) variant = "next";
        else variant = "pending";
      } else if (entry) {
        variant = current === status ? "active" : "complete";
      } else if (index === 0) {
        // No known current status in this chain yet: first step is the immediate next target.
        variant = "next";
      }
      return {
        sequence: index + 1,
        status,
        changed_at: entry?.changed_at ?? "",
        changed_by: entry?.changed_by ?? "",
        remarks: entry?.remarks ?? null,
        variant,
        // Keep tone only for done statuses; current/next/pending are controlled by timeline state colors.
        statusTone: variant === "complete" ? statusToBadgeVariant(status) : undefined,
      };
    });
  }, [detail?.current_status, timeline, applicableStatuses]);

  const missingForStatusUpdate = useMemo(() => {
    if (!detailForStatusValidation || !newStatus.trim()) return [];
    const fields = getMissingRequiredFields(detailForStatusValidation.current_status, newStatus.trim(), {
      ...detailForStatusValidation,
      bids,
    });
    const docs = getMissingRequiredDocuments(
      detailForStatusValidation.current_status,
      newStatus.trim(),
      detailForStatusValidation.incoterm,
      {
        documents: shipmentDocuments,
        linked_pos: detailForStatusValidation.linked_pos ?? [],
        surveyor: detailForStatusValidation.surveyor,
        pib_type: detailForStatusValidation.pib_type,
      }
    );
    return [...fields, ...docs];
  }, [detailForStatusValidation, newStatus, bids, shipmentDocuments]);

  const requiredDocsForUpdate = useMemo(() => {
    if (!detailForStatusValidation || !newStatus.trim()) return [];
    return getRequiredDocsForTransition(
      detailForStatusValidation.current_status,
      newStatus.trim(),
      detailForStatusValidation.incoterm,
      detailForStatusValidation.pib_type
    );
  }, [detailForStatusValidation, newStatus]);

  const canProceedStatusUpdate = newStatus.trim() !== "" && missingForStatusUpdate.length === 0;

  const pibTypeForDutyRules = useMemo(() => {
    if (!detail) return null;
    if (isUpdatingShipment && editPibType.trim()) return editPibType.trim();
    return detail.pib_type;
  }, [detail, isUpdatingShipment, editPibType]);

  const dutyCalculationSkipped = useMemo(() => isPibTypeBc23(pibTypeForDutyRules), [pibTypeForDutyRules]);

  const previewPdriWhileEditing = useMemo(() => {
    if (!detail || dutyCalculationSkipped || !isUpdatingShipment) return null;
    const bm = parseDutyTotalAmountInput(editBmTotal);
    const ppn = parseDutyTotalAmountInput(editPpnTotal);
    const pph = parseDutyTotalAmountInput(editPphTotal);
    if (bm === null || ppn === null || pph === null) return null;
    return roundTo2Decimals(bm + ppn + pph);
  }, [detail, dutyCalculationSkipped, isUpdatingShipment, editBmTotal, editPpnTotal, editPphTotal]);

  const requiredFieldsForStatusUpdate = useMemo(() => {
    if (!detailForStatusValidation || !newStatus.trim()) return [] as string[];
    return getRequiredFieldsForTransition(
      detailForStatusValidation.current_status,
      newStatus.trim(),
      detailForStatusValidation.incoterm,
      detailForStatusValidation.pib_type,
      detailForStatusValidation.shipment_method
    );
  }, [detailForStatusValidation, newStatus]);

  const requiredForUpdateSet = useMemo(
    () => new Set(requiredFieldsForStatusUpdate),
    [requiredFieldsForStatusUpdate]
  );
  const missingForUpdateSet = useMemo(() => new Set(missingForStatusUpdate), [missingForStatusUpdate]);

  const statusFieldClass = useCallback(
    (fieldKey: string, baseClass: string = styles.field) => {
      if (!newStatus.trim() || !requiredForUpdateSet.has(fieldKey) || !missingForUpdateSet.has(fieldKey)) return baseClass;
      return [baseClass, styles.statusFieldRequired, styles.statusFieldRequiredMissing].filter(Boolean).join(" ");
    },
    [newStatus, requiredForUpdateSet, missingForUpdateSet]
  );

  const linkedPoHighlightClass = useMemo(() => {
    if (!newStatus.trim()) return "";
    const keys = [
      "has_linked_po",
      "has_received_this_shipment",
      "has_currency_rate",
      "line_duty_percentages",
    ] as const;
    if (!keys.some((k) => requiredForUpdateSet.has(k) && missingForUpdateSet.has(k))) return "";
    return `${styles.statusHighlightBlock} ${styles.statusHighlightBlockMissing}`;
  }, [newStatus, requiredForUpdateSet, missingForUpdateSet]);

  const biddingCardHighlightClass = useMemo(() => {
    if (!newStatus.trim() || !requiredForUpdateSet.has("has_bidding_participant")) return "";
    return missingForUpdateSet.has("has_bidding_participant")
      ? `${styles.statusHighlightBlock} ${styles.statusHighlightBlockMissing}`
      : "";
  }, [newStatus, requiredForUpdateSet, missingForUpdateSet]);

  const arrivalPoMappingWrapClass = useMemo(() => {
    if (!newStatus.trim() || !requiredForUpdateSet.has("has_currency_rate")) return styles.poArrivalMappingGroup;
    const miss = missingForUpdateSet.has("has_currency_rate");
    return [styles.poArrivalMappingGroup, miss ? styles.statusFieldRequired : "", miss ? styles.statusFieldRequiredMissing : ""]
      .filter(Boolean)
      .join(" ");
  }, [newStatus, requiredForUpdateSet, missingForUpdateSet]);

  const poLineItemsToolbarClass = useMemo(() => {
    if (!newStatus.trim()) return styles.poLineItemsToolbar;
    const missRecv =
      requiredForUpdateSet.has("has_received_this_shipment") && missingForUpdateSet.has("has_received_this_shipment");
    const missDuty =
      requiredForUpdateSet.has("line_duty_percentages") && missingForUpdateSet.has("line_duty_percentages");
    if (!missRecv && !missDuty) return styles.poLineItemsToolbar;
    return [styles.poLineItemsToolbar, styles.statusFieldRequired, styles.statusFieldRequiredMissing]
      .filter(Boolean)
      .join(" ");
  }, [newStatus, requiredForUpdateSet, missingForUpdateSet]);

  const poLineToolbarDataStatusField = useMemo(() => {
    return (["line_duty_percentages", "has_received_this_shipment"] as const).find(
      (k) => requiredForUpdateSet.has(k) && missingForUpdateSet.has(k)
    );
  }, [requiredForUpdateSet, missingForUpdateSet]);

  const scrollToStatusRequirement = useCallback(
    (fieldKey: string, opts?: { afterTabSwitch?: boolean }) => {
    if (fieldKey.startsWith("doc:")) {
      if (activeDetailTab === "forwarder-bidding" && !opts?.afterTabSwitch) {
        setActiveDetailTab("details");
        window.setTimeout(() => scrollToStatusRequirement(fieldKey, { afterTabSwitch: true }), 150);
        return;
      }
      document.getElementById("section-shipment-documents")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (fieldKey === "has_bidding_participant") {
      setActiveDetailTab("forwarder-bidding");
      window.requestAnimationFrame(() => {
        document.getElementById("section-forwarder-bidding")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }
    if (activeDetailTab === "forwarder-bidding" && !opts?.afterTabSwitch) {
      setActiveDetailTab("details");
      window.setTimeout(() => scrollToStatusRequirement(fieldKey, { afterTabSwitch: true }), 150);
      return;
    }
    const poKeys = [
      "has_linked_po",
      "has_received_this_shipment",
      "has_currency_rate",
      "line_duty_percentages",
    ];
    if (poKeys.includes(fieldKey)) {
      document.getElementById("section-arrival-customs")?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.requestAnimationFrame(() => {
        const specific = document.querySelector(`[data-status-field="${CSS.escape(fieldKey)}"]`);
        if (specific) specific.scrollIntoView({ behavior: "smooth", block: "center" });
        else document.getElementById("shipment-highlight-linked-po")?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }
    const el = document.querySelector(`[data-status-field="${CSS.escape(fieldKey)}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  },
    [activeDetailTab, hasBiddingStep]
  );

  const nextStatusOptions = useMemo(() => {
    const current = detail?.current_status ?? "";
    const applicable = getApplicableStatuses(detail?.incoterm);
    const idx = applicable.indexOf(current);
    if (idx === -1) return [...applicable];
    return applicable.slice(idx + 1);
  }, [detail?.current_status, detail?.incoterm]);

  const linkedPoByIntake = useMemo(() => {
    const map: Record<string, LinkedPoSummary> = {};
    detail?.linked_pos?.forEach((po) => {
      map[po.intake_id] = po;
    });
    return map;
  }, [detail?.linked_pos]);

  const primaryGroupedPo = detail?.linked_pos?.[0] ?? null;
  const primaryGroupedPoCurrency = primaryGroupedPo
    ? resolvePoCurrencyCode(primaryGroupedPo, poDetailsCache[primaryGroupedPo.intake_id])
    : null;
  const groupedPoIsIdr = isCurrencyIdr(primaryGroupedPoCurrency);

  const [portalMounted, setPortalMounted] = useState(false);
  useEffect(() => {
    setPortalMounted(true);
  }, []);

  const [activityPanelOpen, setActivityPanelOpen] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityItems, setActivityItems] = useState<ShipmentActivityItem[]>([]);

  const fetchActivityLog = useCallback(async () => {
    if (!accessToken || !id) return;
    setActivityLoading(true);
    setActivityError(null);
    const res = await getShipmentActivityLog(id, accessToken);
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

  useEffect(() => {
    if (!activityPanelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeActivityPanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activityPanelOpen, closeActivityPanel]);

  const wideOverlayPayload = useMemo(() => {
    if (!poLineItemsWide || !activePoOverlayId || !detail) return null;
    const po = linkedPoByIntake[activePoOverlayId];
    if (!po) return null;
    const poDetail = poDetailsCache[activePoOverlayId];
    const items = poDetail?.items ?? [];
    if (items.length === 0) return null;
    return { po, poDetail, items, intakeId: activePoOverlayId };
  }, [poLineItemsWide, activePoOverlayId, detail, linkedPoByIntake, poDetailsCache]);

  useEffect(() => {
    if (!poLineItemsWide) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPoLineItemsWide(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [poLineItemsWide]);

  useEffect(() => {
    if (!poLineItemsWide) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [poLineItemsWide]);

  function initPoMappingEditsFromDetail(d: ShipmentDetailType) {
    const inv: Record<string, string> = {};
    const rate: Record<string, string> = {};
    const sharedInvoice = d.linked_pos.find((po) => (po.invoice_no ?? "").trim() !== "")?.invoice_no ?? "";
    const sharedRateSource = d.linked_pos.find((po) => po.currency_rate != null)?.currency_rate;
    const sharedRate =
      sharedRateSource != null
        ? formatPriceInputWithCommas(roundTo2Decimals(Number(sharedRateSource)).toFixed(2), 2)
        : "";
    d.linked_pos.forEach((po) => {
      inv[po.intake_id] = sharedInvoice;
      rate[po.intake_id] = sharedRate;
    });
    setPoEditInvoiceNoByIntake(inv);
    setPoEditCurrencyRateByIntake(rate);
  }

  const syncPoEditStateFromExpandedPo = useCallback(
    (poIntakeId: string | null) => {
      if (!poIntakeId || !detail) return;
      if (poEditReceivedQtyByIntake[poIntakeId]) return;
      const po = linkedPoByIntake[poIntakeId];
      if (!po) return;
      const next: Record<string, string> = {};
      (po.line_received ?? []).forEach((l) => {
        next[l.item_id] = deliveredQtyToInputString(l.received_qty ?? 0);
      });
      const items = poDetailsCache[poIntakeId]?.items ?? [];
      items.forEach((it) => {
        if (!(it.id in next)) next[it.id] = "";
      });
      setPoEditReceivedQtyByIntake((prev) => ({ ...prev, [poIntakeId]: next }));
    },
    [detail, linkedPoByIntake, poDetailsCache, poEditReceivedQtyByIntake]
  );

  const syncPoEditDutyStateFromExpandedPo = useCallback(
    (poIntakeId: string | null) => {
      if (!poIntakeId || !detail) return;
      if (poEditDutyPctByIntake[poIntakeId]) return;
      const po = linkedPoByIntake[poIntakeId];
      if (!po) return;
      const fmt = (n: number | null | undefined) =>
        n != null && Number.isFinite(Number(n))
          ? formatPriceInputWithCommas(roundTo2Decimals(Number(n)).toFixed(2), 2)
          : "";
      const next: Record<string, { bm: string; ppn: string; pph: string }> = {};
      const items = poDetailsCache[poIntakeId]?.items ?? [];
      for (const it of items) {
        const saved = po.line_received?.find((l) => l.item_id === it.id);
        next[it.id] = {
          bm: fmt(saved?.bm_percentage ?? null),
          ppn: fmt(saved?.ppn_percentage ?? null),
          pph: fmt(saved?.pph_percentage ?? null),
        };
      }
      (po.line_received ?? []).forEach((l) => {
        if (!next[l.item_id]) {
          next[l.item_id] = {
            bm: fmt(l.bm_percentage),
            ppn: fmt(l.ppn_percentage),
            pph: fmt(l.pph_percentage),
          };
        }
      });
      setPoEditDutyPctByIntake((prev) => ({ ...prev, [poIntakeId]: next }));
    },
    [detail, linkedPoByIntake, poDetailsCache, poEditDutyPctByIntake]
  );

  useEffect(() => {
    expandedPoIds.forEach((poIntakeId) => {
      syncPoEditStateFromExpandedPo(poIntakeId);
      syncPoEditDutyStateFromExpandedPo(poIntakeId);
    });
  }, [expandedPoIds, detail?.linked_pos, syncPoEditStateFromExpandedPo, syncPoEditDutyStateFromExpandedPo]);

  function cancelUpdateMode() {
    setIsUpdatingShipment(false);
    setEditForwarderPick("");
    if (detail) initPoMappingEditsFromDetail(detail);
    setPoEditReceivedQtyByIntake({});
    setPoEditDutyPctByIntake({});
  }

  /** Persists invoice no. and currency rate for every linked PO (after shipment header save). */
  async function persistAllLinkedPoMappings(linkedPos: ShipmentDetailType["linked_pos"]): Promise<boolean> {
    if (!accessToken || !id || !canEditShipment) return true;
    try {
      const first = linkedPos[0];
      if (!first) return true;
      const invoiceNo = (poEditInvoiceNoByIntake[first.intake_id] ?? "").trim() || undefined;
      const firstCurrency = resolvePoCurrencyCode(first, poDetailsCache[first.intake_id]);
      const isIdr = isCurrencyIdr(firstCurrency);
      const rateRawFromAnyPo = linkedPos
        .map((po) => stripCommaThousands((poEditCurrencyRateByIntake[po.intake_id] ?? "").trim()))
        .find((s) => s.length > 0);
      const rateRaw = rateRawFromAnyPo ?? "";
      const parsedRate = rateRaw ? Number(rateRaw) : undefined;
      const currentStatus = detail?.current_status ?? "";
      const customsIdx = SHIPMENT_STATUSES.indexOf("CUSTOMS_CLEARANCE");
      const statusIdx = SHIPMENT_STATUSES.indexOf(currentStatus);
      const enforceNonIdrCurrencyRate = !isIdr && customsIdx >= 0 && statusIdx >= customsIdx;

      if (enforceNonIdrCurrencyRate && (!Number.isFinite(parsedRate) || (parsedRate ?? 0) <= 0)) {
        const msg = "Currency rate is required and must be greater than 0 for non-IDR currency.";
        setActionError(msg);
        pushToast(msg, "error");
        return false;
      }

      let currencyRateForApi: number | null | undefined;
      if (isIdr) {
        currencyRateForApi = null;
      } else if (Number.isFinite(parsedRate) && (parsedRate ?? 0) > 0) {
        currencyRateForApi = roundTo2Decimals(parsedRate as number);
      } else {
        currencyRateForApi = undefined;
      }

      for (const po of linkedPos) {
        const mappingPayload: { invoice_no?: string | null; currency_rate?: number | null } = {
          invoice_no: invoiceNo ?? null,
        };
        if (currencyRateForApi !== undefined) {
          mappingPayload.currency_rate = currencyRateForApi;
        }
        const mapRes = await updateShipmentPoMapping(id, po.intake_id, mappingPayload, accessToken);
        if (isApiError(mapRes)) {
          setActionError(mapRes.message);
          pushToast(mapRes.message, "error");
          return false;
        }
        if (mapRes.data && typeof mapRes.data === "object" && "linked_pos" in mapRes.data) {
          setDetail(mapRes.data as ShipmentDetailType);
        }
      }
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save invoice / currency rate";
      setActionError(msg);
      pushToast(msg, "error");
      return false;
    }
  }

  /** Persists line quantities for all edited linked POs (called after shipment save). */
  async function persistEditedPoLines(linkedPos: ShipmentDetailType["linked_pos"]): Promise<boolean> {
    if (!accessToken || !id || !canEditShipment) return true;
    try {
      const fromQty = linkedPos
        .map((po) => po.intake_id)
        .filter((intakeId) => poEditReceivedQtyByIntake[intakeId] != null);
      const fromDuty = linkedPos
        .map((po) => po.intake_id)
        .filter((intakeId) => poEditDutyPctByIntake[intakeId] != null);
      const targetIntakeIds = [...new Set([...fromQty, ...fromDuty])];
      for (const intakeId of targetIntakeIds) {
        const po = linkedPoByIntake[intakeId];
        if (!po) continue;
        const items = poDetailsCache[intakeId]?.items ?? [];
        if (items.length === 0) continue;
        const poDraft = poEditReceivedQtyByIntake[intakeId] ?? {};
        const dutyDraft = poEditDutyPctByIntake[intakeId] ?? {};
        const parseLinePct = (raw: string | undefined, fallback: number | null): number | null => {
          if (raw === undefined) return fallback;
          const t = stripCommaThousands(raw.trim());
          if (!t) return null;
          const n = roundTo2Decimals(Number(t));
          return Number.isFinite(n) ? n : fallback;
        };
        const lines: {
          item_id: string;
          received_qty: number;
          net_weight_mt: number | null;
          gross_weight_mt: number | null;
          bm_percentage: number | null;
          ppn_percentage: number | null;
          pph_percentage: number | null;
        }[] = [];
        for (const item of items) {
          const received_qty = parseDeliveredQtyInput(poDraft[item.id] ?? "");
          const savedLine = po.line_received?.find((l) => l.item_id === item.id);
          const dRow = dutyDraft[item.id];
          lines.push({
            item_id: item.id,
            received_qty,
            net_weight_mt: null,
            gross_weight_mt: null,
            bm_percentage: dRow ? parseLinePct(dRow.bm, savedLine?.bm_percentage ?? null) : (savedLine?.bm_percentage ?? null),
            ppn_percentage: dRow ? parseLinePct(dRow.ppn, savedLine?.ppn_percentage ?? null) : (savedLine?.ppn_percentage ?? null),
            pph_percentage: dRow ? parseLinePct(dRow.pph, savedLine?.pph_percentage ?? null) : (savedLine?.pph_percentage ?? null),
          });
        }
        const linesRes = await updateShipmentPoLines(id, intakeId, lines, accessToken);
        if (isApiError(linesRes)) {
          setActionError(linesRes.message);
          pushToast(linesRes.message, "error");
          return false;
        }
        if (linesRes.data) setDetail(linesRes.data);
        getPoDetail(intakeId, accessToken).then((res) => {
          if (!isApiError(res) && res.data) {
            setPoDetailsCache((prev) => ({ ...prev, [intakeId]: res.data as PoDetail }));
          }
        });
      }
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save group PO lines";
      setActionError(msg);
      pushToast(msg, "error");
      return false;
    }
  }

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !id || !detail) return;
    setActionError(null);
    setSavingDetails(true);

    const etdSave = editEtd.trim();
    const etaSave = editEta.trim();
    if (etdSave && etaSave && etaSave <= etdSave) {
      const msg = "ETA must be after ETD.";
      setActionError(msg);
      pushToast(msg, "error");
      setSavingDetails(false);
      return;
    }

    const parseOptInt = (raw: string, errMsg: string): number | null | false => {
      const t = raw.trim();
      if (t === "") return null;
      const n = Number(t);
      if (!Number.isInteger(n) || n < 0) {
        setActionError(errMsg);
        pushToast(errMsg, "error");
        return false;
      }
      return n;
    };

    let containerCount20ft: number | null = null;
    let containerCount40ft: number | null = null;
    let packageCount: number | null = null;
    let containerCount20Iso: number | null = null;

    const methodForSave = (editShipmentMethod.trim() || detail.shipment_method || "").trim();
    const sea = isShipmentMethodSea(methodForSave);

    if (sea && editUnit20ft) {
      const v = parseOptInt(
        editContainerCount20ft,
        "Number of 20″ containers must be a non-negative whole number."
      );
      if (v === false) {
        setSavingDetails(false);
        return;
      }
      containerCount20ft = v;
    }
    if (sea && editUnit40ft) {
      const v = parseOptInt(
        editContainerCount40ft,
        "Number of 40″ containers must be a non-negative whole number."
      );
      if (v === false) {
        setSavingDetails(false);
        return;
      }
      containerCount40ft = v;
    }
    if (sea && editUnitPackage) {
      const v = parseOptInt(editPackageCount, "Number of packages must be a non-negative whole number.");
      if (v === false) {
        setSavingDetails(false);
        return;
      }
      packageCount = v;
    }
    if (sea && editUnit20IsoTank) {
      const v = parseOptInt(
        editContainerCount20IsoTank,
        "Number of 20″ ISO tanks must be a non-negative whole number."
      );
      if (v === false) {
        setSavingDetails(false);
        return;
      }
      containerCount20Iso = v;
    }

    const sb = sea ? editShipBy.trim() : "";
    if (sea && !sb) {
      const msg = "Ship by is required when Ship via is Sea.";
      setActionError(msg);
      pushToast(msg, "error");
      setSavingDetails(false);
      return;
    }

    if (!dutyCalculationSkipped) {
      const bmAmt = parseDutyTotalAmountInput(editBmTotal);
      const ppnAmt = parseDutyTotalAmountInput(editPpnTotal);
      const pphAmt = parseDutyTotalAmountInput(editPphTotal);
      if (bmAmt === null) {
        const msg = "BM (total) must be a non-negative number.";
        setActionError(msg);
        pushToast(msg, "error");
        setSavingDetails(false);
        return;
      }
      if (ppnAmt === null) {
        const msg = "PPN (total) must be a non-negative number.";
        setActionError(msg);
        pushToast(msg, "error");
        setSavingDetails(false);
        return;
      }
      if (pphAmt === null) {
        const msg = "PPH (total) must be a non-negative number.";
        setActionError(msg);
        pushToast(msg, "error");
        setSavingDetails(false);
        return;
      }
    }

    const unitFields = !sea
      ? {
          unit_20ft: false,
          unit_40ft: false,
          unit_package: false,
          unit_20_iso_tank: false,
          container_count_20ft: null as number | null,
          container_count_40ft: null as number | null,
          package_count: null as number | null,
          container_count_20_iso_tank: null as number | null,
        }
      : sb === "Bulk"
        ? {
            unit_20ft: false,
            unit_40ft: false,
            unit_package: false,
            unit_20_iso_tank: false,
            container_count_20ft: null as number | null,
            container_count_40ft: null as number | null,
            package_count: null as number | null,
            container_count_20_iso_tank: null as number | null,
          }
        : sb === "LCL"
          ? {
              unit_20ft: false,
              unit_40ft: false,
              unit_20_iso_tank: false,
              unit_package: editUnitPackage,
              container_count_20ft: null as number | null,
              container_count_40ft: null as number | null,
              container_count_20_iso_tank: null as number | null,
              package_count: editUnitPackage ? packageCount : null,
            }
          : sb === "FCL"
            ? {
                unit_package: false,
                package_count: null as number | null,
                unit_20ft: editUnit20ft,
                unit_40ft: editUnit40ft,
                unit_20_iso_tank: editUnit20IsoTank,
                container_count_20ft: editUnit20ft ? containerCount20ft : null,
                container_count_40ft: editUnit40ft ? containerCount40ft : null,
                container_count_20_iso_tank: editUnit20IsoTank ? containerCount20Iso : null,
              }
            : {
                unit_20ft: editUnit20ft,
                unit_40ft: editUnit40ft,
                unit_package: editUnitPackage,
                unit_20_iso_tank: editUnit20IsoTank,
                container_count_20ft: editUnit20ft ? containerCount20ft : null,
                container_count_40ft: editUnit40ft ? containerCount40ft : null,
                package_count: editUnitPackage ? packageCount : null,
                container_count_20_iso_tank: editUnit20IsoTank ? containerCount20Iso : null,
              };

    const payload = {
      vendor_name: editVendorName.trim() || undefined,
      forwarder_name: editForwarderName.trim() || undefined,
      warehouse_name: editWarehouseName.trim() || undefined,
      incoterm: editIncoterm.trim() || undefined,
      kawasan_berikat: editKawasanBerikat === "Yes" || editKawasanBerikat === "No" ? editKawasanBerikat : null,
      surveyor: editSurveyor === "Yes" || editSurveyor === "No" ? editSurveyor : null,
      shipment_method: editShipmentMethod.trim() || undefined,
      ship_by: sea ? editShipBy.trim() || undefined : null,
      product_classification: editProductClassification.trim() || null,
      pib_type: editPibType.trim() || undefined,
      no_request_pib: editNoRequestPib.trim() || undefined,
      ppjk_mkl: editPpjkMkl.trim() || undefined,
      nopen: editNopen.trim() || undefined,
      nopen_date: editNopenDate.trim() || undefined,
      bl_awb: editBlAwb.trim() || undefined,
      insurance_no: editInsuranceNo.trim() || undefined,
      coo: editCoo.trim() || undefined,
      origin_port_name: hasBiddingStep
        ? biddingLanePort.trim() || undefined
        : editOriginPortName.trim() || undefined,
      origin_port_country: hasBiddingStep
        ? biddingLaneCountry.trim() || undefined
        : editOriginPortCountry.trim() || undefined,
      etd: editEtd.trim() || undefined,
      atd: editAtd.trim() || undefined,
      destination_port_name: editDestinationPortName.trim() || undefined,
      destination_port_country: DESTINATION_PORT_COUNTRY,
      eta: editEta.trim() || undefined,
      ata: editAta.trim() || undefined,
      depo: editDepo === "yes" ? true : editDepo === "no" ? false : undefined,
      depo_location:
        editDepo === "yes" ? editDepoLocation.trim() || null : editDepo === "no" ? null : undefined,
      ...unitFields,
      incoterm_amount: editIncotermAmount.trim()
        ? roundTo2Decimals(Number(stripCommaThousands(editIncotermAmount.trim())))
        : undefined,
      incoterm_currency: editIncotermCurrency,
      cbm:
        !sea || editShipBy.trim() !== "LCL"
          ? null
          : editCbm.trim()
            ? Number(editCbm)
            : null,
      net_weight_mt: editNetWeightMt.trim() ? Number(editNetWeightMt) : undefined,
      gross_weight_mt: editGrossWeightMt.trim() ? Number(editGrossWeightMt) : undefined,
      closed_at: editClosedAt.trim() || undefined,
      ...(!dutyCalculationSkipped
        ? {
            bm: parseDutyTotalAmountInput(editBmTotal) ?? 0,
            ppn_amount: parseDutyTotalAmountInput(editPpnTotal) ?? 0,
            pph_amount: parseDutyTotalAmountInput(editPphTotal) ?? 0,
          }
        : {}),
    };
    try {
      const res = await updateShipment(id, payload, accessToken);
      if (isApiError(res)) {
        setActionError(res.message);
        pushToast(res.message, "error");
        return;
      }
      let detailAfterSave: ShipmentDetailType | null = null;
      if (res.data && typeof res.data === "object" && "linked_pos" in res.data) {
        detailAfterSave = res.data as ShipmentDetailType;
        setDetail(detailAfterSave);
      }
      const linkedForMapping = detailAfterSave?.linked_pos ?? detail?.linked_pos ?? [];
      if (canEditShipment && linkedForMapping.length > 0) {
        const okMappings = await persistAllLinkedPoMappings(linkedForMapping);
        if (!okMappings) return;
      }
      if (canEditShipment && linkedForMapping.length > 0) {
        const okLines = await persistEditedPoLines(linkedForMapping);
        if (!okLines) return;
      }
      pushToast("Shipment saved.", "success");
      setIsUpdatingShipment(false);
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update shipment";
      setActionError(msg);
      pushToast(msg, "error");
    } finally {
      setSavingDetails(false);
    }
  }

  function togglePoExpand(intakeId: string) {
    setExpandedPoIds((prev) => {
      const isExpanded = prev.includes(intakeId);
      if (isExpanded) {
        if (activePoOverlayId === intakeId) {
          setPoLineItemsWide(false);
          setActivePoOverlayId(null);
        }
        return prev.filter((id) => id !== intakeId);
      }
      window.setTimeout(() => {
        document.getElementById(`linked-po-card-${intakeId}`)?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }, 50);
      return [...prev, intakeId];
    });
    if (!poDetailsCache[intakeId] && accessToken) {
      setLoadingPoId(intakeId);
      getPoDetail(intakeId, accessToken)
        .then((res) => {
          if (!isApiError(res) && res.data) {
            setPoDetailsCache((prev) => ({ ...prev, [intakeId]: res.data as PoDetail }));
          }
        })
        .finally(() => setLoadingPoId(null));
    }
  }

  function scrollToSection(sectionId: string) {
    const el = document.getElementById(sectionId);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (loading) return <p className={styles.loading}>Loading…</p>;
  if (error) return <p className={styles.error}>{error}</p>;
  if (!detail) return null;

  function progressSectionForField(fieldKey: string): "pre" | "on" | "arrival" | "delivered" {
    if (fieldKey === "closed_at") return "delivered";
    if (
      fieldKey === "pib_type" ||
      fieldKey === "no_request_pib" ||
      fieldKey === "nopen" ||
      fieldKey === "nopen_date" ||
      fieldKey === "incoterm_amount" ||
      fieldKey === "cbm" ||
      fieldKey === "line_duty_percentages" ||
      fieldKey === "has_currency_rate" ||
      fieldKey === "has_received_this_shipment" ||
      fieldKey === "has_linked_po"
    ) {
      return "arrival";
    }
    if (
      fieldKey === "origin_port_name" ||
      fieldKey === "origin_port_country" ||
      fieldKey === "destination_port_name" ||
      fieldKey === "bl_awb" ||
      fieldKey === "ppjk_mkl" ||
      fieldKey === "etd" ||
      fieldKey === "atd" ||
      fieldKey === "eta" ||
      fieldKey === "ata" ||
      fieldKey === "depo" ||
      fieldKey === "depo_location"
    ) {
      return "on";
    }
    return "pre";
  }

  const sectionProgress = (() => {
    const sections = [
      { id: "section-pre-shipment", label: "Pre Shipment", key: "pre" as const },
      { id: "section-on-shipment", label: "On Shipment", key: "on" as const },
      { id: "section-arrival-customs", label: "Arrival & Customs Clearance", key: "arrival" as const },
      { id: "section-delivered", label: "Delivered", key: "delivered" as const },
    ];
    if (!newStatus.trim()) {
      return sections.map((s) => ({ ...s, done: 0, total: 0 }));
    }
    const requiredFieldOnly = requiredFieldsForStatusUpdate.filter((k) => !k.startsWith("doc:"));
    const missingFieldOnly = missingForStatusUpdate.filter((k) => !k.startsWith("doc:"));
    const requiredSet = new Set(requiredFieldOnly);
    const missingSet = new Set(missingFieldOnly);
    return sections.map((s) => {
      let total = 0;
      let missing = 0;
      for (const key of requiredSet) {
        if (progressSectionForField(key) !== s.key) continue;
        total += 1;
        if (missingSet.has(key)) missing += 1;
      }
      return { ...s, done: Math.max(0, total - missing), total };
    });
  })();

  const editToolbarRowEl = isUpdatingShipment ? (
    <div className={styles.editToolbarRow} role="toolbar" aria-label="Shipment edit actions">
      <span className={styles.editToolbarLabel}>Editing shipment — save your changes or cancel to discard.</span>
      <div className={styles.editToolbarActions}>
        <Button type="button" variant="primary" onClick={() => handleSaveDetails({ preventDefault: () => {} } as React.FormEvent)} disabled={savingDetails}>
          {savingDetails ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="secondary" onClick={cancelUpdateMode} disabled={savingDetails}>
          Cancel
        </Button>
      </div>
    </div>
  ) : null;

  const sectionJumpNav = (
    <nav className={styles.categoryNav} aria-label="Shipment sections">
      {sectionProgress.map((section) => (
        <button key={section.id} type="button" className={styles.categoryNavBtn} onClick={() => scrollToSection(section.id)}>
          <span>{section.label}</span>
          {newStatus.trim() && section.total > 0 && (
            <Badge variant={section.done === section.total ? "success" : "warning"} className={styles.sectionProgressBadge}>
              {section.done}/{section.total}
            </Badge>
          )}
        </button>
      ))}
    </nav>
  );

  return (
    <section className={styles.section}>
      <PageHeader
        title={detail.shipment_number}
        subtitle={detail.vendor_name ?? undefined}
        backHref="/dashboard/shipments"
        backLabel="Shipments"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Shipments", href: "/dashboard/shipments" },
          { label: detail.shipment_number },
        ]}
        actions={
          <div className={styles.headerActionsRow}>
            {hasBiddingStep && activeDetailTab === "forwarder-bidding" && canEditShipment && !isUpdatingShipment ? (
              <Button type="button" variant="primary" className={styles.updateShipmentBtn} onClick={enterUpdateMode}>
                Update shipment
              </Button>
            ) : null}
            {detail && canEditShipment && !isUpdatingShipment ? (
              <button
                type="button"
                className={styles.removeShipmentBtn}
                onClick={() => setDeleteConfirmOpen(true)}
              >
                Remove shipment
              </button>
            ) : null}
          </div>
        }
      />

      {actionError && <p className={styles.error}>{actionError}</p>}

      <nav className={styles.tabBar} aria-label="Shipment detail tabs">
        <button
          type="button"
          className={activeDetailTab === "details" ? `${styles.tabBtn} ${styles.tabBtnActive}` : styles.tabBtn}
          onClick={() => setActiveDetailTab("details")}
        >
          Details
        </button>
        {hasBiddingStep && (
          <button
            type="button"
            className={activeDetailTab === "forwarder-bidding" ? `${styles.tabBtn} ${styles.tabBtnActive}` : styles.tabBtn}
            onClick={() => setActiveDetailTab("forwarder-bidding")}
          >
            Forwarder Bidding Transporters
          </button>
        )}
      </nav>

      {isUpdatingShipment && activeDetailTab === "forwarder-bidding" && (
        <div className={styles.stickyShipmentToolbar}>{editToolbarRowEl}</div>
      )}

      {activeDetailTab === "forwarder-bidding" ? (
        <div className={styles.detailLayout}>
          <div className={styles.detailMain}>
            <Card id="section-forwarder-bidding" className={`${styles.card} ${biddingCardHighlightClass}`.trim()}>
              <h2 className={styles.categoryTitle}>Forwarder Bidding Transporters</h2>
              <p className={styles.placeholderNote}>
                This section is shown only when the shipment incoterm is <strong>EXW</strong>, <strong>FCA</strong>, or{" "}
                <strong>FOB</strong> (buyer arranges transport). Set <strong>origin port country</strong> and{" "}
                <strong>origin port name</strong> on the <strong>Details</strong> tab (Pre Shipment → Origin port); every
                bid uses those values. Destination port and ship via stay per bid.
              </p>
              <Card className={styles.recentForwarderCard}>
                <h3 className={styles.subsectionTitle}>Recent forwarders (historical)</h3>
                {loadingRecentForwarders ? (
                  <p className={styles.placeholder}>Loading recent forwarders…</p>
                ) : !effectiveLaneOriginCountry ? (
                  <p className={styles.placeholder}>
                    Set <strong>origin port country</strong> on the <strong>Details</strong> tab (Pre Shipment → Origin
                    port) and save the shipment to load historical quotations for the same origin.
                  </p>
                ) : !hasForwarderNamesOnShipment ? (
                  <p className={styles.placeholder}>
                    Add at least one <strong>bidding participant</strong> or set the <strong>liner forwarder</strong> on
                    this shipment so we know which forwarder names to match against history.
                  </p>
                ) : recentForwarders.length === 0 ? (
                  <p className={styles.placeholder}>
                    No historical bid found for those forwarders with this origin country and an active quotation yet.
                  </p>
                ) : (
                  <div className={styles.recentForwarderList}>
                    {recentForwarders.map((row) => {
                      const meta = getForwarderQuotationExpiryMeta(row.quotation_expires_at, row.duration, row.updated_at);
                      const rowKey = `${row.shipment_id}:${row.forwarder_name}`;
                      const ymd = row.quotation_expires_at?.trim();
                      const expiryLabel = ymd
                        ? `Quotation expires: ${formatDayMonthYear(`${ymd}T12:00:00`)}`
                        : meta.expiresAt
                          ? `Expires: ${formatDayMonthYear(meta.expiresAt.toISOString())} (from legacy duration)`
                          : "No expiry set";
                      return (
                        <div key={`${row.forwarder_name}-${row.shipment_id}`} className={styles.recentForwarderItem}>
                          <div className={styles.recentForwarderMain}>
                            <strong>{row.forwarder_name}</strong>
                            <span className={styles.recentForwarderMeta}>
                              Origin country (historical shipment):{" "}
                              {row.origin_country != null && String(row.origin_country).trim() !== ""
                                ? String(row.origin_country).trim()
                                : "—"}
                            </span>
                            <span className={styles.recentForwarderMeta}>
                              Destination country (historical shipment):{" "}
                              {row.destination_country != null && String(row.destination_country).trim() !== ""
                                ? String(row.destination_country).trim()
                                : "—"}
                            </span>
                            <span className={styles.recentForwarderMeta}>Last update: {formatDayMonthYear(row.updated_at)}</span>
                            <span className={styles.recentForwarderMeta}>{expiryLabel}</span>
                          </div>
                          <Button
                            type="button"
                            variant="primary"
                            disabled={applyingRecentForwarderKey === rowKey}
                            onClick={() => applyForwarderFromRecent(row)}
                          >
                            {applyingRecentForwarderKey === rowKey ? "Saving…" : "Use forwarder"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
              {canEditShipment ? (
                <form onSubmit={handleAddBid} className={styles.bidForm}>
                  <div className={styles.bidFormGrid}>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel} htmlFor="bid-forwarder">Forwarder name *</label>
                      <input id="bid-forwarder" type="text" className={styles.input} value={bidForwarder} onChange={(e) => setBidForwarder(e.target.value)} placeholder="Forwarder / delivery company name" required />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel} htmlFor="bid-service-amount">Service amount</label>
                      <input
                        id="bid-service-amount"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        className={styles.input}
                        value={bidServiceAmount}
                        onChange={(e) => setBidServiceAmount(formatPriceInputWithCommas(e.target.value, 2))}
                        placeholder="1,234.56"
                        aria-label="Service amount"
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel} htmlFor="bid-service-currency">Currency</label>
                      <select
                        id="bid-service-currency"
                        className={styles.input}
                        value={bidServiceCurrency}
                        onChange={(e) => setBidServiceCurrency(e.target.value as FreightChargeCurrency)}
                        aria-label="Service amount currency"
                      >
                        <option value="IDR">IDR</option>
                        <option value="USD">USD</option>
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel} htmlFor="bid-quotation-expires">
                        Quotation expires (optional)
                      </label>
                      <input
                        id="bid-quotation-expires"
                        type="date"
                        className={styles.input}
                        value={bidQuotationExpiresAt}
                        onChange={(e) => setBidQuotationExpiresAt(e.target.value)}
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel} htmlFor="bid-destination-port">Destination port</label>
                      <input id="bid-destination-port" type="text" className={styles.input} value={bidDestinationPort} onChange={(e) => setBidDestinationPort(e.target.value)} placeholder="Port of discharge" />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel} htmlFor="bid-ship-via">Ship via</label>
                      <select id="bid-ship-via" className={styles.input} value={bidShipVia} onChange={(e) => setBidShipVia(e.target.value)}>
                        <option value="">— Select —</option>
                        <option value="Sea">Sea</option>
                        <option value="Air">Air</option>
                      </select>
                    </div>
                  </div>
                  <div className={styles.bidFormActions}>
                    <Button type="submit" variant="primary" disabled={addingBid || !bidForwarder.trim()}>
                      {addingBid ? "Adding…" : "Add participant"}
                    </Button>
                  </div>
                </form>
              ) : (
                <p className={styles.placeholder}>You do not have permission to add or edit bidding participants.</p>
              )}
              {loadingBids ? (
                <p className={styles.placeholder}>Loading bidding participants…</p>
              ) : bids.length === 0 ? (
                <p className={styles.placeholder}>
                  {canEditShipment ? "No bidding participants yet. Add one above." : "No bidding participants yet."}
                </p>
              ) : (
                <div className={styles.bidList}>
                  {bids.map((bid) => {
                    const bidExpiryMeta = getForwarderQuotationExpiryMeta(
                      bid.quotation_expires_at,
                      bid.duration,
                      bid.updated_at
                    );
                    const expiryDisplay =
                      bid.quotation_expires_at?.trim()
                        ? formatDayMonthYear(`${bid.quotation_expires_at.trim().slice(0, 10)}T12:00:00`)
                        : bidExpiryMeta.expiresAt
                          ? `${formatDayMonthYear(bidExpiryMeta.expiresAt.toISOString())} (legacy)`
                          : "—";
                    return (
                    <div key={bid.id} className={styles.bidCard}>
                      {editingBidId === bid.id ? (
                        <form onSubmit={handleSaveBid}>
                          <div className={styles.bidFormGrid}>
                            <div className={styles.field}>
                              <span className={styles.fieldLabel}>Forwarder name</span>
                              <input type="text" className={styles.input} value={editBidForwarder} onChange={(e) => setEditBidForwarder(e.target.value)} required />
                            </div>
                            <div className={styles.field}>
                              <span className={styles.fieldLabel}>Service amount</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                className={styles.input}
                                value={editBidServiceAmount}
                                onChange={(e) => setEditBidServiceAmount(formatPriceInputWithCommas(e.target.value, 2))}
                                placeholder="1,234.56"
                                aria-label="Service amount"
                              />
                            </div>
                            <div className={styles.field}>
                              <span className={styles.fieldLabel}>Currency</span>
                              <select
                                className={styles.input}
                                value={editBidServiceCurrency}
                                onChange={(e) => setEditBidServiceCurrency(e.target.value as FreightChargeCurrency)}
                                aria-label="Service amount currency"
                              >
                                <option value="IDR">IDR</option>
                                <option value="USD">USD</option>
                              </select>
                            </div>
                            <div className={styles.field}>
                              <span className={styles.fieldLabel} id={`edit-bid-quotation-expires-label-${bid.id}`}>
                                Quotation expires (optional)
                              </span>
                              <input
                                type="date"
                                className={styles.input}
                                value={editBidQuotationExpiresAt}
                                onChange={(e) => setEditBidQuotationExpiresAt(e.target.value)}
                                aria-labelledby={`edit-bid-quotation-expires-label-${bid.id}`}
                              />
                            </div>
                            <div className={styles.field}>
                              <span className={styles.fieldLabel}>Destination port</span>
                              <input type="text" className={styles.input} value={editBidDestinationPort} onChange={(e) => setEditBidDestinationPort(e.target.value)} />
                            </div>
                            <div className={styles.field}>
                              <span className={styles.fieldLabel}>Ship via</span>
                              <select className={styles.input} value={editBidShipVia} onChange={(e) => setEditBidShipVia(e.target.value)}>
                                <option value="">—</option>
                                <option value="Sea">Sea</option>
                                <option value="Air">Air</option>
                              </select>
                            </div>
                          </div>
                          <div className={styles.bidFormActions}>
                            <Button type="submit" variant="primary">Save</Button>
                            <Button type="button" variant="secondary" onClick={() => setEditingBidId(null)}>Cancel</Button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <div className={styles.bidCardHeader}>
                            <strong>{bid.forwarder_name}</strong>
                            {canEditShipment && (
                              <div className={styles.bidCardActions}>
                                <Button type="button" variant="secondary" onClick={() => startEditBid(bid)}>Edit</Button>
                                <Button type="button" variant="secondary" onClick={() => handleDeleteBid(bid.id)}>Delete</Button>
                              </div>
                            )}
                          </div>
                          <div className={styles.bidCardGrid}>
                            <div className={styles.field}>
                              <span className={styles.fieldLabel}>Service amount</span>
                              <span className={styles.fieldValue}>
                                {formatFreightChargeLine(
                                  bid.service_amount ?? undefined,
                                  bid.service_amount_currency ?? "IDR"
                                )}
                              </span>
                            </div>
                            <div className={styles.field}>
                              <span className={styles.fieldLabel}>Quotation expires</span>
                              <span className={styles.fieldValue}>{expiryDisplay}</span>
                            </div>
                            <div className={styles.field}>
                              <span className={styles.fieldLabel}>Origin port (lane)</span>
                              <span className={styles.fieldValue}>
                                {display(
                                  (detail.origin_port_name ?? "").trim() ||
                                    (bid.origin_port ?? "").trim() ||
                                    null
                                )}
                              </span>
                            </div>
                            <div className={styles.field}>
                              <span className={styles.fieldLabel}>Destination port</span>
                              <span className={styles.fieldValue}>{display(bid.destination_port)}</span>
                            </div>
                            <div className={styles.field}>
                              <span className={styles.fieldLabel}>Ship via</span>
                              <span className={styles.fieldValue}>{display(bid.ship_via)}</span>
                            </div>
                          </div>
                          <div className={styles.bidQuotation}>
                            <span className={styles.fieldLabel}>Quotation (optional)</span>
                            {bid.quotation_file_name ? (
                              <span>
                                <button type="button" className={styles.bidLink} onClick={() => handleQuotationDownload(bid)}>{bid.quotation_file_name}</button>
                                {canUploadDocument && (
                                  <label className={styles.bidUploadLabel}>
                                    Replace: <input type="file" accept=".pdf,.doc,.docx,image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleQuotationUpload(bid.id, f); e.target.value = ""; }} disabled={uploadingQuotationForBidId === bid.id} />
                                    {uploadingQuotationForBidId === bid.id && " Uploading…"}
                                  </label>
                                )}
                              </span>
                            ) : (
                              canUploadDocument ? (
                                <label className={styles.bidUploadLabel}>
                                  <input type="file" accept=".pdf,.doc,.docx,image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleQuotationUpload(bid.id, f); e.target.value = ""; }} disabled={uploadingQuotationForBidId === bid.id} />
                                  {uploadingQuotationForBidId === bid.id ? " Uploading…" : "Upload quotation"}
                                </label>
                              ) : (
                                <span className={styles.fieldValue}>—</span>
                              )
                            )}
                          </div>
                        </>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      ) : (
        <>
      {isUpdatingShipment ? (
        <div className={styles.stickyShipmentToolbar}>
          {editToolbarRowEl}
          <div className={styles.stickyToolbarSectionNav}>{sectionJumpNav}</div>
        </div>
      ) : (
        <div className={styles.categoryNavRow}>
          {sectionJumpNav}
          {canEditShipment && (
            <div className={styles.categoryNavActions}>
              <Button type="button" variant="primary" className={styles.updateShipmentBtn} onClick={enterUpdateMode}>
                Update shipment
              </Button>
            </div>
          )}
        </div>
      )}

      {newStatus.trim() &&
        requiredForUpdateSet.has("has_bidding_participant") &&
        activeDetailTab === "details" && (
          <div className={styles.statusBiddingHint} role="status">
            <span>
              Before Transport Confirmed, add at least one forwarder in the Bidding Transporter step — open the Forwarder
              Bidding Transporters tab to add one.
            </span>
            <Button type="button" variant="secondary" onClick={() => setActiveDetailTab("forwarder-bidding")}>
              Open Forwarder Bidding
            </Button>
          </div>
        )}

      <div className={styles.detailLayout}>
        <div className={styles.detailMain} data-tour="shipment-main-form">
      <Card id="section-pre-shipment" className={`${styles.card} ${styles.sectionScrollTarget}`}>
        <h2 className={styles.categoryTitle}>Pre Shipment</h2>

        <h3 className={styles.subsectionTitle}>Identification &amp; status</h3>
        <div className={styles.grid}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Shipment number</span>
            <span className={styles.fieldValue}>{detail.shipment_number}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Status</span>
            <Badge variant={statusToBadgeVariant(detail.current_status)}>
              {formatStatusLabel(detail.current_status)}
            </Badge>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Created at</span>
            <span className={styles.fieldValue}>{formatDate(detail.created_at)}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Updated at</span>
            <span className={styles.fieldValue}>{formatDate(detail.updated_at)}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>PIC</span>
            <span className={styles.fieldValue}>{display(detail.pic_name)}</span>
          </div>
        </div>

        <h3 className={styles.subsectionTitle}>Vendor &amp; partners</h3>
        <div className={styles.grid}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Vendor / supplier</span>
            <span className={styles.fieldValue}>{display(isUpdatingShipment ? editVendorName : detail.vendor_name)}</span>
          </div>
          <div
            id="field-forwarder-liner"
            className={statusFieldClass("forwarder_name")}
            data-status-field="forwarder_name"
          >
            <span className={styles.fieldLabel}>Forwarder / liner</span>
            {isUpdatingShipment ? (
              hasBiddingStep ? (
                <div className={styles.forwarderLinerPick}>
                  <select
                    className={styles.input}
                    aria-label="Forwarder / liner source"
                    value={editForwarderPick}
                    onChange={(e) => handleForwarderPickChange(e.target.value)}
                  >
                    <option value="">— Select forwarder —</option>
                    {bids.map((b) => (
                      <option key={b.id} value={`bid:${b.id}`}>
                        {b.forwarder_name.trim() || b.id}
                      </option>
                    ))}
                    {recentForwarders.map((r, i) => (
                      <option key={`recent-${r.shipment_id}-${i}`} value={`recent:${i}`}>
                        Recent: {r.forwarder_name.trim() || "—"}
                      </option>
                    ))}
                    <option value={FORWARDER_LINER_PICK_OTHER}>Other…</option>
                  </select>
                  {editForwarderPick === FORWARDER_LINER_PICK_OTHER ? (
                    <input
                      type="text"
                      className={styles.input}
                      value={editForwarderName}
                      onChange={(e) => setEditForwarderName(e.target.value)}
                      placeholder="Forwarder / liner name"
                      aria-label="Forwarder / liner (other)"
                    />
                  ) : null}
                </div>
              ) : (
                <input
                  type="text"
                  className={styles.input}
                  value={editForwarderName}
                  onChange={(e) => setEditForwarderName(e.target.value)}
                />
              )
            ) : (
              <span className={styles.fieldValue}>{display(detail.forwarder_name)}</span>
            )}
          </div>
          <div className={`${styles.field} ${styles.fieldAddressFull}`}>
            <span className={styles.fieldLabel}>Delivery address</span>
            {isUpdatingShipment ? (
              <textarea
                className={styles.fieldTextarea}
                value={editWarehouseName}
                onChange={(e) => setEditWarehouseName(e.target.value)}
                rows={4}
                placeholder="Delivery address"
                aria-label="Delivery address"
              />
            ) : (
              <span className={`${styles.fieldValue} ${styles.fieldValueMultiline}`}>{display(detail.warehouse_name)}</span>
            )}
          </div>
        </div>

        <h3 className={styles.subsectionTitle}>Origin port (port of loading)</h3>
        <div className={styles.grid}>
          <div className={statusFieldClass("origin_port_name")} data-status-field="origin_port_name">
            <span className={styles.fieldLabel}>Origin port name</span>
            {isUpdatingShipment ? (
              <input
                type="text"
                className={styles.input}
                value={hasBiddingStep ? biddingLanePort : editOriginPortName}
                onChange={(e) =>
                  hasBiddingStep ? setBiddingLanePort(e.target.value) : setEditOriginPortName(e.target.value)
                }
                placeholder="e.g. Port of Shanghai"
                aria-label="Origin port name"
              />
            ) : (
              <span className={styles.fieldValue}>{display(detail.origin_port_name)}</span>
            )}
          </div>
          <div className={statusFieldClass("origin_port_country")} data-status-field="origin_port_country">
            <span className={styles.fieldLabel}>Origin port country</span>
            {isUpdatingShipment ? (
              <ComboboxSelect
                aria-label="Origin port country"
                inputClassName={styles.input}
                options={hasBiddingStep ? biddingLaneCountryOptions : originPortCountryOptions}
                value={hasBiddingStep ? biddingLaneCountry : editOriginPortCountry}
                onChange={hasBiddingStep ? setBiddingLaneCountry : setEditOriginPortCountry}
                allowEmpty
                emptyLabel="— Select country —"
                placeholder="Type to search…"
              />
            ) : (
              <span className={styles.fieldValue}>{display(detail.origin_port_country)}</span>
            )}
          </div>
        </div>

        <h3 className={styles.subsectionTitle}>Shipment Details</h3>
        <div className={styles.grid}>
          <div className={statusFieldClass("product_classification")} data-status-field="product_classification">
            <span className={styles.fieldLabel}>Product classification type</span>
            {isUpdatingShipment ? (
              <select
                className={styles.input}
                value={editProductClassification}
                onChange={(e) => setEditProductClassification(e.target.value)}
                aria-label="Product classification type"
              >
                <option value="">— Select —</option>
                {PRODUCT_CLASSIFICATION_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <span className={styles.fieldValue}>{displayProductClassification(detail.product_classification)}</span>
            )}
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Incoterm</span>
            <span className={styles.fieldValue}>{display(isUpdatingShipment ? editIncoterm : detail.incoterm)}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Kawasan berikat</span>
            {isUpdatingShipment ? (
              <select
                className={styles.input}
                value={editKawasanBerikat}
                onChange={(e) => setEditKawasanBerikat(e.target.value as "" | "Yes" | "No")}
                aria-label="Kawasan berikat"
              >
                <option value="">— Select —</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            ) : (
              <span className={styles.fieldValue}>{formatYesNoOrLegacy(detail.kawasan_berikat)}</span>
            )}
          </div>
          <div className={statusFieldClass("surveyor")} data-status-field="surveyor">
            <span className={styles.fieldLabel}>Surveyor</span>
            {isUpdatingShipment ? (
              <select
                className={styles.input}
                value={editSurveyor}
                onChange={(e) => setEditSurveyor(e.target.value as "" | "Yes" | "No")}
                aria-label="Surveyor"
              >
                <option value="">— Select —</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            ) : (
              <span className={styles.fieldValue}>{formatYesNoOrLegacy(detail.surveyor)}</span>
            )}
          </div>
          <div className={statusFieldClass("shipment_method")} data-status-field="shipment_method">
            <span className={styles.fieldLabel}>Ship via (Sea / Air)</span>
            {isUpdatingShipment ? (
              <select
                className={styles.input}
                value={editShipmentMethod}
                onChange={(e) => {
                  const v = e.target.value;
                  setEditShipmentMethod(v);
                  if (v === "Air") handleShipByEditChange("");
                }}
              >
                <option value="">— Select —</option>
                <option value="Sea">Sea</option>
                <option value="Air">Air</option>
              </select>
            ) : (
              <span className={styles.fieldValue}>{display(detail.shipment_method)}</span>
            )}
          </div>
          <div className={statusFieldClass("ship_by")} data-status-field="ship_by">
            <span className={styles.fieldLabel}>Ship by</span>
            {isUpdatingShipment ? (
              <select
                className={styles.input}
                value={editShipBy}
                onChange={(e) => handleShipByEditChange(e.target.value)}
                disabled={!isShipmentMethodSea(editShipmentMethod.trim() || detail.shipment_method)}
              >
                <option value="">— Select —</option>
                <option value="Bulk">Bulk</option>
                <option value="LCL">LCL</option>
                <option value="FCL">FCL</option>
              </select>
            ) : (
              <span className={styles.fieldValue}>
                {isShipmentMethodSea(detail.shipment_method) ? display(detail.ship_by) : "—"}
              </span>
            )}
          </div>
          <div className={`${styles.field} ${styles.fieldUnitFull}`}>
            <span className={styles.fieldLabel}>Unit</span>
            {isUpdatingShipment ? (
              <div>
                {!isShipmentMethodSea(editShipmentMethod.trim() || detail.shipment_method) ? (
                  <span className={styles.fieldValue}>—</span>
                ) : !editShipBy ? (
                  <span className={styles.fieldHint}>Select Ship by to set units.</span>
                ) : editShipBy === "Bulk" ? (
                  <span className={styles.fieldValue}>—</span>
                ) : editShipBy === "LCL" ? (
                  <div>
                    <div className={styles.unitCheckboxRow}>
                      <label className={styles.unitCheckboxLabel}>
                        <input
                          type="checkbox"
                          checked={editUnitPackage}
                          onChange={(e) => {
                            const v = e.target.checked;
                            setEditUnitPackage(v);
                            if (!v) setEditPackageCount("");
                          }}
                        />
                        Package
                      </label>
                    </div>
                    {editUnitPackage && (
                      <div className={styles.unitCountRow}>
                        <div className={styles.unitCountField}>
                          <span className={styles.fieldLabel}>Number of packages</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            className={styles.input}
                            value={editPackageCount}
                            onChange={(e) => setEditPackageCount(e.target.value)}
                            placeholder="e.g. 10"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : editShipBy === "FCL" ? (
                  <div>
                    <div className={styles.unitCheckboxRow}>
                      <label className={styles.unitCheckboxLabel}>
                        <input
                          type="checkbox"
                          checked={editUnit20ft}
                          onChange={(e) => {
                            const v = e.target.checked;
                            setEditUnit20ft(v);
                            if (!v) setEditContainerCount20ft("");
                          }}
                        />
                        20″
                      </label>
                      <label className={styles.unitCheckboxLabel}>
                        <input
                          type="checkbox"
                          checked={editUnit40ft}
                          onChange={(e) => {
                            const v = e.target.checked;
                            setEditUnit40ft(v);
                            if (!v) setEditContainerCount40ft("");
                          }}
                        />
                        40″
                      </label>
                      <label className={styles.unitCheckboxLabel}>
                        <input
                          type="checkbox"
                          checked={editUnit20IsoTank}
                          onChange={(e) => {
                            const v = e.target.checked;
                            setEditUnit20IsoTank(v);
                            if (!v) setEditContainerCount20IsoTank("");
                          }}
                        />
                        20″ ISO Tank
                      </label>
                    </div>
                    {(editUnit20ft || editUnit40ft || editUnit20IsoTank) && (
                      <div className={styles.unitCountRow}>
                        {editUnit20ft && (
                          <div className={styles.unitCountField}>
                            <span className={styles.fieldLabel}>Number of 20″ containers</span>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              className={styles.input}
                              value={editContainerCount20ft}
                              onChange={(e) => setEditContainerCount20ft(e.target.value)}
                              placeholder="e.g. 2"
                            />
                          </div>
                        )}
                        {editUnit40ft && (
                          <div className={styles.unitCountField}>
                            <span className={styles.fieldLabel}>Number of 40″ containers</span>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              className={styles.input}
                              value={editContainerCount40ft}
                              onChange={(e) => setEditContainerCount40ft(e.target.value)}
                              placeholder="e.g. 1"
                            />
                          </div>
                        )}
                        {editUnit20IsoTank && (
                          <div className={styles.unitCountField}>
                            <span className={styles.fieldLabel}>Number of 20″ ISO tanks</span>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              className={styles.input}
                              value={editContainerCount20IsoTank}
                              onChange={(e) => setEditContainerCount20IsoTank(e.target.value)}
                              placeholder="e.g. 1"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className={styles.fieldHint}>Select Ship by to set units.</span>
                )}
              </div>
            ) : (
              <span className={styles.fieldValue}>
                {isShipmentMethodSea(detail.shipment_method) ? formatShipmentUnits(detail) : "—"}
              </span>
            )}
          </div>
          <div className={statusFieldClass("pib_type")} data-status-field="pib_type">
            <span className={styles.fieldLabel}>PIB type</span>
            {isUpdatingShipment ? (
              <select className={styles.input} value={editPibType} onChange={(e) => setEditPibType(e.target.value)}>
                <option value="">— Select —</option>
                <option value="BC 2.3">BC 2.3</option>
                <option value="BC 2.0">BC 2.0</option>
                <option value="Consignment Note">Consignment Note</option>
              </select>
            ) : (
              <span className={styles.fieldValue}>{displayPibTypeLabel(detail.pib_type)}</span>
            )}
            <span className={styles.fieldHint} role="note">
              Required for document upload
              {isUpdatingShipment ? " — save shipment after selecting PIB type." : "."}
            </span>
          </div>
          <div className={statusFieldClass("no_request_pib")} data-status-field="no_request_pib">
            <span className={styles.fieldLabel}>PIB Doc No</span>
            {isUpdatingShipment ? (
              <input type="text" className={styles.input} value={editNoRequestPib} onChange={(e) => setEditNoRequestPib(e.target.value)} />
            ) : (
              <span className={styles.fieldValue}>{display(detail.no_request_pib)}</span>
            )}
          </div>
          <div className={statusFieldClass("nopen")} data-status-field="nopen">
            <span className={styles.fieldLabel}>Nopen</span>
            {isUpdatingShipment ? (
              <input type="text" className={styles.input} value={editNopen} onChange={(e) => setEditNopen(e.target.value)} />
            ) : (
              <span className={styles.fieldValue}>{display(detail.nopen)}</span>
            )}
          </div>
          <div className={statusFieldClass("nopen_date")} data-status-field="nopen_date">
            <span className={styles.fieldLabel}>Nopen date</span>
            {isUpdatingShipment ? (
              <input type="date" className={styles.input} value={editNopenDate} onChange={(e) => setEditNopenDate(e.target.value)} />
            ) : (
              <span className={styles.fieldValue}>{formatDayMonthYear(detail.nopen_date)}</span>
            )}
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Insurance No</span>
            {isUpdatingShipment ? (
              <input type="text" className={styles.input} value={editInsuranceNo} onChange={(e) => setEditInsuranceNo(e.target.value)} />
            ) : (
              <span className={styles.fieldValue}>{display(detail.insurance_no)}</span>
            )}
          </div>
          <div className={statusFieldClass("coo")} data-status-field="coo">
            <span className={styles.fieldLabel}>COO (Certificate of Origin)</span>
            {isUpdatingShipment ? (
              <input type="text" className={styles.input} value={editCoo} onChange={(e) => setEditCoo(e.target.value)} />
            ) : (
              <span className={styles.fieldValue}>{display(detail.coo)}</span>
            )}
          </div>
        </div>

        <h3 className={styles.subsectionTitle}>ETD (estimated departure) &amp; ATD (actual departure)</h3>
        <div className={styles.grid}>
          <div className={statusFieldClass("etd")} data-status-field="etd">
            <span className={styles.fieldLabel}>ETD</span>
            {isUpdatingShipment ? (
              <input
                type="date"
                className={styles.input}
                value={editEtd}
                max={editEta.trim() ? editEta.trim() : undefined}
                onChange={(e) => setEditEtd(e.target.value)}
                aria-label="ETD (must be before ETA when both set)"
              />
            ) : (
              <span className={styles.fieldValue}>{formatDayMonthYear(detail.etd)}</span>
            )}
          </div>
          <div className={statusFieldClass("atd")} data-status-field="atd">
            <span className={styles.fieldLabel}>ATD</span>
            {isUpdatingShipment ? (
              <input type="date" className={styles.input} value={editAtd} onChange={(e) => setEditAtd(e.target.value)} />
            ) : (
              <span className={styles.fieldValue}>{formatDayMonthYear(detail.atd)}</span>
            )}
          </div>
        </div>
      </Card>

      <Card id="section-on-shipment" className={`${styles.card} ${styles.sectionScrollTarget}`}>
        <h2 className={styles.categoryTitle}>On Shipment</h2>
        <h3 className={styles.subsectionTitle}>BL / AWB &amp; PPJK/EMKL</h3>
        <div className={styles.grid}>
          <div className={statusFieldClass("bl_awb")} data-status-field="bl_awb">
            <span className={styles.fieldLabel}>BL/AWB</span>
            {isUpdatingShipment ? (
              <input type="text" className={styles.input} value={editBlAwb} onChange={(e) => setEditBlAwb(e.target.value)} />
            ) : (
              <span className={styles.fieldValue}>{display(detail.bl_awb)}</span>
            )}
          </div>
          <div className={statusFieldClass("ppjk_mkl")} data-status-field="ppjk_mkl">
            <span className={styles.fieldLabel}>PPJK/EMKL</span>
            {isUpdatingShipment ? (
              <input type="text" className={styles.input} value={editPpjkMkl} onChange={(e) => setEditPpjkMkl(e.target.value)} />
            ) : (
              <span className={styles.fieldValue}>{display(detail.ppjk_mkl)}</span>
            )}
          </div>
        </div>
        <h3 className={styles.subsectionTitle}>Destination port (port of discharge)</h3>
        <div className={styles.grid}>
          <div className={statusFieldClass("destination_port_name")} data-status-field="destination_port_name">
            <span className={styles.fieldLabel}>Destination port name</span>
            {isUpdatingShipment ? (
              <input type="text" className={styles.input} value={editDestinationPortName} onChange={(e) => setEditDestinationPortName(e.target.value)} />
            ) : (
              <span className={styles.fieldValue}>{display(detail.destination_port_name)}</span>
            )}
          </div>
          <div className={statusFieldClass("destination_port_country")} data-status-field="destination_port_country">
            <span className={styles.fieldLabel}>Destination port country</span>
            <span className={styles.fieldValue}>{DESTINATION_PORT_COUNTRY}</span>
          </div>
          <div className={statusFieldClass("depo")} data-status-field="depo">
            <span className={styles.fieldLabel}>Depo</span>
            {isUpdatingShipment ? (
              <select
                className={styles.input}
                value={editDepo}
                onChange={(e) => setEditDepo(e.target.value as "" | "yes" | "no")}
                aria-label="Depo"
              >
                <option value="">— Select —</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            ) : (
              <span className={styles.fieldValue}>{detail.depo === true ? "Yes" : detail.depo === false ? "No" : "—"}</span>
            )}
          </div>
          {(isUpdatingShipment && editDepo === "yes") || (!isUpdatingShipment && detail.depo === true) ? (
            <div className={`${styles.field} ${styles.fieldAddressFull}`}>
              <span className={styles.fieldLabel}>Depo location</span>
              {isUpdatingShipment ? (
                <textarea
                  className={styles.fieldTextarea}
                  value={editDepoLocation}
                  onChange={(e) => setEditDepoLocation(e.target.value)}
                  rows={4}
                  placeholder="Depo location"
                  aria-label="Depo location"
                />
              ) : (
                <span className={`${styles.fieldValue} ${styles.fieldValueMultiline}`}>{display(detail.depo_location)}</span>
              )}
            </div>
          ) : null}
        </div>
        <h3 className={styles.subsectionTitle}>ETA (estimated arrival) &amp; ATA (actual arrival)</h3>
        <div className={styles.grid}>
          <div className={statusFieldClass("eta")} data-status-field="eta">
            <span className={styles.fieldLabel}>ETA</span>
            {isUpdatingShipment ? (
              <input
                type="date"
                className={styles.input}
                value={editEta}
                min={editEtd.trim() ? editEtd.trim() : undefined}
                onChange={(e) => setEditEta(e.target.value)}
                aria-label="ETA (must be after ETD)"
              />
            ) : (
              <span className={styles.fieldValue}>{formatDayMonthYear(detail.eta)}</span>
            )}
          </div>
          <div className={statusFieldClass("ata")} data-status-field="ata">
            <span className={styles.fieldLabel}>ATA</span>
            {isUpdatingShipment ? (
              <input type="date" className={styles.input} value={editAta} onChange={(e) => setEditAta(e.target.value)} />
            ) : (
              <span className={styles.fieldValue}>{formatDayMonthYear(detail.ata)}</span>
            )}
          </div>
        </div>
      </Card>

      <Card id="section-arrival-customs" className={`${styles.card} ${styles.sectionScrollTarget}`}>
        <h2 className={styles.categoryTitle}>Arrival &amp; Customs Clearance</h2>
        <h3 className={styles.subsectionTitle}>Import duties (service, tax &amp; PDRI)</h3>
        <div className={styles.grid}>
          <div className={statusFieldClass("incoterm_amount")} data-status-field="incoterm_amount">
            <span className={styles.fieldLabel}>Freight charges</span>
            {isUpdatingShipment ? (
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className={styles.input}
                value={editIncotermAmount}
                onChange={(e) => setEditIncotermAmount(formatPriceInputWithCommas(e.target.value, 2))}
                placeholder="1,234.56"
                aria-label="Freight charges amount"
              />
            ) : (
              <span className={styles.fieldValue}>
                {formatFreightChargeLine(detail.incoterm_amount, detail.incoterm_currency ?? "IDR")}
              </span>
            )}
          </div>
          {isUpdatingShipment ? (
            <div className={styles.field} data-status-field="incoterm_currency">
              <span className={styles.fieldLabel}>Freight currency</span>
              <select
                className={styles.input}
                value={editIncotermCurrency}
                onChange={(e) => setEditIncotermCurrency(e.target.value as FreightChargeCurrency)}
                aria-label="Freight charges currency"
              >
                <option value="IDR">IDR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          ) : null}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Total Invoice amount</span>
            <span className={styles.fieldValue}>{formatRupiah(detail.total_items_amount)}</span>
          </div>
          {isShipmentMethodSea(isUpdatingShipment ? editShipmentMethod.trim() || detail.shipment_method : detail.shipment_method) &&
          (isUpdatingShipment ? editShipBy : detail.ship_by)?.trim() === "LCL" ? (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>CBM</span>
              {isUpdatingShipment ? (
                <input
                  type="number"
                  min={0}
                  step="0.000001"
                  className={styles.input}
                  value={editCbm}
                  onChange={(e) => setEditCbm(normalizeDecimalInput(e.target.value))}
                  aria-label="CBM (cubic metres)"
                />
              ) : (
                <span className={styles.fieldValue}>
                  {detail.cbm != null ? formatDecimal(detail.cbm) : "—"}
                </span>
              )}
            </div>
          ) : null}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Net weight (MT)</span>
            {isUpdatingShipment ? (
              <input
                type="number"
                min={0}
                step="0.000001"
                className={styles.input}
                value={editNetWeightMt}
                onChange={(e) => setEditNetWeightMt(normalizeDecimalInput(e.target.value))}
              />
            ) : (
              <span className={styles.fieldValue}>
                {detail.net_weight_mt != null ? formatDecimal(detail.net_weight_mt) : "—"}
              </span>
            )}
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Gross weight (MT)</span>
            {isUpdatingShipment ? (
              <input
                type="number"
                min={0}
                step="0.000001"
                className={styles.input}
                value={editGrossWeightMt}
                onChange={(e) => setEditGrossWeightMt(normalizeDecimalInput(e.target.value))}
              />
            ) : (
              <span className={styles.fieldValue}>
                {detail.gross_weight_mt != null ? formatDecimal(detail.gross_weight_mt) : "—"}
              </span>
            )}
          </div>
          {detail.linked_pos.length > 0 ? (
            <div className={arrivalPoMappingWrapClass} data-status-field="has_currency_rate">
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Invoice no.</span>
                {isUpdatingShipment ? (
                  <input
                    type="text"
                    className={styles.input}
                    value={primaryGroupedPo ? poEditInvoiceNoByIntake[primaryGroupedPo.intake_id] ?? "" : ""}
                    onChange={(e) =>
                      setPoEditInvoiceNoByIntake(
                        Object.fromEntries(
                          detail.linked_pos.map((po) => [po.intake_id, e.target.value] as const)
                        )
                      )
                    }
                    placeholder="Invoice number"
                    disabled={!canEditShipment || savingDetails}
                  />
                ) : (
                  <span className={styles.fieldValue}>
                    {display(detail.linked_pos.find((po) => (po.invoice_no ?? "").trim() !== "")?.invoice_no ?? null)}
                  </span>
                )}
              </div>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Currency</span>
                <span className={styles.fieldValue}>{display(primaryGroupedPoCurrency) || "—"}</span>
              </div>
              {!groupedPoIsIdr ? (
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Currency rate</span>
                  {isUpdatingShipment ? (
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      className={styles.input}
                      value={primaryGroupedPo ? poEditCurrencyRateByIntake[primaryGroupedPo.intake_id] ?? "" : ""}
                      onChange={(e) => {
                        const next = formatPriceInputWithCommas(e.target.value, 2);
                        setPoEditCurrencyRateByIntake(
                          Object.fromEntries(detail.linked_pos.map((po) => [po.intake_id, next] as const))
                        );
                      }}
                      placeholder="0.00"
                      disabled={!canEditShipment || savingDetails}
                      aria-label="Currency rate"
                    />
                  ) : (
                    <span className={styles.fieldValue}>
                      {primaryGroupedPo?.currency_rate != null ? formatDecimal(primaryGroupedPo.currency_rate) : "—"}
                    </span>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
          {dutyCalculationSkipped ? (
            <p className={styles.fieldHint} role="note">
              PIB type BC 2.3: BM, PPN, PPH, and PDRI are not calculated for this shipment.
            </p>
          ) : null}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>BM (total)</span>
            {dutyCalculationSkipped ? (
              <span className={styles.fieldValue}>—</span>
            ) : isUpdatingShipment ? (
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className={styles.input}
                value={editBmTotal}
                onChange={(e) => setEditBmTotal(e.target.value)}
                placeholder="IDR amount"
                disabled={!canEditShipment || savingDetails}
                aria-label="BM total amount"
              />
            ) : (
              <span className={styles.fieldValue}>{formatRupiah(detail.bm)}</span>
            )}
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>PPN (total)</span>
            {dutyCalculationSkipped ? (
              <span className={styles.fieldValue}>—</span>
            ) : isUpdatingShipment ? (
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className={styles.input}
                value={editPpnTotal}
                onChange={(e) => setEditPpnTotal(e.target.value)}
                placeholder="IDR amount"
                disabled={!canEditShipment || savingDetails}
                aria-label="PPN total amount"
              />
            ) : (
              <span className={styles.fieldValue}>{formatRupiah(detail.ppn)}</span>
            )}
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>PPH (total)</span>
            {dutyCalculationSkipped ? (
              <span className={styles.fieldValue}>—</span>
            ) : isUpdatingShipment ? (
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className={styles.input}
                value={editPphTotal}
                onChange={(e) => setEditPphTotal(e.target.value)}
                placeholder="IDR amount"
                disabled={!canEditShipment || savingDetails}
                aria-label="PPH total amount"
              />
            ) : (
              <span className={styles.fieldValue}>{formatRupiah(detail.pph)}</span>
            )}
          </div>
          <div className={styles.field}>
            <span className={styles.dutyFieldLabelRow}>
              <span className={styles.fieldLabel}>PDRI (Pajak Dalam Rangka Impor)</span>
              {!dutyCalculationSkipped ? <DutyFormulaHint text={DUTY_FORMULA_PDRI} /> : null}
            </span>
            <span className={styles.fieldValue}>
              {dutyCalculationSkipped
                ? "—"
                : formatRupiah(
                    isUpdatingShipment && previewPdriWhileEditing != null ? previewPdriWhileEditing : detail.pdri
                  )}
            </span>
          </div>
        </div>

        <div
          id="shipment-highlight-linked-po"
          className={`${styles.linkedPoHighlightWrap} ${linkedPoHighlightClass}`.trim()}
          data-status-field={
            (
              [
                "has_linked_po",
                "has_received_this_shipment",
                "has_currency_rate",
                "line_duty_percentages",
              ] as const
            ).find((k) => requiredForUpdateSet.has(k))
          }
        >
        <h3 className={styles.subsectionTitle}>Group PO</h3>
        <p className={styles.linkedPoHint}>
          Each PO is shown as a card below. You can expand multiple POs and review each line-items table independently.
        </p>
        {canCoupleDecouplePo && (
          <div className={`${styles.actions} ${styles.linkedPoActions}`}>
            <Button
              type="button"
              variant="primary"
              className={styles.updateShipmentBtn}
              onClick={() => {
                setCoupleModalError(null);
                setCoupleModal(true);
              }}
            >
              Add Purchase Order
            </Button>
          </div>
        )}
        {detail.linked_pos.length === 0 ? (
          <p className={styles.placeholder}>
            {canCoupleDecouplePo
              ? `No PO in this group yet. Use "Add Purchase Order" to add.`
              : "No PO in this group yet."}
          </p>
        ) : (
          <div className={styles.linkedPoList} role="list">
            {detail.linked_pos.map((po) => {
              const isExpanded = expandedPoIds.includes(po.intake_id);
              const poDetail = poDetailsCache[po.intake_id];
              const isLoading = loadingPoId === po.intake_id;
              const items = poDetail?.items ?? [];
              const groupedAt = new Date(po.coupled_at).toLocaleString();
              return (
                <div
                  key={po.intake_id}
                  id={`linked-po-card-${po.intake_id}`}
                  className={`${styles.linkedPoCard} ${isExpanded ? styles.linkedPoCardExpanded : ""}`.trim()}
                  role="listitem"
                >
                  <div className={styles.linkedPoCardSummary}>
                    <button
                      type="button"
                      className={styles.poExpandBtn}
                      onClick={() => togglePoExpand(po.intake_id)}
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? "Collapse PO details" : "Expand PO details"}
                    >
                      <span className={styles.poExpandIcon} data-expanded={isExpanded}>
                        ▶
                      </span>
                    </button>
                    <div className={styles.linkedPoCardMain}>
                      <div className={styles.linkedPoCardTitleRow}>
                        <Link href={`/dashboard/po/${po.intake_id}`} className={styles.poLink}>
                          {po.po_number}
                        </Link>
                        {items.length > 0 && (
                          <span className={styles.linkedPoLineCountBadge}>
                            {items.length} line{items.length === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                      <div className={styles.linkedPoMetaGrid}>
                        <div className={styles.linkedPoMetaItem}>
                          <span className={styles.linkedPoMetaLabel}>PT</span>
                          <span className={styles.linkedPoMetaValue}>{po.pt ?? "—"}</span>
                        </div>
                        <div className={styles.linkedPoMetaItem}>
                          <span className={styles.linkedPoMetaLabel}>Plant</span>
                          <span className={styles.linkedPoMetaValue}>{po.plant ?? "—"}</span>
                        </div>
                        <div className={styles.linkedPoMetaItem}>
                          <span className={styles.linkedPoMetaLabel}>Supplier</span>
                          <span className={styles.linkedPoMetaValue} title={po.supplier_name}>
                            {po.supplier_name}
                          </span>
                        </div>
                        <div className={styles.linkedPoMetaItem}>
                          <span className={styles.linkedPoMetaLabel}>Incoterms</span>
                          <span className={styles.linkedPoMetaValue}>{po.incoterm_location ?? "—"}</span>
                        </div>
                        <div className={styles.linkedPoMetaItem}>
                          <span className={styles.linkedPoMetaLabel}>Currency</span>
                          <span className={styles.linkedPoMetaValue}>{po.currency ?? "—"}</span>
                        </div>
                        <div className={`${styles.linkedPoMetaItem} ${styles.linkedPoMetaItemWide}`.trim()}>
                          <span className={styles.linkedPoMetaLabel}>Grouped</span>
                          <span className={styles.linkedPoMetaValue}>
                            {groupedAt}
                            <span className={styles.linkedPoMetaSub}> · {po.coupled_by}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    {canCoupleDecouplePo && (
                      <div className={styles.linkedPoCardActions}>
                        <button
                          type="button"
                          className={styles.decoupleBtn}
                          onClick={() => handleDecouple(po.intake_id)}
                          disabled={decouplingId === po.intake_id}
                        >
                          {decouplingId === po.intake_id ? "Removing…" : "Remove"}
                        </button>
                      </div>
                    )}
                  </div>
                  {isExpanded && (
                    <div className={styles.linkedPoCardBody}>
                      {isLoading ? (
                        <p className={styles.poDetailLoading}>Loading PO details…</p>
                      ) : (
                        <div className={styles.poDetailContent}>
                          {items.length === 0 ? (
                            <>
                              <p className={styles.poDetailEmpty}>No items</p>
                              <p className={styles.poLineItemsEmptyHint}>
                                The &quot;Expand table to full width&quot; control only appears when this PO has at least one line item. Open the PO page to confirm lines were imported.
                              </p>
                            </>
                          ) : (
                            <>
                              <div
                                className={poLineItemsToolbarClass}
                                data-status-field={poLineToolbarDataStatusField}
                              >
                                <span className={styles.poLineItemsToolbarLabel}>PO line items</span>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  className={`${styles.poLineItemsWideBtn} ${
                                    poLineItemsWide && activePoOverlayId === po.intake_id ? styles.poLineItemsWideBtnActive : ""
                                  }`.trim()}
                                  onClick={() => {
                                    if (poLineItemsWide && activePoOverlayId === po.intake_id) {
                                      setPoLineItemsWide(false);
                                      setActivePoOverlayId(null);
                                      return;
                                    }
                                    setActivePoOverlayId(po.intake_id);
                                    setPoLineItemsWide(true);
                                  }}
                                  aria-pressed={poLineItemsWide && activePoOverlayId === po.intake_id}
                                  aria-label={
                                    poLineItemsWide && activePoOverlayId === po.intake_id
                                      ? "Close full-window line items table"
                                      : "Open line items in a full-window table"
                                  }
                                >
                                  {poLineItemsWide && activePoOverlayId === po.intake_id
                                    ? "Close wide table"
                                    : "Expand table to full width"}
                                </Button>
                              </div>
                              {poLineItemsWide && activePoOverlayId === po.intake_id ? (
                                <p className={styles.poLineItemsWideDockedHint}>
                                  Line items are shown in the overlay. Close it from there, press Escape, or click the dimmed
                                  background.
                                </p>
                              ) : (
                                <div className={styles.poLineItemsTableViewport}>
                                  <PoLineItemsEditorBlock
                                    po={po}
                                    poDetail={poDetail}
                                    items={items}
                                    intakeId={po.intake_id}
                                    isExpanded={isExpanded}
                                    poEditReceivedQtyByIntake={poEditReceivedQtyByIntake}
                                    setPoEditReceivedQtyByIntake={setPoEditReceivedQtyByIntake}
                                    poEditDutyPctByIntake={poEditDutyPctByIntake}
                                    setPoEditDutyPctByIntake={setPoEditDutyPctByIntake}
                                    dutyCalculationSkipped={dutyCalculationSkipped}
                                    canEditPoLineFields={canEditShipment && isUpdatingShipment}
                                    savingShipmentEdits={savingDetails}
                                    tableClassName={styles.poItemsTable}
                                  />
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        </div>
      </Card>

      {portalMounted &&
        wideOverlayPayload &&
        createPortal(
          <>
            <div
              className={styles.poLineItemsOverlayBackdrop}
              aria-hidden
              onClick={() => {
                setPoLineItemsWide(false);
                setActivePoOverlayId(null);
              }}
            />
            <div
              className={styles.poLineItemsOverlayPanel}
              role="dialog"
              aria-modal="true"
              aria-labelledby="po-line-items-overlay-title"
            >
              <div className={styles.poLineItemsOverlayHeader}>
                <h2 id="po-line-items-overlay-title" className={styles.poLineItemsOverlayTitle}>
                  PO line items — {wideOverlayPayload.po.po_number}
                </h2>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setPoLineItemsWide(false);
                    setActivePoOverlayId(null);
                  }}
                >
                  Close
                </Button>
              </div>
              <div className={styles.poLineItemsOverlayBody}>
                <PoLineItemsEditorBlock
                  po={wideOverlayPayload.po}
                  poDetail={wideOverlayPayload.poDetail}
                  items={wideOverlayPayload.items}
                  intakeId={wideOverlayPayload.intakeId}
                  isExpanded={true}
                  poEditReceivedQtyByIntake={poEditReceivedQtyByIntake}
                  setPoEditReceivedQtyByIntake={setPoEditReceivedQtyByIntake}
                  poEditDutyPctByIntake={poEditDutyPctByIntake}
                  setPoEditDutyPctByIntake={setPoEditDutyPctByIntake}
                  dutyCalculationSkipped={dutyCalculationSkipped}
                  canEditPoLineFields={canEditShipment && isUpdatingShipment}
                  savingShipmentEdits={savingDetails}
                  tableClassName={`${styles.poItemsTable} ${styles.poItemsTableWideOverlay}`.trim()}
                  tableWrapperClassName={styles.poItemsTableWideInnerWrap}
                />
              </div>
            </div>
          </>,
          document.body
        )}

      <Card id="section-delivered" className={`${styles.card} ${styles.sectionScrollTarget}`}>
        <h2 className={styles.categoryTitle}>Delivered</h2>
        <div className={styles.grid}>
          <div className={statusFieldClass("closed_at")} data-status-field="closed_at">
            <span className={styles.fieldLabel}>Delivered at</span>
            {isUpdatingShipment ? (
              <input type="date" className={styles.input} value={editClosedAt} onChange={(e) => setEditClosedAt(e.target.value)} />
            ) : (
              <span className={styles.fieldValue}>{formatDayMonthYear(detail.closed_at)}</span>
            )}
          </div>
        </div>
        {detail.remarks && (
          <>
            <h3 className={styles.subsectionTitle}>Remarks</h3>
            <p className={styles.remarks}>{detail.remarks}</p>
          </>
        )}
      </Card>

      <Card id="section-notes" className={`${styles.card} ${styles.sectionScrollTarget}`} data-tour="shipment-notes">
        <h2 className={styles.categoryTitle}>Notes</h2>
        {canEditShipment ? (
          <form onSubmit={handleAddShipmentNote} className={styles.noteComposer}>
            <label className={styles.field} htmlFor="shipment-note-draft">
              <span className={styles.fieldLabel}>Add a note</span>
              <ShipmentNoteMentionTextarea
                id="shipment-note-draft"
                className={styles.notesTextarea}
                value={noteDraft}
                onChange={setNoteDraft}
                accessToken={accessToken}
                placeholder="Write a note…"
                rows={4}
                disabled={savingNote}
              />
            </label>
            <div className={styles.notesActions}>
              <Button type="submit" variant="primary" disabled={savingNote || !noteDraft.trim()}>
                {savingNote ? "Posting…" : "Post note"}
              </Button>
            </div>
          </form>
        ) : (
          <p className={styles.placeholder}>You do not have permission to add notes to this shipment.</p>
        )}
        <ul className={styles.noteList} aria-label="Shipment notes">
          {shipmentNotes.length === 0 ? (
            <li className={styles.noteEmpty}>No note yet.</li>
          ) : (
            shipmentNotes.map((n) => (
              <li key={n.id} className={styles.noteItem}>
                <div className={styles.noteMeta}>
                  <span className={styles.noteAuthor}>{display(n.created_by_name)}</span>
                  <time className={styles.noteTime} dateTime={n.created_at}>
                    {formatDate(n.created_at)}
                  </time>
                </div>
                <p className={styles.noteBody}>{renderNoteWithMentions(n.note)}</p>
              </li>
            ))
          )}
        </ul>
      </Card>

        </div>
        <aside className={styles.detailSidebar}>
      <Card className={styles.card}>
        <div data-tour="shipment-status-timeline">
          <h2 className={styles.sectionTitle}>Status timeline</h2>
          <Timeline
            items={steppedTimeline}
            formatDate={(iso) => (iso ? formatDate(iso) : "—")}
          />
        </div>
        <div className={styles.timelineUpdateSection} data-tour="shipment-update-status">
          <h3 className={styles.timelineUpdateTitle}>Update status</h3>
          {canUpdateStatus ? (
            <>
              {isUpdatingShipment && (
                <p className={styles.statusPausedHint} role="status">
                  Save or cancel your shipment edits first — status cannot change until draft data is saved or discarded.
                </p>
              )}
              <form onSubmit={handleUpdateStatus}>
                <fieldset className={styles.statusUpdateFieldset} disabled={isUpdatingShipment}>
                  <div className={styles.statusRow}>
                    <label htmlFor="shipment-status-select" className={styles.field}>
                      <span className={styles.fieldLabel}>New status</span>
                      <select
                        id="shipment-status-select"
                        className={styles.statusSelect}
                        value={newStatus}
                        onChange={(e) => setNewStatus(e.target.value)}
                      >
                        <option value="">Select next status…</option>
                        {nextStatusOptions.map((s) => (
                          <option key={s} value={s}>
                            {formatStatusLabel(s)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {newStatus.trim() && requiredFieldsForStatusUpdate.length > 0 && (
                    <p className={styles.statusRequiredLegend}>
                      Highlighted rows are required for this update and still missing.
                    </p>
                  )}
                  {newStatus.trim() && missingForStatusUpdate.length > 0 && (
                    <div className={styles.missingFieldsBox} role="alert">
                      <span className={styles.missingFieldsTitle}>
                        Still required — click to scroll to the field or the Documents section:
                      </span>
                      <ul className={styles.missingFieldsList}>
                        {missingForStatusUpdate.map((key) => (
                          <li key={key}>
                            <button
                              type="button"
                              className={styles.missingFieldJump}
                              onClick={() => scrollToStatusRequirement(key)}
                            >
                              {getFieldLabel(key)}
                            </button>
                          </li>
                        ))}
                      </ul>
                      <p className={styles.missingFieldsHint}>Highlighted rows show what this status needs; fix them in the cards or via &quot;Update shipment&quot;.</p>
                    </div>
                  )}
                  {newStatus.trim() && requiredDocsForUpdate.length > 0 && (
                    <p className={styles.requiredDocsNote}>
                      Required documents: {requiredDocsForUpdate.join("; ")}
                    </p>
                  )}
                  <div className={styles.statusRow}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Remarks (optional)</span>
                      <input
                        type="text"
                        className={styles.input}
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        placeholder="Remarks"
                      />
                    </label>
                  </div>
                  <div className={styles.statusFormActions}>
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={updatingStatus || !canProceedStatusUpdate || isUpdatingShipment}
                    >
                      {updatingStatus ? "Updating…" : "Update status"}
                    </Button>
                  </div>
                </fieldset>
              </form>
            </>
          ) : (
            <p className={styles.placeholder}>You do not have permission to change shipment status.</p>
          )}
          {statusSummary?.last_updated_at && (
            <p className={`${styles.fieldLabel} ${styles.statusSummaryMargin}`}>
              Last updated: {new Date(statusSummary.last_updated_at).toLocaleString()}
            </p>
          )}
        </div>
      </Card>

      <Card className={styles.card} id="section-shipment-documents" data-tour="shipment-documents">
        <h2 className={styles.sectionTitle}>Documents</h2>
        {canUploadDocument ? (
          <p className={styles.shipmentDocSectionIntro} role="note">
            Drag and drop a file onto a category panel, or use the Upload button for that slot.
          </p>
        ) : null}
        <div className={styles.shipmentDocCategories}>
          {getVisibleShipmentDocumentSlots(detail).map((slot) => {
            const slotDocKey = docKeyForDocumentType(slot.document_type);
            const highlightMissing = slotDocKey != null && missingForUpdateSet.has(slotDocKey);
            return (
              <div
                key={slot.document_type}
                className={[
                  styles.shipmentDocCategory,
                  highlightMissing ? styles.shipmentDocCategoryRequiredMissing : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
              {(() => {
                const blockReason = getShipmentDocumentUploadBlockReason({
                  shipment: detail,
                  documentType: slot.document_type,
                  documents: shipmentDocuments,
                  shipmentStatusDelivered: shipmentDocumentsLockedByDeliveredStatus,
                });
                const uploadTitle = getShipmentDocUploadButtonTitle(slot.document_type, blockReason);
                const showSlotLock = blockReason !== null;
                const subShell = (locked: boolean) =>
                  [styles.shipmentDocSub, locked ? styles.shipmentDocSubLocked : styles.shipmentDocSubUnlocked].join(" ");
                const toastRestricted = (r: DocumentUploadBlockReason) =>
                  pushToast(documentRestrictionToastMessage(r), "error");
                const uploadBusy = (key: string) => uploadingDocSlotKey === key;
                const uploadOff = (key: string) => blockReason !== null || uploadBusy(key);

                const prereqHintPib =
                  !shipmentDocumentsLockedByDeliveredStatus && !canUploadPO(detail) ? (
                    <p className={styles.shipmentDocLockedHint} role="note">
                      {slot.document_type === "PO"
                        ? "Set and save PIB type in General Information before uploading PO documents."
                        : "Set and save PIB type in General Information before uploading documents."}
                    </p>
                  ) : null;
                const prereqHintPo =
                  !shipmentDocumentsLockedByDeliveredStatus &&
                  canUploadPO(detail) &&
                  !isPOUploaded(shipmentDocuments) &&
                  slot.document_type !== "PO" ? (
                    <p className={styles.shipmentDocLockedHint} role="note">
                      Upload PO to unlock other documents.
                    </p>
                  ) : null;

                return (
                  <>
                    <h3 className={styles.shipmentDocCategoryTitleRow}>
                      {showSlotLock ? (
                        <Lock className={styles.shipmentDocLockIcon} strokeWidth={2} aria-hidden />
                      ) : null}
                      <span className={styles.shipmentDocCategoryTitleText}>{slot.label}</span>
                    </h3>
                    {prereqHintPib}
                    {prereqHintPo}
                    {slot.per_linked_po ? (
                      <>
                        <p className={styles.shipmentDocPerPoHint}>
                          Upload one or more files for each PO in this shipment group. PO number identifies the intake in
                          the list below.
                        </p>
                        {!detail?.linked_pos?.length ? (
                          <p className={styles.shipmentDocFileEmpty}>
                            No PO in this group yet — add a purchase order to this shipment to upload {slot.label}{" "}
                            documents per PO.
                          </p>
                        ) : (
                          <div className={styles.shipmentDocPoGrid}>
                            {detail.linked_pos.map((po) => {
                              const slotKey = shipmentDocSlotKey(slot.document_type, null, po.intake_id);
                              const files = filterShipmentDocumentsBySlot(shipmentDocuments, slot.document_type, null, {
                                kind: "intake",
                                intakeId: po.intake_id,
                              });
                              return (
                                <ShipmentDocDropZone
                                  key={po.intake_id}
                                  className={subShell(blockReason !== null)}
                                  blockReason={blockReason}
                                  canAct={canUploadDocument}
                                  onToastRestricted={toastRestricted}
                                  showDropHint
                                  onFile={(f) => handleShipmentDocumentUpload(slot.document_type, null, f, po.intake_id)}
                                >
                                  <div className={styles.shipmentDocSubHeader}>
                                    <span className={styles.shipmentDocStatusLabel}>PO {display(po.po_number)}</span>
                                    {canUploadDocument && (
                                      <ShipmentDocUploadControl
                                        disabled={uploadOff(slotKey)}
                                        isUploading={uploadBusy(slotKey)}
                                        labelTitle={uploadTitle}
                                        buttonLabel={slot.document_type === "PO" ? "Upload PO" : "Upload"}
                                        onFile={(f) => handleShipmentDocumentUpload(slot.document_type, null, f, po.intake_id)}
                                      />
                                    )}
                                  </div>
                                  <ul className={styles.shipmentDocFileList}>{renderShipmentDocumentFileList(files)}</ul>
                                </ShipmentDocDropZone>
                              );
                            })}
                            {filterShipmentDocumentsBySlot(shipmentDocuments, slot.document_type, null, {
                              kind: "shipment_level",
                            }).length > 0 && (
                              <div className={styles.shipmentDocSub}>
                                <div className={styles.shipmentDocSubHeader}>
                                  <span className={styles.shipmentDocStatusLabel}>Not tied to a PO</span>
                                  <span className={styles.shipmentDocLegacyNote}>Earlier uploads without PO scope</span>
                                </div>
                                <ul className={styles.shipmentDocFileList}>
                                  {renderShipmentDocumentFileList(
                                    filterShipmentDocumentsBySlot(shipmentDocuments, slot.document_type, null, {
                                      kind: "shipment_level",
                                    })
                                  )}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ) : slot.statuses ? (
                      <div className={styles.shipmentDocStatusGrid}>
                        {slot.statuses.map((st) => {
                          const slotKey = shipmentDocSlotKey(slot.document_type, st);
                          const files = filterShipmentDocumentsBySlot(shipmentDocuments, slot.document_type, st);
                          return (
                            <ShipmentDocDropZone
                              key={st}
                              className={subShell(blockReason !== null)}
                              blockReason={blockReason}
                              canAct={canUploadDocument}
                              onToastRestricted={toastRestricted}
                              showDropHint
                              onFile={(f) => handleShipmentDocumentUpload(slot.document_type, st, f)}
                            >
                              <div className={styles.shipmentDocSubHeader}>
                                <span className={styles.shipmentDocStatusLabel}>{st === "DRAFT" ? "Draft" : "Final"}</span>
                                {canUploadDocument && (
                                  <ShipmentDocUploadControl
                                    disabled={uploadOff(slotKey)}
                                    isUploading={uploadBusy(slotKey)}
                                    labelTitle={uploadTitle}
                                    onFile={(f) => handleShipmentDocumentUpload(slot.document_type, st, f)}
                                  />
                                )}
                              </div>
                              <ul className={styles.shipmentDocFileList}>{renderShipmentDocumentFileList(files)}</ul>
                            </ShipmentDocDropZone>
                          );
                        })}
                      </div>
                    ) : (
                      <ShipmentDocDropZone
                        className={subShell(blockReason !== null)}
                        blockReason={blockReason}
                        canAct={canUploadDocument}
                        onToastRestricted={toastRestricted}
                        showDropHint
                        onFile={(f) => handleShipmentDocumentUpload(slot.document_type, null, f)}
                      >
                        <div className={styles.shipmentDocSubHeader}>
                          <span className={styles.shipmentDocStatusLabel}>Files</span>
                          {canUploadDocument && (
                            <ShipmentDocUploadControl
                              disabled={uploadOff(shipmentDocSlotKey(slot.document_type, null))}
                              isUploading={uploadBusy(shipmentDocSlotKey(slot.document_type, null))}
                              labelTitle={uploadTitle}
                              onFile={(f) => handleShipmentDocumentUpload(slot.document_type, null, f)}
                            />
                          )}
                        </div>
                        <ul className={styles.shipmentDocFileList}>
                          {renderShipmentDocumentFileList(
                            filterShipmentDocumentsBySlot(shipmentDocuments, slot.document_type, null)
                          )}
                        </ul>
                      </ShipmentDocDropZone>
                    )}
                  </>
                );
              })()}
              </div>
            );
          })}
        </div>
      </Card>

        </aside>
      </div>
        </>
      )}

      {deleteConfirmOpen && canEditShipment && (
        <div
          className={styles.modalOverlay}
          onClick={() => !deletingShipment && setDeleteConfirmOpen(false)}
          role="presentation"
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="delete-shipment-title">
            <h3 id="delete-shipment-title" className={styles.modalTitle}>
              Remove this shipment?
            </h3>
            <p className={styles.modalHint}>
              This performs a soft delete: the shipment is hidden from lists and dashboards, and any Purchase Orders
              still linked to it are detached. The record is kept in the database for audit. This cannot be undone from
              the app.
            </p>
            <div className={styles.modalActions}>
              <Button
                type="button"
                variant="primary"
                onClick={handleConfirmSoftDelete}
                disabled={deletingShipment}
                className={styles.removeShipmentConfirmBtn}
              >
                {deletingShipment ? "Removing…" : "Yes, remove shipment"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deletingShipment}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {coupleModal && canCoupleDecouplePo && (
        <div
          className={styles.modalOverlay}
          onClick={() => {
            setCoupleModal(false);
            setCoupleModalError(null);
          }}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Add Purchase Order</h3>
            <p className={styles.modalHint}>
              PO must have the same incoterm and currency as this shipment group. You can enter PO numbers or intake UUIDs;
              separate multiple values with commas or spaces.
            </p>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>PO number(s) or intake ID(s)</span>
              <input
                type="text"
                className={styles.input}
                value={coupleIntakeIds}
                onChange={(e) => {
                  setCoupleIntakeIds(e.target.value);
                  if (coupleModalError) setCoupleModalError(null);
                }}
                placeholder="e.g. PO-2024-001, PO-2024-002"
                aria-invalid={coupleModalError ? true : undefined}
                aria-describedby={coupleModalError ? "couple-modal-error" : undefined}
              />
            </label>
            {coupleModalError && (
              <p id="couple-modal-error" className={styles.error} role="alert">
                {coupleModalError}
              </p>
            )}
            <div className={styles.modalActions}>
              <Button
                type="button"
                variant="primary"
                onClick={handleCouplePo}
                disabled={coupling || !coupleIntakeIds.trim()}
              >
                {coupling ? "Adding…" : "Add to group"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setCoupleModal(false);
                  setCoupleModalError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {!loading && detail && (
        <>
          <button
            type="button"
            className={styles.activityRibbonTrigger}
            onClick={openActivityPanel}
            aria-expanded={activityPanelOpen}
            aria-controls="shipment-activity-panel"
            title="Activity log"
          >
            <ActivityLogRibbonIcon className={styles.activityRibbonIcon} />
            <span className={styles.activityRibbonLabel}>Activity</span>
          </button>
          {activityPanelOpen &&
            portalMounted &&
            createPortal(
              <>
                <div className={styles.activityPanelBackdrop} aria-hidden onClick={closeActivityPanel} />
                <aside
                  id="shipment-activity-panel"
                  className={styles.activityPanel}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="shipment-activity-title"
                >
                  <div className={styles.activityPanelHeader}>
                    <h2 id="shipment-activity-title" className={styles.activityPanelTitle}>
                      Activity log
                    </h2>
                    <Button type="button" variant="secondary" onClick={closeActivityPanel}>
                      Close
                    </Button>
                  </div>
                  <p className={styles.activityPanelHint}>
                    Status changes, shipment field updates, notes, and purchase order link or unlink — with time and user.
                  </p>
                  <div className={styles.activityPanelBody} role="feed" aria-busy={activityLoading}>
                    {activityLoading && <p className={styles.activityPanelState}>Loading…</p>}
                    {!activityLoading && activityError && <p className={styles.error}>{activityError}</p>}
                    {!activityLoading && !activityError && activityItems.length === 0 && (
                      <p className={styles.activityPanelState}>No activity yet.</p>
                    )}
                    {!activityLoading && !activityError && activityItems.length > 0 && (
                      <ul className={styles.activityList}>
                        {activityItems.map((item) => (
                          <li key={item.id} className={styles.activityListItem}>
                            <div className={styles.activityListMeta}>
                              <span className={styles.activityTypeTag}>{activityTypeLabel(item.type)}</span>
                              <time className={styles.activityTime} dateTime={item.occurred_at}>
                                {formatDate(item.occurred_at)}
                              </time>
                            </div>
                            <p className={styles.activityTitle}>{item.title}</p>
                            {item.detail ? <p className={styles.activityDetail}>{item.detail}</p> : null}
                            {item.field_changes && item.field_changes.length > 0 ? (
                              <div className={styles.activityFieldChanges}>
                                {item.field_changes.map((change, idx) => (
                                  <div key={`${item.id}-change-${idx}`} className={styles.activityFieldChangeRow}>
                                    <span className={styles.activityFieldChangeLabel}>{change.label}</span>
                                    <span className={styles.activityFieldChangeValue}>
                                      {renderActivityValue(change.before)} {" -> "} {renderActivityValue(change.after)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            <p className={styles.activityActor}>
                              <span className={styles.activityActorLabel}>By</span> {item.actor}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </aside>
              </>,
              document.body
            )}
        </>
      )}
    </section>
  );
}
