"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/providers/ToastProvider";
import { Card } from "@/components/cards";
import { EmptyState, PageHeader } from "@/components/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/tables";
import { LoadingSkeleton } from "@/components/feedback";
import { isApiError } from "@/types/api";
import type { PoImportCsvResult, PoImportHistoryItem } from "@/types/po";
import type { ShipmentImportCsvResult, ShipmentImportHistoryItem } from "@/types/shipments";
import {
  downloadPoImportTemplate,
  importPoCsv,
  listPoImportHistory,
} from "@/services/po-service";
import {
  downloadShipmentCombinedTemplate,
  importShipmentCombinedCsv,
  listShipmentImportHistory,
} from "@/services/shipments-service";
import styles from "./MonitoringDataPage.module.css";

function statusLabel(v: string): string {
  switch (v) {
    case "SUCCESS":
      return "Success";
    case "PARTIAL":
      return "Partial";
    case "FAILED":
      return "Failed";
    default:
      return v;
  }
}

export function MonitoringDataPage() {
  const { accessToken } = useAuth();
  const { pushToast } = useToast();
  const [result, setResult] = useState<PoImportCsvResult | null>(null);
  const [poHistory, setPoHistory] = useState<PoImportHistoryItem[]>([]);
  const [shipmentResult, setShipmentResult] = useState<ShipmentImportCsvResult | null>(null);
  const [shipmentHistory, setShipmentHistory] = useState<ShipmentImportHistoryItem[]>([]);
  const [loadingPoHistory, setLoadingPoHistory] = useState(true);
  const [loadingShipmentHistory, setLoadingShipmentHistory] = useState(true);
  const [poBusy, setPoBusy] = useState(false);
  const [shipmentBusy, setShipmentBusy] = useState(false);
  const [poError, setPoError] = useState<string | null>(null);
  const [shipmentError, setShipmentError] = useState<string | null>(null);
  const [poHistoryError, setPoHistoryError] = useState<string | null>(null);
  const [shipmentHistoryError, setShipmentHistoryError] = useState<string | null>(null);

  const fetchPoHistory = useCallback(() => {
    if (!accessToken) {
      setLoadingPoHistory(false);
      return;
    }
    setLoadingPoHistory(true);
    listPoImportHistory(accessToken)
      .then((res) => {
        if (isApiError(res)) {
          setPoHistoryError(res.message);
          return;
        }
        setPoHistory(res.data ?? []);
        setPoHistoryError(null);
      })
      .catch(() => setPoHistoryError("Failed to load PO upload history"))
      .finally(() => setLoadingPoHistory(false));
  }, [accessToken]);

  const fetchShipmentHistory = useCallback(() => {
    if (!accessToken) {
      setLoadingShipmentHistory(false);
      return;
    }
    setLoadingShipmentHistory(true);
    listShipmentImportHistory(accessToken)
      .then((res) => {
        if (isApiError(res)) {
          setShipmentHistoryError(res.message);
          return;
        }
        setShipmentHistory(res.data ?? []);
        setShipmentHistoryError(null);
      })
      .catch(() => setShipmentHistoryError("Failed to load shipment upload history"))
      .finally(() => setLoadingShipmentHistory(false));
  }, [accessToken]);

  useEffect(() => {
    fetchPoHistory();
    fetchShipmentHistory();
  }, [fetchPoHistory, fetchShipmentHistory]);

  async function onPoTemplateDownload() {
    if (!accessToken) return;
    try {
      const blob = await downloadPoImportTemplate(accessToken);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "po-import-template.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      pushToast("Failed to download PO template", "error");
    }
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !accessToken) return;
    setPoBusy(true);
    setPoError(null);
    setResult(null);
    const res = await importPoCsv(file, accessToken);
    setPoBusy(false);
    if (isApiError(res)) {
      setPoError(res.message);
      pushToast(res.message, "error");
      return;
    }
    setResult(res.data);
    const hasError = (res.data.errors?.length ?? 0) > 0;
    pushToast(
      hasError ? "Import completed with row warnings." : "Import completed successfully.",
      hasError ? "info" : "success"
    );
    fetchPoHistory();
  }

  async function onShipmentTemplateDownload() {
    if (!accessToken) return;
    try {
      const blob = await downloadShipmentCombinedTemplate(accessToken);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "shipment-import-template.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      pushToast("Failed to download shipment template", "error");
    }
  }

  async function onShipmentImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !accessToken) return;
    setShipmentBusy(true);
    setShipmentError(null);
    setShipmentResult(null);
    const res = await importShipmentCombinedCsv(file, accessToken);
    setShipmentBusy(false);
    if (isApiError(res)) {
      setShipmentError(res.message);
      pushToast(res.message, "error");
      return;
    }
    setShipmentResult(res.data);
    const hasError = (res.data.errors?.length ?? 0) > 0;
    pushToast(
      hasError ? "Shipment import completed with warnings." : "Shipment import completed successfully.",
      hasError ? "info" : "success"
    );
    fetchShipmentHistory();
  }

  const anyBusy = poBusy || shipmentBusy;

  return (
    <section className={styles.page}>
      <PageHeader
        title="Import Data"
        subtitle="Import purchase orders first, then import shipments linked to those POs."
        backHref="/dashboard"
        backLabel="Dashboard"
      />

      <Card className={styles.importCard}>
        <header className={styles.importCardHeader}>
          <h2 className={styles.importCardTitle}>1. Purchase Order Import</h2>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={onPoTemplateDownload}
            disabled={anyBusy}
          >
            Download PO Template
          </button>
        </header>
        <p className={styles.importCardHint}>
          Upload a CSV that matches the PO template. Row-level issues appear below in this section.
        </p>

        <div className={styles.importControls}>
          <label className={styles.fileLabel}>
            <span className={styles.fileLabelText}>CSV file</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={onImportFile}
              disabled={poBusy}
              aria-label="Choose CSV file for purchase order import"
            />
          </label>
        </div>

        {poError && (
          <div className={styles.errorPanel} role="alert">
            <strong className={styles.errorTitle}>Import failed</strong>
            <p className={styles.errorText}>{poError}</p>
          </div>
        )}

        {result && (
          <div className={styles.resultBlock}>
            {result.summary ? <p className={styles.summary}>{result.summary}</p> : null}
            <p className={styles.summary}>
              Total rows: {result.total_rows} | Imported POs: {result.imported_pos} | Imported rows:{" "}
              {result.imported_rows} | Failed rows: {result.failed_rows}
            </p>
          </div>
        )}

        <div className={styles.validationRegion}>
          <h3 className={styles.subheading}>Row-level validation (PO)</h3>
          {!result || result.errors.length === 0 ? (
            <EmptyState
              title="No PO validation errors"
              description="After you upload a CSV, any row-level validation messages appear here."
            />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Row</TableHeaderCell>
                  <TableHeaderCell>PO Number</TableHeaderCell>
                  <TableHeaderCell>Field</TableHeaderCell>
                  <TableHeaderCell>Error message</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.errors.map((row) => (
                  <TableRow key={`${row.row}-${row.field}-${row.po_number}-${row.message}`}>
                    <TableCell className={styles.smallCell}>{row.row}</TableCell>
                    <TableCell className={styles.smallCell}>{row.po_number || "—"}</TableCell>
                    <TableCell className={styles.smallCell}>{row.field}</TableCell>
                    <TableCell>{row.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className={styles.historyRegion}>
          <h3 className={styles.subheading}>PO upload history</h3>
          <p className={styles.historyHint}>Recent purchase order CSV imports.</p>
          {poHistoryError && (
            <div className={styles.errorPanel} role="alert">
              <p className={styles.errorText}>{poHistoryError}</p>
            </div>
          )}
          {loadingPoHistory ? (
            <LoadingSkeleton lines={3} />
          ) : poHistory.length === 0 ? (
            <EmptyState title="No PO uploads yet" description="History appears here after each PO CSV import." />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Uploaded at</TableHeaderCell>
                  <TableHeaderCell>File name</TableHeaderCell>
                  <TableHeaderCell>Uploaded by</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Total rows</TableHeaderCell>
                  <TableHeaderCell>Imported rows</TableHeaderCell>
                  <TableHeaderCell>Failed rows</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {poHistory.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>{new Date(h.created_at).toLocaleString()}</TableCell>
                    <TableCell>{h.file_name ?? "—"}</TableCell>
                    <TableCell>{h.uploaded_by}</TableCell>
                    <TableCell>{statusLabel(h.status)}</TableCell>
                    <TableCell>{h.total_rows}</TableCell>
                    <TableCell>{h.imported_rows}</TableCell>
                    <TableCell>{h.failed_rows}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>

      <Card className={styles.importCard}>
        <header className={styles.importCardHeader}>
          <h2 className={styles.importCardTitle}>2. Shipment Import</h2>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={onShipmentTemplateDownload}
            disabled={anyBusy}
          >
            Download Shipment Template
          </button>
        </header>
        <p className={styles.importCardHint}>
          Requires POs that already exist in the system. Shipment-level and row issues stay in this section.
        </p>

        <div className={styles.importControls}>
          <label className={styles.fileLabel}>
            <span className={styles.fileLabelText}>CSV file</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={onShipmentImportFile}
              disabled={shipmentBusy}
              aria-label="Choose CSV file for shipment import"
            />
          </label>
        </div>

        {shipmentError && (
          <div className={styles.errorPanel} role="alert">
            <strong className={styles.errorTitle}>Import failed</strong>
            <p className={styles.errorText}>{shipmentError}</p>
          </div>
        )}

        {shipmentResult && (
          <div className={styles.resultBlock}>
            {shipmentResult.summary ? <p className={styles.summary}>{shipmentResult.summary}</p> : null}
            <p className={styles.summary}>
              Total rows: {shipmentResult.total_rows} | Imported shipments: {shipmentResult.imported_shipments} |
              Imported rows: {shipmentResult.imported_rows} | Failed rows: {shipmentResult.failed_rows}
            </p>
          </div>
        )}

        <div className={styles.validationRegion}>
          <h3 className={styles.subheading}>Row-level validation (Shipment)</h3>
          {!shipmentResult || shipmentResult.errors.length === 0 ? (
            <EmptyState
              title="No shipment validation errors"
              description="After you upload a shipment CSV, any row-level messages appear here."
            />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Row</TableHeaderCell>
                  <TableHeaderCell>Shipment</TableHeaderCell>
                  <TableHeaderCell>PO Number</TableHeaderCell>
                  <TableHeaderCell>Field</TableHeaderCell>
                  <TableHeaderCell>Error message</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shipmentResult.errors.map((row) => (
                  <TableRow key={`${row.row}-${row.field}-${row.shipment_no}-${row.po_number}-${row.message}`}>
                    <TableCell className={styles.smallCell}>{row.row}</TableCell>
                    <TableCell className={styles.smallCell}>{row.shipment_no || "—"}</TableCell>
                    <TableCell className={styles.smallCell}>{row.po_number || "—"}</TableCell>
                    <TableCell className={styles.smallCell}>{row.field}</TableCell>
                    <TableCell>{row.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className={styles.historyRegion}>
          <h3 className={styles.subheading}>Shipment upload history</h3>
          <p className={styles.historyHint}>Recent shipment CSV imports (combined template).</p>
          {shipmentHistoryError && (
            <div className={styles.errorPanel} role="alert">
              <p className={styles.errorText}>{shipmentHistoryError}</p>
            </div>
          )}
          {loadingShipmentHistory ? (
            <LoadingSkeleton lines={3} />
          ) : shipmentHistory.length === 0 ? (
            <EmptyState title="No shipment uploads yet" description="History appears here after each shipment CSV import." />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Uploaded at</TableHeaderCell>
                  <TableHeaderCell>File name</TableHeaderCell>
                  <TableHeaderCell>Uploaded by</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Total rows</TableHeaderCell>
                  <TableHeaderCell>Imported shipments</TableHeaderCell>
                  <TableHeaderCell>Imported rows</TableHeaderCell>
                  <TableHeaderCell>Failed rows</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shipmentHistory.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>{new Date(h.created_at).toLocaleString()}</TableCell>
                    <TableCell>{h.file_name ?? "—"}</TableCell>
                    <TableCell>{h.uploaded_by}</TableCell>
                    <TableCell>{statusLabel(h.status)}</TableCell>
                    <TableCell>{h.total_rows}</TableCell>
                    <TableCell>{h.imported_shipments}</TableCell>
                    <TableCell>{h.imported_rows}</TableCell>
                    <TableCell>{h.failed_rows}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>
    </section>
  );
}
