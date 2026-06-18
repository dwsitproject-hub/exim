"use client";

/**
 * BillingOcrUpload — upload + OCR review for export billing documents.
 *
 * Document types:
 *   • "biaya_keluar" — Biaya Keluar (Bea Keluar duty billing)
 *   • "levy"         — Levy (Dana Sawit) billing
 *
 * DJBC billing PDFs contain an embedded text layer, so extraction is fast
 * (no image OCR required). The backend endpoint at /export/bulking/billing-parse
 * returns billing_no and amount_idr parsed from the text layer.
 */

import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { OcrReviewModal, OcrBlockingOverlay, type OcrConfidence } from "@/components/ocr/OcrReviewModal";
import { config } from "@/lib/config";
import { COOKIE_AUTH_SENTINEL } from "@/lib/constants";
import styles from "./BillingOcrUpload.module.css";

// ── Backend response shape (matches billing-pdf-parser.ts BillingParseResult) ──

interface BillingParseApiResult {
  billing_no: string | null;
  /** Parsed IDR amount as integer (e.g. 12948438000) */
  amount_idr: number | null;
  /** Human-readable formatted amount string (e.g. "12,948,438,000") */
  amount_idr_display: string | null;
  doc_type: "biaya_keluar" | "levy";
  confidence: OcrConfidence;
  warnings: string[];
}

/** Shape returned to the parent component when the user clicks Apply. */
export interface ApplyBillingOcrData {
  billing_no: string | null;
  /** IDR total as a numeric integer — ready to store in DB */
  amount_idr: number | null;
}

// ── Backend API call ──────────────────────────────────────────────────────────

async function callBillingOcrApi(
  file: File,
  docType: "biaya_keluar" | "levy",
  accessToken: string,
): Promise<{ data: BillingParseApiResult } | { error: string }> {
  const base = config.apiBaseUrl.replace(/\/$/, "");
  const url = `${base}/export/bulking/billing-parse`;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("doc_type", docType);

  // Auth is HttpOnly-cookie based; COOKIE_AUTH_SENTINEL means no Bearer header needed.
  // credentials: "include" carries the session cookie automatically.
  const headers: Record<string, string> = {};
  if (accessToken && accessToken !== COOKIE_AUTH_SENTINEL) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      body: formData,
      headers,
      credentials: "include",
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return { error: (json as { message?: string }).message ?? `OCR failed (${res.status})` };
    }

    const json = (await res.json()) as { data: BillingParseApiResult };
    return json;
  } catch {
    return { error: "Could not reach the server. Please try again." };
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

type ScanStatus = "idle" | "scanning" | "done" | "error";

export interface BillingOcrUploadProps {
  docType: "biaya_keluar" | "levy";
  accessToken: string;
  onApply: (data: ApplyBillingOcrData) => void;
  disabled?: boolean;
}

const DOC_TYPE_LABELS: Record<BillingOcrUploadProps["docType"], string> = {
  biaya_keluar: "Biaya Keluar",
  levy: "Levy",
};

const FIELD_LABELS: Record<
  BillingOcrUploadProps["docType"],
  { billing_no: string; amount_idr: string }
> = {
  biaya_keluar: {
    billing_no: "Biaya Keluar No",
    amount_idr: "Amount Duty (IDR)",
  },
  levy: {
    billing_no: "Levy Billing No",
    amount_idr: "Levy Amount (IDR)",
  },
};

export function BillingOcrUpload({
  docType,
  accessToken,
  onApply,
  disabled = false,
}: BillingOcrUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<ScanStatus>("idle");
  const [result, setResult] = useState<BillingParseApiResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  // Editable copies of the extracted values — user can correct before applying
  const [editedBillingNo, setEditedBillingNo] = useState<string>("");
  const [editedAmountDisplay, setEditedAmountDisplay] = useState<string>("");

  // Sync editable state when a new scan result arrives
  useEffect(() => {
    if (result) {
      setEditedBillingNo(result.billing_no ?? "");
      setEditedAmountDisplay(result.amount_idr_display ?? (result.amount_idr != null ? String(result.amount_idr) : ""));
    }
  }, [result]);

  const isBusy = status === "scanning";
  const docLabel = DOC_TYPE_LABELS[docType];
  const fieldLabels = FIELD_LABELS[docType];

  async function runParse(file: File) {
    setErrorMsg(null);
    setStatus("scanning");
    setReviewOpen(false);

    const apiRes = await callBillingOcrApi(file, docType, accessToken);

    if ("error" in apiRes) {
      setErrorMsg(apiRes.error);
      setStatus(result ? "done" : "error");
      if (result) setReviewOpen(true);
      return;
    }

    setResult(apiRes.data);
    setStatus("done");
    setReviewOpen(true);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || isBusy || disabled) return;
    e.target.value = "";
    setResult(null);
    setFileName(file.name);
    setReviewOpen(false);
    await runParse(file);
  }

  function handleApply() {
    if (!result || isBusy) return;
    // Parse the user-edited amount string back to a number
    const parsedAmount = editedAmountDisplay.trim()
      ? parseInt(editedAmountDisplay.replace(/[,.\s]/g, ""), 10) || null
      : null;
    onApply({
      billing_no: editedBillingNo.trim() || null,
      amount_idr: parsedAmount,
    });
    setReviewOpen(false);
    setStatus("idle");
    setResult(null);
    setFileName(null);
  }

  function handleDismiss() {
    if (isBusy) return;
    setReviewOpen(false);
    setStatus("idle");
    setResult(null);
    setErrorMsg(null);
    setFileName(null);
    setEditedBillingNo("");
    setEditedAmountDisplay("");
  }

  // Editable review fields — user can correct values before applying
  const reviewFields = result
    ? [
        {
          label: fieldLabels.billing_no,
          value: editedBillingNo,
          editable: true,
          onChange: (v: string) => setEditedBillingNo(v),
        },
        {
          label: fieldLabels.amount_idr,
          value: editedAmountDisplay,
          editable: true,
          onChange: (v: string) => setEditedAmountDisplay(v),
        },
      ]
    : [];

  // ── Render ────────────────────────────────────────────────────────────────

  if (status === "idle" || status === "error") {
    return (
      <div className={`${styles.uploadZone} ${status === "error" ? styles.uploadZoneError : ""}`}>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,application/pdf"
          className={styles.hiddenInput}
          onChange={handleFileChange}
          aria-label={`Upload ${docLabel} PDF`}
          disabled={disabled}
        />
        <div className={styles.uploadContent}>
          <span className={styles.uploadIcon} aria-hidden>
            {status === "error" ? "⚠️" : "📄"}
          </span>
          <div className={styles.uploadText}>
            <span className={styles.uploadTitle}>
              {status === "error" ? "Scan failed" : `Scan ${docLabel} PDF`}
            </span>
            <span className={styles.uploadHint}>
              {status === "error"
                ? errorMsg
                : `Upload a PDF to auto-fill ${docLabel} billing number and amount`}
            </span>
          </div>
          <button
            type="button"
            className={styles.uploadBtn}
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
          >
            {status === "error" ? "Try another file" : "Upload PDF"}
          </button>
          {status === "error" && (
            <button type="button" className={styles.dismissLink} onClick={handleDismiss}>
              Fill manually
            </button>
          )}
        </div>
      </div>
    );
  }

  if (status === "scanning") {
    return (
      <>
        <div className={`${styles.uploadZone} ${styles.uploadZoneBusy}`}>
          <div className={styles.uploadContent}>
            <span className={styles.spinner} aria-hidden />
            <div className={styles.uploadText}>
              <span className={styles.uploadTitle}>Reading document…</span>
              <span className={styles.uploadHint}>
                Extracting billing data from <strong>{fileName}</strong>
              </span>
            </div>
          </div>
        </div>
        {createPortal(
          <OcrBlockingOverlay
            title="Reading document…"
            hint={<>Extracting billing data from <strong>{fileName}</strong>.</>}
          />,
          document.body,
        )}
      </>
    );
  }

  // status === "done"
  return (
    <>
      <div className={`${styles.uploadZone} ${styles.uploadZoneDone}`}>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,application/pdf"
          className={styles.hiddenInput}
          onChange={handleFileChange}
          disabled={disabled || isBusy}
          aria-label={`Upload ${docLabel} PDF`}
        />
        <div className={styles.uploadContent}>
          <span className={styles.uploadIcon} aria-hidden>✅</span>
          <div className={styles.uploadText}>
            <span className={styles.uploadTitle}>Scan complete</span>
            <span className={styles.uploadHint}>{fileName}</span>
          </div>
          <div className={styles.doneActions}>
            <button
              type="button"
              className={styles.uploadBtn}
              onClick={() => setReviewOpen(true)}
              disabled={isBusy}
            >
              Review results
            </button>
            <button
              type="button"
              className={styles.retryBtn}
              onClick={() => fileRef.current?.click()}
              disabled={isBusy || disabled}
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

      <OcrReviewModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title={docLabel}
        subtitle={
          <>
            Review the fields below, then click <strong>Apply to form</strong> to pre-fill the{" "}
            {docLabel} inputs. You can edit anything after applying.
          </>
        }
        fields={reviewFields}
        warnings={result?.warnings}
        confidence={result?.confidence ?? "medium"}
        onApply={handleApply}
        leftActions={
          <button
            type="button"
            className={styles.retryBtn}
            onClick={() => {
              setReviewOpen(false);
              fileRef.current?.click();
            }}
            disabled={isBusy || disabled}
          >
            Upload different file
          </button>
        }
      />
    </>
  );
}
