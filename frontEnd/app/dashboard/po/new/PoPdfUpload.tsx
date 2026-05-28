"use client";

/**
 * PoPdfUpload ΓÇö "Upload PO Document" button + interactive review modal.
 *
 * Flow:
 *  1. User clicks "Choose PDF" ΓåÆ hidden file input opens.
 *  2. File selected ΓåÆ POST /po/import/parse-pdf ΓåÆ loading state.
 *  3. Success ΓåÆ compact "scan complete" zone inline + review modal opens automatically.
 *  4. User reviews in modal, clicks "Apply to form" ΓåÆ onApply() fires + modal closes.
 *  5. User can re-open the modal or dismiss/re-scan at any time.
 */

import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { parsePoPdf } from "@/services/po-service";
import { isApiError } from "@/types/api";
import type { ParsedPoResult, ParsedPoItem } from "@/types/po";
import styles from "./PoPdfUpload.module.css";

// ---------------------------------------------------------------------------
// Types exposed to parent
// ---------------------------------------------------------------------------

export interface ApplyPoData {
  po_number?: string;
  supplier_name?: string;
  currency?: string;
  incoterm_location?: string;
  delivery_location?: string;
  kawasan_berikat?: "Yes" | "No";
  pt?: string;
  plant?: string;
  items: Array<{ item_description: string; qty: number; unit: string; value: number }>;
}

interface Props {
  accessToken: string | null;
  onApply: (data: ApplyPoData) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ScanStatus = "idle" | "scanning" | "done" | "error";

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence ΓÇö review carefully",
};

const CONFIDENCE_STYLE: Record<string, string> = {
  high: "badgeHigh",
  medium: "badgeMedium",
  low: "badgeLow",
};

function FieldRow({ label, value }: { label: string; value: string | null }) {
  const empty = value == null || value.trim() === "";
  return (
    <tr>
      <td className={styles.reviewLabel}>{label}</td>
      <td className={empty ? styles.reviewValueEmpty : styles.reviewValue}>
        {empty ? "Not detected" : value}
      </td>
    </tr>
  );
}

function ItemsPreview({ items }: { items: ParsedPoItem[] }) {
  if (items.length === 0) {
    return (
      <p className={styles.noItems}>
        No line items extracted ΓÇö please enter them manually in the Items section below.
      </p>
    );
  }
  return (
    <div className={styles.itemsPreview}>
      <table className={styles.itemsTable}>
        <thead>
          <tr>
            <th className={styles.itemsTh}>#</th>
            <th className={styles.itemsTh}>Description</th>
            <th className={`${styles.itemsTh} ${styles.numeric}`}>Qty</th>
            <th className={styles.itemsTh}>Unit</th>
            <th className={`${styles.itemsTh} ${styles.numeric}`}>Unit price</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td className={styles.itemsTd}>{i + 1}</td>
              <td className={styles.itemsTd}>
                <span className={styles.itemDesc}>{it.item_description}</span>
                {it.unit_original && it.unit_original.toUpperCase() !== it.unit && (
                  <span className={styles.unitNote}>
                    {" "}(original: {it.unit_original})
                  </span>
                )}
              </td>
              <td className={`${styles.itemsTd} ${styles.numeric}`}>
                {it.qty.toLocaleString()}
              </td>
              <td className={styles.itemsTd}>{it.unit}</td>
              <td className={`${styles.itemsTd} ${styles.numeric}`}>
                {it.value.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 4,
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PoPdfUpload({ accessToken, onApply }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [result, setResult] = useState<ParsedPoResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  // Body scroll lock + Escape key when modal is open
  useEffect(() => {
    if (!reviewOpen) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setReviewOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);

    // Focus first focusable element in modal
    requestAnimationFrame(() => {
      const FOCUSABLE = "button:not([disabled]), [tabindex]:not([tabindex='-1'])";
      const first = modalRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? modalRef.current)?.focus();
    });

    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [reviewOpen]);

  function triggerFilePicker() {
    fileRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = "";
    setResult(null);
    setErrorMsg(null);
    setFileName(file.name);
    setReviewOpen(false);
    setStatus("scanning");

    const res = await parsePoPdf(file, accessToken);
    if (isApiError(res)) {
      setErrorMsg(res.message ?? "Failed to scan document. Please try again.");
      setStatus("error");
      return;
    }

    setResult(res.data as ParsedPoResult);
    setStatus("done");
    setReviewOpen(true);
  }

  function handleApply() {
    if (!result) return;
    const data: ApplyPoData = {
      po_number: result.po_number ?? undefined,
      supplier_name: result.supplier_name ?? undefined,
      currency: result.currency ?? undefined,
      incoterm_location: result.incoterm_location ?? undefined,
      delivery_location: result.delivery_location ?? undefined,
      kawasan_berikat: result.kawasan_berikat ?? undefined,
      pt: result.pt ?? undefined,
      plant: result.plant ?? undefined,
      items: result.items.map((it) => ({
        item_description: it.item_description,
        qty: it.qty,
        unit: it.unit,
        value: it.value,
      })),
    };
    onApply(data);
    setReviewOpen(false);
    setStatus("idle");
    setResult(null);
    setFileName(null);
  }

  function handleDismiss() {
    setReviewOpen(false);
    setStatus("idle");
    setResult(null);
    setErrorMsg(null);
    setFileName(null);
  }

  // ΓöÇΓöÇ Idle ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  if (status === "idle") {
    return (
      <div className={styles.uploadZone}>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,application/pdf"
          className={styles.hiddenInput}
          onChange={handleFileChange}
          aria-label="Upload PO PDF document"
        />
        <div className={styles.uploadContent}>
          <span className={styles.uploadIcon} aria-hidden>≡ƒôä</span>
          <div className={styles.uploadText}>
            <span className={styles.uploadTitle}>Upload PO Document</span>
            <span className={styles.uploadHint}>
              Upload a PDF purchase order to auto-fill the form below
            </span>
          </div>
          <button
            type="button"
            className={styles.uploadBtn}
            onClick={triggerFilePicker}
          >
            Choose PDF
          </button>
        </div>
      </div>
    );
  }

  // ΓöÇΓöÇ Scanning ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  if (status === "scanning") {
    return (
      <div className={styles.uploadZone}>
        <div className={styles.uploadContent}>
          <span className={styles.spinner} aria-hidden />
          <div className={styles.uploadText}>
            <span className={styles.uploadTitle}>Reading documentΓÇª</span>
            <span className={styles.uploadHint}>
              Running OCR on <strong>{fileName}</strong>. This may take 10ΓÇô30 seconds.
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ΓöÇΓöÇ Error ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  if (status === "error") {
    return (
      <div className={`${styles.uploadZone} ${styles.uploadZoneError}`}>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,application/pdf"
          className={styles.hiddenInput}
          onChange={handleFileChange}
          aria-label="Upload PO PDF document"
        />
        <div className={styles.uploadContent}>
          <span className={styles.uploadIcon} aria-hidden>ΓÜá∩╕Å</span>
          <div className={styles.uploadText}>
            <span className={styles.uploadTitle}>Scan failed</span>
            <span className={styles.uploadHint}>{errorMsg}</span>
          </div>
          <div className={styles.errorActions}>
            <button type="button" className={styles.retryBtn} onClick={triggerFilePicker}>
              Try another file
            </button>
            <button type="button" className={styles.dismissLink} onClick={handleDismiss}>
              Fill manually
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ΓöÇΓöÇ Done ΓÇö compact inline zone + review modal ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  if (status === "done" && result) {
    const confStyle = CONFIDENCE_STYLE[result.confidence] ?? "badgeMedium";

    return (
      <>
        {/* Compact inline zone ΓÇö visible behind/beneath the modal */}
        <div className={`${styles.uploadZone} ${styles.uploadZoneDone}`}>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf"
            className={styles.hiddenInput}
            onChange={handleFileChange}
            aria-label="Upload PO PDF document"
          />
          <div className={styles.uploadContent}>
            <span className={styles.uploadIcon} aria-hidden>Γ£à</span>
            <div className={styles.uploadText}>
              <span className={styles.uploadTitle}>
                Scan complete
                <span className={`${styles.confidenceBadge} ${styles[confStyle]}`}>
                  {CONFIDENCE_LABEL[result.confidence]}
                </span>
              </span>
              <span className={styles.uploadHint}>{fileName}</span>
            </div>
            <div className={styles.errorActions}>
              <button
                type="button"
                className={styles.uploadBtn}
                onClick={() => setReviewOpen(true)}
              >
                Review results
              </button>
              <button type="button" className={styles.retryBtn} onClick={triggerFilePicker}>
                Re-scan
              </button>
              <button type="button" className={styles.dismissLink} onClick={handleDismiss}>
                Dismiss
              </button>
            </div>
          </div>
        </div>

        {/* Review modal ΓÇö rendered via portal to escape form stacking context */}
        {reviewOpen && createPortal(
          <div
            className={styles.modalOverlay}
            onClick={() => setReviewOpen(false)}
            aria-hidden="false"
          >
            <div
              className={styles.modalPanel}
              role="dialog"
              aria-modal="true"
              aria-label="Review scanned document"
              tabIndex={-1}
              ref={modalRef}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className={styles.modalHeader}>
                <div className={styles.reviewHeaderLeft}>
                  <span className={styles.reviewIcon} aria-hidden>Γ£à</span>
                  <span className={styles.reviewTitle}>Document scanned</span>
                  <span className={`${styles.confidenceBadge} ${styles[confStyle]}`}>
                    {CONFIDENCE_LABEL[result.confidence]}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setReviewOpen(false)}
                  aria-label="Close review"
                >
                  Γ£ò
                </button>
              </div>

              <p className={styles.reviewSubtitle}>
                Review the extracted data below, then click{" "}
                <strong>Apply to form</strong> to pre-fill the fields. You can edit anything after.
              </p>

              {/* Two-column body */}
              <div className={styles.reviewBody}>
                <div className={styles.reviewFieldsSection}>
                  <h4 className={styles.reviewSectionTitle}>General fields</h4>
                  <table className={styles.reviewTable}>
                    <tbody>
                      <FieldRow label="PO Number" value={result.po_number} />
                      <FieldRow label="Supplier" value={result.supplier_name} />
                      <FieldRow label="Currency" value={result.currency} />
                      <FieldRow label="Incoterm" value={result.incoterm_location} />
                      <FieldRow label="Delivery location" value={result.delivery_location} />
                      <FieldRow label="Kawasan berikat" value={result.kawasan_berikat} />
                      <FieldRow label="PT" value={result.pt ?? null} />
                      <FieldRow label="Plant" value={result.plant ?? null} />
                    </tbody>
                  </table>
                </div>

                <div className={styles.reviewItemsSection}>
                  <h4 className={styles.reviewSectionTitle}>
                    Line items
                    <span className={styles.itemCount}>
                      {result.items.length === 0
                        ? "none detected"
                        : `${result.items.length} found`}
                    </span>
                  </h4>
                  <ItemsPreview items={result.items} />
                </div>
              </div>

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <div className={styles.warningsBox}>
                  <p className={styles.warningsTitle}>ΓÜá∩╕Å Notes &amp; warnings</p>
                  <ul className={styles.warningsList}>
                    {result.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Modal footer */}
              <div className={styles.modalFooter}>
                <button type="button" className={styles.retryBtn} onClick={triggerFilePicker}>
                  Upload different file
                </button>
                <div className={styles.modalFooterActions}>
                  <button
                    type="button"
                    className={styles.dismissLink}
                    onClick={() => setReviewOpen(false)}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className={styles.applyBtn}
                    onClick={handleApply}
                  >
                    Apply to form ΓåÆ
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

  return null;
}
