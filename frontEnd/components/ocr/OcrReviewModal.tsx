"use client";

/**
 * OcrReviewModal — generic review panel for any OCR-extracted document.
 *
 * Used by:
 *   • Import → PO PDF upload (field preview + line items)
 *   • Export → Billing BK / Levy PDF upload (field preview only)
 *
 * Callers supply the extracted fields (and optionally a custom body) and
 * receive an `onApply` callback when the user confirms.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./OcrReviewModal.module.css";

// ── Confidence badge ──────────────────────────────────────────────────────────

export type OcrConfidence = "high" | "medium" | "low";

const CONFIDENCE_LABEL: Record<OcrConfidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence — review carefully",
};

const CONFIDENCE_STYLE: Record<OcrConfidence, string> = {
  high: "badgeHigh",
  medium: "badgeMedium",
  low: "badgeLow",
};

export function OcrConfidenceBadge({
  confidence,
  confidenceBefore,
  aiAssisted,
}: {
  confidence: OcrConfidence;
  confidenceBefore?: OcrConfidence | null;
  aiAssisted?: boolean;
}) {
  const confStyle = CONFIDENCE_STYLE[confidence] ?? "badgeMedium";

  if (aiAssisted && confidenceBefore && confidenceBefore !== confidence) {
    const beforeStyle = CONFIDENCE_STYLE[confidenceBefore] ?? "badgeMedium";
    return (
      <span className={styles.confidenceChange}>
        <span className={`${styles.confidenceBadge} ${styles[beforeStyle]}`}>
          {CONFIDENCE_LABEL[confidenceBefore]}
        </span>
        <span className={styles.confidenceArrow} aria-hidden>→</span>
        <span className={`${styles.confidenceBadge} ${styles[confStyle]}`}>
          {CONFIDENCE_LABEL[confidence]}
        </span>
      </span>
    );
  }

  return (
    <span className={`${styles.confidenceBadge} ${styles[confStyle]}`}>
      {CONFIDENCE_LABEL[confidence]}
    </span>
  );
}

// ── Blocking overlay (during scan / AI) ──────────────────────────────────────

export function OcrBlockingOverlay({ title, hint }: { title: string; hint: ReactNode }) {
  return createPortal(
    <div
      className={styles.blockingOverlay}
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-label={title}
    >
      <div className={styles.blockingPanel}>
        <span className={styles.spinner} aria-hidden />
        <p className={styles.blockingTitle}>{title}</p>
        <p className={styles.blockingHint}>{hint}</p>
        <p className={styles.blockingNote}>
          Please wait — the form is disabled until processing completes.
        </p>
      </div>
    </div>,
    document.body,
  );
}

// ── Field rows in the review table ───────────────────────────────────────────

export interface OcrFieldRow {
  label: string;
  value: string | null | undefined;
  /** When true, renders an editable input so the user can correct OCR mistakes. */
  editable?: boolean;
  onChange?: (value: string) => void;
}

export function OcrFieldRowUI({ label, value, editable, onChange }: OcrFieldRow) {
  const empty = value == null || value.toString().trim() === "";
  return (
    <tr>
      <td className={styles.reviewLabel}>{label}</td>
      <td className={editable ? styles.reviewValueEditable : empty ? styles.reviewValueEmpty : styles.reviewValue}>
        {editable ? (
          <input
            className={styles.reviewInput}
            type="text"
            value={value ?? ""}
            placeholder="Not detected — enter manually"
            onChange={(e) => onChange?.(e.target.value)}
          />
        ) : empty ? (
          "Not detected"
        ) : (
          value
        )}
      </td>
    </tr>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export interface OcrReviewModalProps {
  /** Whether the modal is visible. */
  open: boolean;
  onClose: () => void;

  /** Heading shown in the modal header. */
  title: string;

  /** Optional subtitle / instructions. */
  subtitle?: ReactNode;

  /** Extracted header fields to render in the review table. */
  fields: OcrFieldRow[];

  /** Optional custom content rendered below the fields table (e.g. line items). */
  children?: ReactNode;

  /** Warnings / notes from the OCR engine. */
  warnings?: string[];

  /** Confidence of OCR result. */
  confidence?: OcrConfidence;
  confidenceBefore?: OcrConfidence | null;
  aiAssisted?: boolean;

  /** Template name string, shown as metadata under the header. */
  templateName?: string | null;

  /** Whether an async operation is in progress (dims the modal). */
  busy?: boolean;

  /** Primary action — Apply extracted data to form. */
  onApply: () => void;
  applyLabel?: string;
  /** When true, primary Apply action is disabled (e.g. validation failed). */
  applyDisabled?: boolean;

  /** Secondary left-side actions (e.g. rescan, upload different file). */
  leftActions?: ReactNode;
}

export function OcrReviewModal({
  open,
  onClose,
  title,
  subtitle,
  fields,
  children,
  warnings,
  confidence = "medium",
  confidenceBefore,
  aiAssisted,
  templateName,
  busy = false,
  onApply,
  applyLabel = "Apply to form →",
  applyDisabled = false,
  leftActions,
}: OcrReviewModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      const FOCUSABLE = "button:not([disabled]), [tabindex]:not([tabindex='-1'])";
      const first = modalRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? modalRef.current)?.focus();
    });

    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || busy) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={styles.modalOverlay}
      onClick={() => { if (!busy) onClose(); }}
      aria-hidden="false"
    >
      <div
        className={`${styles.modalPanel} ${busy ? styles.modalPanelBusy : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-busy={busy}
        tabIndex={-1}
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        {busy && (
          <div className={styles.modalBusyOverlay} aria-hidden="true">
            <span className={styles.spinner} />
          </div>
        )}

        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.reviewHeaderLeft}>
            <span className={styles.reviewIcon} aria-hidden>
              {aiAssisted ? "✨" : "✅"}
            </span>
            <span className={styles.reviewTitle}>{title}</span>
            <OcrConfidenceBadge
              confidence={confidence}
              confidenceBefore={confidenceBefore}
              aiAssisted={aiAssisted}
            />
          </div>
          <button
            type="button"
            className={styles.modalCloseBtn}
            onClick={onClose}
            disabled={busy}
            aria-label="Close review"
          >
            ✕
          </button>
        </div>

        {/* Subtitle */}
        {subtitle && (
          <p className={styles.reviewSubtitle}>{subtitle}</p>
        )}

        {/* Meta: template / AI notice */}
        {(templateName || aiAssisted) && (
          <p className={styles.parseMeta}>
            {templateName && <span>Layout: {templateName}</span>}
            {aiAssisted && <span className={styles.aiNotice}>AI-assisted extraction</span>}
          </p>
        )}

        {/* Body */}
        <div className={styles.reviewBody}>
          <div className={styles.reviewFieldsSection}>
            <h4 className={styles.reviewSectionTitle}>Extracted fields</h4>
            <table className={styles.reviewTable}>
              <tbody>
                {fields.map((f, i) => (
                  <OcrFieldRowUI
                    key={i}
                    label={f.label}
                    value={f.value}
                    editable={f.editable}
                    onChange={f.onChange}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {children && (
            <div className={styles.reviewItemsSection}>{children}</div>
          )}
        </div>

        {/* Warnings */}
        {warnings && warnings.length > 0 && (
          <div className={styles.warningsBox}>
            <p className={styles.warningsTitle}>
              {aiAssisted ? "Extraction notes" : "Notes & warnings"}
            </p>
            <ul className={styles.warningsList}>
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer */}
        <div className={styles.modalFooter}>
          <div className={styles.modalFooterLeft}>
            {leftActions}
          </div>
          <div className={styles.modalFooterActions}>
            <button
              type="button"
              className={styles.dismissLink}
              onClick={onClose}
              disabled={busy}
            >
              Close
            </button>
            <button
              type="button"
              className={styles.applyBtn}
              onClick={onApply}
              disabled={busy || applyDisabled}
            >
              {applyLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
