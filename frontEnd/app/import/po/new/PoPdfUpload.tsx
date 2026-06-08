"use client";

/**
 * PoPdfUpload — "Upload PO Document" button + interactive review modal.
 */

import { useRef, useState, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { parsePoPdf } from "@/services/po-service";
import { isApiError } from "@/types/api";
import type { ParsedPoResult, ParsedPoItem } from "@/types/po";
import styles from "./PoPdfUpload.module.css";

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
  onBusyChange?: (busy: boolean) => void;
}

type ScanStatus = "idle" | "scanning" | "scanning_ai" | "done" | "error";

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence — review carefully",
};

const CONFIDENCE_STYLE: Record<string, string> = {
  high: "badgeHigh",
  medium: "badgeMedium",
  low: "badgeLow",
};

const TEMPLATE_LABEL: Record<string, string> = {
  sap: "SAP",
  coupa: "Coupa",
};

function templateDisplayName(code: string | null): string | null {
  if (!code) return null;
  if (TEMPLATE_LABEL[code]) return TEMPLATE_LABEL[code];
  return code;
}

function aiUnavailableHint(result: ParsedPoResult): { text: string; title: string } {
  if (result.ai_assisted) {
    return { text: "AI used (1 per document)", title: "AI already used for this document" };
  }
  switch (result.ai_unavailable_reason) {
    case "quota_used":
      return {
        text: "AI already used for this file",
        title: "Limit: one AI rescan per document per user",
      };
    case "claude_disabled":
      return {
        text: "AI disabled on server",
        title: "Set PO_PDF_CLAUDE_ENABLED=true in .env and recreate backend",
      };
    case "missing_api_key":
      return {
        text: "AI key not configured",
        title: "Set ANTHROPIC_API_KEY in .env and recreate backend",
      };
    case "missing_session":
      return { text: "Sign in required for AI", title: "Log in again and retry" };
    case "high_confidence":
      return { text: "", title: "" };
    default:
      return { text: "AI extraction unavailable", title: "Check server configuration or quota" };
  }
}

function itemCountSummary(result: ParsedPoResult): string {
  const n = result.items.length;
  if (n === 0) return "none detected";
  if (
    result.item_completeness === "incomplete" &&
    result.expected_item_count != null &&
    n < result.expected_item_count
  ) {
    return `${n} found (expected ~${result.expected_item_count} from line numbers)`;
  }
  return `${n} found`;
}

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
        No line items extracted — please enter them manually in the Items section below.
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

function ConfidenceBadge({ result }: { result: ParsedPoResult }) {
  const confStyle = CONFIDENCE_STYLE[result.confidence] ?? "badgeMedium";
  const before = result.confidence_before;

  if (result.ai_assisted && before && before !== result.confidence) {
    const beforeStyle = CONFIDENCE_STYLE[before] ?? "badgeMedium";
    return (
      <span className={styles.confidenceChange}>
        <span className={`${styles.confidenceBadge} ${styles[beforeStyle]}`}>
          {CONFIDENCE_LABEL[before]}
        </span>
        <span className={styles.confidenceArrow} aria-hidden>
          →
        </span>
        <span className={`${styles.confidenceBadge} ${styles[confStyle]}`}>
          {CONFIDENCE_LABEL[result.confidence]}
        </span>
      </span>
    );
  }

  return (
    <span className={`${styles.confidenceBadge} ${styles[confStyle]}`}>
      {CONFIDENCE_LABEL[result.confidence]}
    </span>
  );
}

function BlockingOverlay({ title, hint }: { title: string; hint: ReactNode }) {
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
    document.body
  );
}

export function PoPdfUpload({ accessToken, onApply, onBusyChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const lastFileRef = useRef<File | null>(null);
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [result, setResult] = useState<ParsedPoResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const isBusy = status === "scanning" || status === "scanning_ai";
  const isAiBusy = status === "scanning_ai";

  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);

  useEffect(() => {
    if (!reviewOpen || isBusy) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setReviewOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);

    requestAnimationFrame(() => {
      const FOCUSABLE = "button:not([disabled]), [tabindex]:not([tabindex='-1'])";
      const first = modalRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? modalRef.current)?.focus();
    });

    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [reviewOpen, isBusy]);

  function triggerFilePicker() {
    if (isBusy) return;
    fileRef.current?.click();
  }

  async function runParse(file: File, requestAi: boolean) {
    setErrorMsg(null);
    setStatus(requestAi ? "scanning_ai" : "scanning");

    if (!requestAi) {
      setReviewOpen(false);
    }

    const res = await parsePoPdf(file, accessToken, { requestAi });
    if (isApiError(res)) {
      setErrorMsg(res.message ?? "Failed to scan document. Please try again.");
      setStatus(result ? "done" : "error");
      if (result) setReviewOpen(true);
      return;
    }

    setResult(res.data as ParsedPoResult);
    setStatus("done");
    setReviewOpen(true);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || isBusy) return;

    e.target.value = "";
    lastFileRef.current = file;
    setResult(null);
    setFileName(file.name);
    setReviewOpen(false);
    await runParse(file, false);
  }

  async function handleRescanWithAi() {
    const file = lastFileRef.current;
    if (!file || !result?.ai_available || isBusy) return;
    await runParse(file, true);
  }

  function handleApply() {
    if (!result || isBusy) return;
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
    lastFileRef.current = null;
  }

  function handleDismiss() {
    if (isBusy) return;
    setReviewOpen(false);
    setStatus("idle");
    setResult(null);
    setErrorMsg(null);
    setFileName(null);
    lastFileRef.current = null;
  }

  const busyOverlay =
    isBusy &&
    createPortal(
      <BlockingOverlay
        title={isAiBusy ? "Running AI extraction…" : "Reading document…"}
        hint={
          isAiBusy ? (
            <>
              Improving capture for <strong>{fileName}</strong> (one-time per file). This may take
              30–90 seconds.
            </>
          ) : (
            <>
              Running OCR on <strong>{fileName}</strong>. This may take 10–30 seconds.
            </>
          )
        }
      />,
      document.body
    );

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
          <span className={styles.uploadIcon} aria-hidden>
            📄
          </span>
          <div className={styles.uploadText}>
            <span className={styles.uploadTitle}>Upload PO Document</span>
            <span className={styles.uploadHint}>
              Upload a PDF purchase order to auto-fill the form below
            </span>
          </div>
          <button type="button" className={styles.uploadBtn} onClick={triggerFilePicker}>
            Choose PDF
          </button>
        </div>
      </div>
    );
  }

  if (status === "scanning" && !result) {
    return (
      <>
        <div className={`${styles.uploadZone} ${styles.uploadZoneBusy}`}>
          <div className={styles.uploadContent}>
            <span className={styles.spinner} aria-hidden />
            <div className={styles.uploadText}>
              <span className={styles.uploadTitle}>Reading document…</span>
              <span className={styles.uploadHint}>
                Running OCR on <strong>{fileName}</strong>.
              </span>
            </div>
          </div>
        </div>
        {busyOverlay}
      </>
    );
  }

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
          <span className={styles.uploadIcon} aria-hidden>
            ⚠️
          </span>
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

  if (result && (status === "done" || isBusy)) {
    return (
      <>
        <div
          className={`${styles.uploadZone} ${styles.uploadZoneDone} ${isBusy ? styles.uploadZoneBusy : ""}`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf"
            className={styles.hiddenInput}
            onChange={handleFileChange}
            disabled={isBusy}
            aria-label="Upload PO PDF document"
          />
          <div className={styles.uploadContent}>
            <span className={styles.uploadIcon} aria-hidden>
              ✅
            </span>
            <div className={styles.uploadText}>
              <span className={styles.uploadTitle}>
                {isBusy ? (isAiBusy ? "AI extraction in progress…" : "Scanning…") : "Scan complete"}
                {!isBusy && <ConfidenceBadge result={result} />}
              </span>
              <span className={styles.uploadHint}>{fileName}</span>
              {!isBusy && !result.ai_available && !result.ai_assisted && result.ai_unavailable_reason !== "high_confidence" ? (
                <span className={styles.uploadHint}>{aiUnavailableHint(result).text}</span>
              ) : null}
              {!isBusy && result.ai_available && !result.ai_assisted ? (
                <span className={styles.uploadHint}>
                  OCR only — use <strong>Rescan with AI</strong> for better line-item capture.
                </span>
              ) : null}
            </div>
            <div className={styles.errorActions}>
              <button
                type="button"
                className={styles.uploadBtn}
                onClick={() => setReviewOpen(true)}
                disabled={isBusy}
              >
                Review results
              </button>
              {result.ai_available && !result.ai_assisted ? (
                <button
                  type="button"
                  className={styles.aiRescanBtn}
                  onClick={handleRescanWithAi}
                  disabled={isBusy}
                  title="Run AI extraction once to improve capture (limited to 1 per document)"
                >
                  Rescan with AI
                </button>
              ) : null}
              <button
                type="button"
                className={styles.retryBtn}
                onClick={triggerFilePicker}
                disabled={isBusy}
              >
                Re-scan
              </button>
              <button
                type="button"
                className={styles.dismissLink}
                onClick={handleDismiss}
                disabled={isBusy}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>

        {reviewOpen &&
          createPortal(
            <div
              className={styles.modalOverlay}
              onClick={() => {
                if (!isBusy) setReviewOpen(false);
              }}
              aria-hidden="false"
            >
              <div
                className={`${styles.modalPanel} ${isBusy ? styles.modalPanelBusy : ""}`}
                role="dialog"
                aria-modal="true"
                aria-label="Review scanned document"
                aria-busy={isBusy}
                tabIndex={-1}
                ref={modalRef}
                onClick={(e) => e.stopPropagation()}
              >
                {isBusy && (
                  <div className={styles.modalBusyOverlay} aria-hidden="true">
                    <span className={styles.spinner} />
                  </div>
                )}

                <div className={styles.modalHeader}>
                  <div className={styles.reviewHeaderLeft}>
                    <span className={styles.reviewIcon} aria-hidden>
                      {result.ai_assisted ? "✨" : "✅"}
                    </span>
                    <span className={styles.reviewTitle}>
                      {result.ai_assisted ? "AI extraction complete" : "Document scanned"}
                    </span>
                    <ConfidenceBadge result={result} />
                  </div>
                  <button
                    type="button"
                    className={styles.modalCloseBtn}
                    onClick={() => setReviewOpen(false)}
                    disabled={isBusy}
                    aria-label="Close review"
                  >
                    ✕
                  </button>
                </div>

                <p className={styles.reviewSubtitle}>
                  {result.ai_available && !result.ai_assisted ? (
                    <>
                      OCR scan complete ({result.items.length} items). For better capture on
                      multi-page POs, click <strong>Rescan with AI</strong> below (once per
                      file), then review and <strong>Apply to form</strong>.
                    </>
                  ) : (
                    <>
                      Review the extracted data below, then click <strong>Apply to form</strong> to
                      pre-fill the fields. You can edit anything after.
                    </>
                  )}
                </p>

                {(result.template_code || result.ai_assisted) && (
                  <p className={styles.parseMeta}>
                    {result.template_code && (
                      <span>Layout: {templateDisplayName(result.template_code)}</span>
                    )}
                    {result.ai_assisted && (
                      <span className={styles.aiNotice}>AI-assisted extraction</span>
                    )}
                  </p>
                )}

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
                      <span className={styles.itemCount}>{itemCountSummary(result)}</span>
                    </h4>
                    <ItemsPreview items={result.items} />
                  </div>
                </div>

                {result.warnings.length > 0 && (
                  <div className={styles.warningsBox}>
                    <p className={styles.warningsTitle}>
                      {result.ai_assisted ? "Extraction notes" : "Notes & warnings"}
                    </p>
                    <ul className={styles.warningsList}>
                      {result.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className={styles.modalFooter}>
                  <div className={styles.modalFooterLeft}>
                    <button
                      type="button"
                      className={styles.retryBtn}
                      onClick={triggerFilePicker}
                      disabled={isBusy}
                    >
                      Upload different file
                    </button>
                    {result.ai_available ? (
                      <button
                        type="button"
                        className={styles.aiRescanBtn}
                        onClick={handleRescanWithAi}
                        disabled={isBusy}
                        title="Run AI extraction once to improve capture (limited to 1 per document)"
                      >
                        Rescan with AI
                      </button>
                    ) : result.ai_unavailable_reason !== "high_confidence" ? (
                      (() => {
                        const hint = aiUnavailableHint(result);
                        return (
                          <span className={styles.aiRescanHint} title={hint.title}>
                            {hint.text}
                          </span>
                        );
                      })()
                    )}
                  </div>
                  <div className={styles.modalFooterActions}>
                    <button
                      type="button"
                      className={styles.dismissLink}
                      onClick={() => setReviewOpen(false)}
                      disabled={isBusy}
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      className={styles.applyBtn}
                      onClick={handleApply}
                      disabled={isBusy}
                    >
                      Apply to form →
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}

        {busyOverlay}
      </>
    );
  }

  return null;
}
