"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteShipperDocumentHeader,
  fetchShipperDocumentHeaderBlob,
  uploadShipperDocumentHeader,
  updateShipper,
  type Shipper,
} from "@/services/shipper-service";
import { isApiError } from "@/types/api";
import styles from "./ShipperDocumentHeaderPanel.module.css";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

export function ShipperDocumentHeaderPanel({
  shipper,
  accessToken,
  canEdit,
  canEditNpwp,
  onUpdated,
  pushToast,
}: {
  shipper: Shipper;
  accessToken: string;
  /** Upload/remove document header image. */
  canEdit: boolean;
  /** Edit NPWP on shipper master. */
  canEditNpwp: boolean;
  onUpdated: () => void;
  pushToast: (message: string, type: "success" | "error") => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [npwpValue, setNpwpValue] = useState(shipper.npwp ?? "");
  const [savingNpwp, setSavingNpwp] = useState(false);

  useEffect(() => {
    setNpwpValue(shipper.npwp ?? "");
  }, [shipper.id, shipper.npwp]);

  const loadPreview = useCallback(async () => {
    if (!shipper.has_document_header) {
      setPreviewUrl(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const blob = await fetchShipperDocumentHeaderBlob(shipper.id, accessToken);
      const url = URL.createObjectURL(blob);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    } finally {
      setPreviewLoading(false);
    }
  }, [shipper.has_document_header, shipper.id, accessToken]);

  useEffect(() => {
    void loadPreview();
    return () => {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [loadPreview]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !canEdit) return;

    if (!file.type.startsWith("image/")) {
      pushToast("Please upload a PNG, JPEG, WebP, or GIF image", "error");
      return;
    }

    setUploading(true);
    const res = await uploadShipperDocumentHeader(shipper.id, file, accessToken);
    setUploading(false);
    if (isApiError(res)) {
      pushToast(res.message, "error");
      return;
    }
    pushToast("Document header uploaded", "success");
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    onUpdated();
  }

  async function handleRemove() {
    if (!canEdit || !shipper.has_document_header) return;
    setRemoving(true);
    const res = await deleteShipperDocumentHeader(shipper.id, accessToken);
    setRemoving(false);
    if (isApiError(res)) {
      pushToast(res.message, "error");
      return;
    }
    pushToast("Document header removed", "success");
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    onUpdated();
  }

  async function handleSaveNpwp() {
    if (!canEditNpwp) return;
    setSavingNpwp(true);
    const res = await updateShipper(
      shipper.id,
      {
        entity_name: shipper.entity_name,
        short_name: shipper.short_name,
        npwp: npwpValue.trim() || null,
      },
      accessToken,
    );
    setSavingNpwp(false);
    if (isApiError(res)) {
      pushToast(res.message, "error");
      return;
    }
    pushToast("NPWP saved", "success");
    onUpdated();
  }

  return (
    <div className={styles.panel}>
      <h4 className={styles.title}>Document header (Export) — {shipper.short_name}</h4>
      <p className={styles.hint}>
        Upload a letterhead image used on Shipping Instruction, Invoice, and Packing List exports.
        Recommended width ~170 mm (A4 content area). PNG or JPEG.
      </p>

      {previewLoading ? (
        <p className={styles.meta}>Loading preview…</p>
      ) : previewUrl ? (
        <div className={styles.previewWrap}>
          <img src={previewUrl} alt="" className={styles.previewImage} />
        </div>
      ) : (
        <p className={styles.meta}>No document header uploaded. Text letterhead fallback is used.</p>
      )}

      {shipper.document_header_file_name ? (
        <p className={styles.fileName}>{shipper.document_header_file_name}</p>
      ) : null}

      {canEdit && (
        <div className={styles.actions}>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className={styles.fileInput}
            onChange={(e) => void handleFileChange(e)}
            aria-label="Upload document header image"
          />
          <button
            type="button"
            className={styles.actionBtn}
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? "Uploading…" : shipper.has_document_header ? "Replace image" : "Upload image"}
          </button>
          {shipper.has_document_header && (
            <button
              type="button"
              className={styles.actionBtnDanger}
              disabled={removing}
              onClick={() => void handleRemove()}
            >
              {removing ? "Removing…" : "Remove"}
            </button>
          )}
        </div>
      )}

      <div className={styles.npwpSection}>
        <label className={styles.npwpLabel} htmlFor={`shipper-npwp-${shipper.id}`}>
          NPWP (Shipping Instruction)
        </label>
        <p className={styles.hint}>
          Used as NPWP on export Shipping Instruction documents for this shipper.
        </p>
        <div className={styles.npwpRow}>
          <input
            id={`shipper-npwp-${shipper.id}`}
            type="text"
            className={styles.npwpInput}
            value={npwpValue}
            onChange={(e) => setNpwpValue(e.target.value)}
            placeholder="e.g. 01.234.567.8-901.000"
            readOnly={!canEditNpwp}
          />
          {canEditNpwp && (
            <button
              type="button"
              className={styles.actionBtn}
              disabled={savingNpwp || npwpValue.trim() === (shipper.npwp ?? "").trim()}
              onClick={() => void handleSaveNpwp()}
            >
              {savingNpwp ? "Saving…" : "Save NPWP"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
