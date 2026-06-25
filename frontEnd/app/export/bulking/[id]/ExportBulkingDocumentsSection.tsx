"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { Card } from "@/components/cards";
import { Button } from "@/components/forms";
import { config } from "@/lib/config";
import {
  EXPORT_BULKING_DOC_FILE_ACCEPT,
  EXPORT_BULKING_UPLOAD_DOCUMENT_LABELS,
  EXPORT_BULKING_UPLOAD_DOCUMENT_TYPES,
  isAcceptedExportBulkingDocFile,
  type ExportBulkingUploadDocumentType,
} from "@/lib/export-bulking-document-types";
import {
  deleteExportBulkingDocument,
  listExportBulkingDocuments,
  uploadExportBulkingDocument,
} from "@/services/export-bulking-service";
import { isApiError } from "@/types/api";
import type { ExportBulkingDocumentListItem } from "@/types/export-bulking";
import { formatDateTime } from "@/lib/format-date";
import { formatDocumentBytes } from "@/lib/format-files";
import importDocStyles from "@/app/import/shipments/[id]/ShipmentDetail.module.css";

function formatUploadedAt(value: string): string {
  return formatDateTime(value);
}

function DocUploadControl({
  disabled,
  isUploading,
  onFile,
}: {
  disabled: boolean;
  isUploading: boolean;
  onFile: (file: File) => void;
}) {
  const inputId = useId();
  return (
    <span className={importDocStyles.shipmentDocUploadWrap}>
      <input
        id={inputId}
        type="file"
        className={importDocStyles.shipmentDocFileInputHidden}
        accept={EXPORT_BULKING_DOC_FILE_ACCEPT}
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
        className={[
          importDocStyles.shipmentDocUploadBtn,
          disabled ? importDocStyles.shipmentDocUploadBtnDisabled : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-disabled={disabled}
      >
        {isUploading ? "Uploading…" : "Upload"}
      </label>
    </span>
  );
}

function DocDropZone({
  canUpload,
  onFile,
  children,
}: {
  canUpload: boolean;
  onFile: (file: File) => void;
  children: ReactNode;
}) {
  const [dragDepth, setDragDepth] = useState(0);

  const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canUpload || !Array.from(e.dataTransfer.types).includes("Files")) return;
    setDragDepth((d) => d + 1);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const next = e.currentTarget;
    const rel = e.relatedTarget as Node | null;
    if (rel && next.contains(rel)) return;
    setDragDepth((d) => Math.max(0, d - 1));
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = canUpload ? "copy" : "none";
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragDepth(0);
    if (!canUpload) return;
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  return (
    <div
      className={[
        importDocStyles.shipmentDocSub,
        canUpload ? importDocStyles.shipmentDocSubUnlocked : importDocStyles.shipmentDocSubLocked,
        importDocStyles.shipmentDocDropZone,
        dragDepth > 0 && canUpload ? importDocStyles.shipmentDocDropZoneDragging : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {canUpload && (
        <p className={importDocStyles.shipmentDocDropHint}>Drop a file here or use Upload.</p>
      )}
      {children}
    </div>
  );
}

export function ExportBulkingDocumentsSection({
  shipmentId,
  accessToken,
  canUpload,
}: {
  shipmentId: string;
  accessToken: string;
  canUpload: boolean;
}) {
  const [documents, setDocuments] = useState<ExportBulkingDocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<ExportBulkingUploadDocumentType | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    const res = await listExportBulkingDocuments(shipmentId, accessToken);
    if (isApiError(res)) {
      setError(res.message);
      setDocuments([]);
    } else {
      setError(null);
      setDocuments(Array.isArray(res.data) ? res.data : []);
    }
    setLoading(false);
  }, [accessToken, shipmentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const docsByType = useMemo(() => {
    const map = new Map<ExportBulkingUploadDocumentType, ExportBulkingDocumentListItem[]>();
    for (const t of EXPORT_BULKING_UPLOAD_DOCUMENT_TYPES) map.set(t, []);
    for (const doc of documents) {
      const t = doc.document_type as ExportBulkingUploadDocumentType;
      if (map.has(t)) map.get(t)!.push(doc);
    }
    for (const t of EXPORT_BULKING_UPLOAD_DOCUMENT_TYPES) {
      map.get(t)!.sort(
        (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime(),
      );
    }
    return map;
  }, [documents]);

  async function handleUpload(documentType: ExportBulkingUploadDocumentType, file: File) {
    if (!canUpload || !accessToken) return;
    if (!isAcceptedExportBulkingDocFile(file)) {
      setError("Use PDF, Word, Excel, or an image file.");
      return;
    }
    setError(null);
    setUploadingType(documentType);
    const res = await uploadExportBulkingDocument(shipmentId, file, documentType, accessToken);
    if (isApiError(res)) {
      setError(res.message);
    } else {
      await refresh();
    }
    setUploadingType(null);
  }

  async function handleDownload(doc: ExportBulkingDocumentListItem) {
    const base = config.apiBaseUrl.replace(/\/$/, "");
    const url = `${base}/export/bulking/shipments/${shipmentId}/documents/${doc.id}/download`;
    try {
      let r = await fetch(url, { credentials: "include" });
      if (r.status === 401) {
        const refreshUrl = `${base}/auth/refresh`;
        const refreshRes = await fetch(refreshUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          credentials: "include",
        });
        if (!refreshRes.ok) throw new Error("download failed");
        r = await fetch(url, { credentials: "include" });
      }
      if (!r.ok) throw new Error("download failed");
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = doc.original_file_name || "document";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      setError("Failed to download document.");
    }
  }

  async function handleDelete(doc: ExportBulkingDocumentListItem) {
    if (!canUpload || !accessToken) return;
    setDeletingId(doc.id);
    const res = await deleteExportBulkingDocument(shipmentId, doc.id, accessToken);
    if (isApiError(res)) setError(res.message);
    else await refresh();
    setDeletingId(null);
  }

  function renderFileList(files: ExportBulkingDocumentListItem[]) {
    if (files.length === 0) {
      return <li className={importDocStyles.shipmentDocFileEmpty}>No file yet.</li>;
    }
    return files.map((doc) => (
      <li key={doc.id} className={importDocStyles.shipmentDocFileRow}>
        <div className={importDocStyles.shipmentDocFileInfo}>
          <span className={importDocStyles.shipmentDocFileName}>{doc.original_file_name}</span>
          <span className={importDocStyles.shipmentDocFileMeta}>
            {formatDocumentBytes(doc.size_bytes)} · {formatUploadedAt(doc.uploaded_at)} ·{" "}
            {doc.uploaded_by?.trim() || "—"}
          </span>
        </div>
        <div className={importDocStyles.shipmentDocFileActions}>
          <Button
            type="button"
            variant="secondary"
            className={importDocStyles.docIconBtn}
            onClick={() => void handleDownload(doc)}
            aria-label={`Download ${doc.original_file_name}`}
            title="Download"
          >
            <span aria-hidden>↓</span>
          </Button>
          {canUpload && (
            <Button
              type="button"
              variant="secondary"
              className={importDocStyles.docIconBtn}
              onClick={() => void handleDelete(doc)}
              disabled={deletingId === doc.id}
              aria-label={
                deletingId === doc.id ? "Removing document" : `Remove ${doc.original_file_name}`
              }
              title={deletingId === doc.id ? "Removing…" : "Remove"}
            >
              <span aria-hidden>{deletingId === doc.id ? "…" : "🗑"}</span>
            </Button>
          )}
        </div>
      </li>
    ));
  }

  return (
    <Card
      className={importDocStyles.card}
      id="section-export-bulking-documents"
      data-tour="export-bulking-documents"
    >
      <h2 className={importDocStyles.sectionTitle}>Documents</h2>
      {canUpload ? (
        <p className={importDocStyles.shipmentDocSectionIntro} role="note">
          Drag and drop a file onto a category panel, or use the Upload button for that document
          type. Files are stored under the Export folder on shared storage.
        </p>
      ) : (
        <p className={importDocStyles.shipmentDocSectionIntro} role="note">
          View uploaded export documents below.
        </p>
      )}
      {error && (
        <p className={importDocStyles.shipmentDocLockedHint} role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className={importDocStyles.shipmentDocFileEmpty}>Loading documents…</p>
      ) : (
        <div className={importDocStyles.shipmentDocCategories}>
          {EXPORT_BULKING_UPLOAD_DOCUMENT_TYPES.map((docType) => {
            const files = docsByType.get(docType) ?? [];
            const busy = uploadingType === docType;
            return (
              <div key={docType} className={importDocStyles.shipmentDocCategory}>
                <h3 className={importDocStyles.shipmentDocCategoryTitleRow}>
                  <span className={importDocStyles.shipmentDocCategoryTitleText}>
                    {EXPORT_BULKING_UPLOAD_DOCUMENT_LABELS[docType]}
                  </span>
                </h3>
                <DocDropZone
                  canUpload={canUpload && !busy}
                  onFile={(f) => void handleUpload(docType, f)}
                >
                  <div className={importDocStyles.shipmentDocSubHeader}>
                    <span className={importDocStyles.shipmentDocStatusLabel}>Files</span>
                    {canUpload && (
                      <DocUploadControl
                        disabled={busy}
                        isUploading={busy}
                        onFile={(f) => void handleUpload(docType, f)}
                      />
                    )}
                  </div>
                  <ul className={importDocStyles.shipmentDocFileList}>{renderFileList(files)}</ul>
                </DocDropZone>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
