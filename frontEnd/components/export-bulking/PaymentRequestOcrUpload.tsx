"use client";

/**
 * PaymentRequestOcrUpload — upload + OCR review for "Payment of Request - Levy or Duty Taxes" PDFs.
 * Supports incremental apply: each document updates only matching invoice SO rows.
 */

import { useRef, useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { OcrReviewModal, OcrBlockingOverlay, type OcrConfidence } from "@/components/ocr/OcrReviewModal";
import { config } from "@/lib/config";
import { COOKIE_AUTH_SENTINEL } from "@/lib/constants";
import { validatePaymentRequestAgainstInvoice } from "@/lib/export-billing-lines";
import styles from "./BillingOcrUpload.module.css";
import prStyles from "./PaymentRequestOcrUpload.module.css";

interface PaymentRequestLineApi {
  so_no: string;
  qty_mt: number | null;
  billing_code_duty: string | null;
  billing_code_levy: string | null;
  amount_duty_idr: number | null;
  amount_levy_idr: number | null;
}

interface PaymentRequestParseApiResult {
  doc_type: "payment_of_request";
  pr_no: string | null;
  currency_tax: number | null;
  duty_usd_mt: number | null;
  levy_usd_mt: number | null;
  total_amount_duty: number | null;
  total_amount_levy: number | null;
  lines: PaymentRequestLineApi[];
  confidence: OcrConfidence;
  warnings: string[];
}

export interface ApplyPaymentRequestOcrLine {
  so_no: string;
  qty_mt: number | null;
  biaya_keluar_billing_no: string | null;
  levy_billing_no: string | null;
  biaya_keluar_amount_idr: number | null;
  levy_amount_idr: number | null;
}

export interface ApplyPaymentRequestOcrData {
  currency_tax: number | null;
  duty_usd_mt: number | null;
  levy_usd_mt: number | null;
  total_amount_duty: number | null;
  total_amount_levy: number | null;
  lines: ApplyPaymentRequestOcrLine[];
  pr_no?: string | null;
  warnings?: string[];
}

async function callPaymentRequestOcrApi(
  file: File,
  accessToken: string,
  invoiceSos: string[],
): Promise<{ data: PaymentRequestParseApiResult } | { error: string }> {
  const base = config.apiBaseUrl.replace(/\/$/, "");
  const url = `${base}/export/bulking/billing-parse`;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("doc_type", "payment_of_request");
  if (invoiceSos.length > 0) {
    formData.append("hint_sos", JSON.stringify(invoiceSos));
  }

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

    const json = (await res.json()) as { data: PaymentRequestParseApiResult };
    return json;
  } catch {
    return { error: "Could not reach the server. Please try again." };
  }
}

function formatIdr(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

type ScanStatus = "idle" | "scanning" | "done" | "error";

export interface PaymentRequestOcrUploadProps {
  accessToken: string;
  /** Invoice SO numbers on this shipment — used to validate PR lines before apply. */
  invoiceSos: string[];
  onApply: (data: ApplyPaymentRequestOcrData) => void;
  disabled?: boolean;
}

export function PaymentRequestOcrUpload({
  accessToken,
  invoiceSos,
  onApply,
  disabled = false,
}: PaymentRequestOcrUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<ScanStatus>("idle");
  const [result, setResult] = useState<PaymentRequestParseApiResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const [editedCurrencyTax, setEditedCurrencyTax] = useState("");
  const [editedDutyUsd, setEditedDutyUsd] = useState("");
  const [editedLevyUsd, setEditedLevyUsd] = useState("");

  useEffect(() => {
    if (result) {
      setEditedCurrencyTax(result.currency_tax != null ? String(result.currency_tax) : "");
      setEditedDutyUsd(result.duty_usd_mt != null ? String(result.duty_usd_mt) : "");
      setEditedLevyUsd(result.levy_usd_mt != null ? String(result.levy_usd_mt) : "");
    }
  }, [result]);

  const applyLines = useMemo((): ApplyPaymentRequestOcrLine[] => {
    if (!result) return [];
    return result.lines.map((line) => ({
      so_no: line.so_no,
      qty_mt: line.qty_mt,
      biaya_keluar_billing_no: line.billing_code_duty,
      levy_billing_no: line.billing_code_levy,
      biaya_keluar_amount_idr: line.amount_duty_idr,
      levy_amount_idr: line.amount_levy_idr,
    }));
  }, [result]);

  const validation = useMemo(
    () => validatePaymentRequestAgainstInvoice(invoiceSos, applyLines),
    [invoiceSos, applyLines],
  );

  const reviewWarnings = useMemo(() => {
    const w = [...(result?.warnings ?? [])];
    if (validation.missingFromDocument.length > 0) {
      w.push(
        `Invoice SO(s) not in this document (upload another PR later): ${validation.missingFromDocument.join(", ")}`,
      );
    }
    if (validation.blockReason) {
      w.unshift(validation.blockReason);
    }
    return w;
  }, [result?.warnings, validation]);

  const isBusy = status === "scanning";

  async function runParse(file: File) {
    setErrorMsg(null);
    setStatus("scanning");
    setReviewOpen(false);

    const apiRes = await callPaymentRequestOcrApi(file, accessToken, invoiceSos);

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

  function parseDecimalInput(raw: string): number | null {
    const cleaned = raw.replace(/,/g, "").trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  function handleApply() {
    if (!result || isBusy || !validation.canApply) return;

    onApply({
      currency_tax: parseDecimalInput(editedCurrencyTax),
      duty_usd_mt: parseDecimalInput(editedDutyUsd),
      levy_usd_mt: parseDecimalInput(editedLevyUsd),
      total_amount_duty: result.total_amount_duty,
      total_amount_levy: result.total_amount_levy,
      pr_no: result.pr_no,
      warnings: result.warnings,
      lines: applyLines,
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
    setEditedCurrencyTax("");
    setEditedDutyUsd("");
    setEditedLevyUsd("");
  }

  const reviewFields = result
    ? [
        { label: "PR No", value: result.pr_no },
        {
          label: "Currency Tax (Kurs IDR)",
          value: editedCurrencyTax,
          editable: true,
          onChange: setEditedCurrencyTax,
        },
        {
          label: "Biaya Keluar Price ($/MT)",
          value: editedDutyUsd,
          editable: true,
          onChange: setEditedDutyUsd,
        },
        {
          label: "Levy Price ($/MT)",
          value: editedLevyUsd,
          editable: true,
          onChange: setEditedLevyUsd,
        },
        { label: "Total Amount Duty (IDR)", value: formatIdr(result.total_amount_duty) },
        { label: "Total Amount Levy (IDR)", value: formatIdr(result.total_amount_levy) },
        {
          label: "Will apply to SO",
          value: validation.matched.length > 0 ? validation.matched.join(", ") : "—",
        },
      ]
    : [];

  if (status === "idle" || status === "error") {
    return (
      <div className={`${styles.uploadZone} ${status === "error" ? styles.uploadZoneError : ""}`}>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,application/pdf"
          className={styles.hiddenInput}
          onChange={handleFileChange}
          aria-label="Upload Payment of Request PDF"
          disabled={disabled}
        />
        <div className={styles.uploadContent}>
          <span className={styles.uploadIcon} aria-hidden>
            {status === "error" ? "⚠️" : "📄"}
          </span>
          <div className={styles.uploadText}>
            <span className={styles.uploadTitle}>
              {status === "error" ? "Scan failed" : "Scan Payment of Request PDF"}
            </span>
            <span className={styles.uploadHint}>
              {status === "error"
                ? errorMsg
                : "Upload PR to fill matching invoice SO rows (upload again for other PR documents)"}
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
                Extracting Payment of Request data from <strong>{fileName}</strong>
              </span>
            </div>
          </div>
        </div>
        {createPortal(
          <OcrBlockingOverlay
            title="Reading document…"
            hint={
              <>
                Extracting Payment of Request data from <strong>{fileName}</strong>.
              </>
            }
          />,
          document.body,
        )}
      </>
    );
  }

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
          aria-label="Upload Payment of Request PDF"
        />
        <div className={styles.uploadContent}>
          <span className={styles.uploadIcon} aria-hidden>
            ✅
          </span>
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
        title="Payment of Request"
        subtitle={
          <>
            Matched invoice SOs will be updated. SOs not in this document can be filled by uploading another PR later.
            {!validation.canApply && (
              <strong> Fix validation errors before applying.</strong>
            )}
          </>
        }
        fields={reviewFields}
        warnings={reviewWarnings}
        confidence={result?.confidence ?? "medium"}
        onApply={handleApply}
        applyDisabled={!validation.canApply}
        applyLabel={validation.canApply ? "Apply matched SOs →" : "Cannot apply"}
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
      >
        {result && result.lines.length > 0 && (
          <>
            <h4 className={prStyles.linesTitle}>Per-SO billing (from document)</h4>
            <div className={prStyles.linesTableWrap}>
              <table className={prStyles.linesTable}>
                <thead>
                  <tr>
                    <th scope="col">Match</th>
                    <th scope="col">SO No</th>
                    <th scope="col">Qty (MT)</th>
                    <th scope="col">BK Billing No</th>
                    <th scope="col">BK Amount (IDR)</th>
                    <th scope="col">Levy Billing No</th>
                    <th scope="col">Levy Amount (IDR)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.lines.map((line) => {
                    const onInvoice = invoiceSos.some(
                      (so) => so.trim().replace(/\s+/g, "") === line.so_no.trim().replace(/\s+/g, ""),
                    );
                    return (
                      <tr
                        key={line.so_no}
                        className={onInvoice ? prStyles.rowMatch : prStyles.rowMismatch}
                      >
                        <td>{onInvoice ? "✓ Invoice" : "✗ Not on invoice"}</td>
                        <td>{line.so_no}</td>
                        <td>{line.qty_mt != null ? line.qty_mt.toLocaleString("en-US") : "—"}</td>
                        <td>{line.billing_code_duty ?? "—"}</td>
                        <td>{formatIdr(line.amount_duty_idr)}</td>
                        <td>{line.billing_code_levy ?? "—"}</td>
                        <td>{formatIdr(line.amount_levy_idr)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className={prStyles.linesHint}>
              Totals are split by qty share among SOs in this document only. Upload another PR for remaining invoice
              SOs.
            </p>
          </>
        )}
      </OcrReviewModal>
    </>
  );
}
