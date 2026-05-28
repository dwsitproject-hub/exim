/**
 * Multipart upload: fields document_type, status (optional); file field "file".
 */

import type { Request } from "express";
import type { ErrorField } from "../../../shared/response.js";
import {
  isAllowedShipmentDocumentType,
  shipmentDocumentRequiresIntakeId,
  SHIPMENT_DOCUMENT_STATUSES,
  SHIPMENT_DOCUMENT_TYPES,
} from "../constants/shipment-document-types.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ValidatedShipmentDocumentUpload = {
  document_type: string;
  status: string | null;
  intake_id: string | null;
};

export function validateShipmentDocumentUpload(
  req: Request
): { ok: true; data: ValidatedShipmentDocumentUpload } | { ok: false; errors: ErrorField[] } {
  const errors: ErrorField[] = [];
  const body = req.body as Record<string, unknown>;
  const rawType = body?.document_type;
  const typeStr = typeof rawType === "string" ? rawType.trim().toUpperCase() : "";

  if (!typeStr) {
    errors.push({ field: "document_type", message: "document_type is required" });
  } else if (!isAllowedShipmentDocumentType(typeStr)) {
    errors.push({
      field: "document_type",
      message: `Invalid document_type. Allowed: ${SHIPMENT_DOCUMENT_TYPES.join(", ")}`,
    });
  }

  const rawStatus = body?.status;
  let status: string | null = null;
  if (rawStatus != null && String(rawStatus).trim() !== "") {
    const s = String(rawStatus).trim().toUpperCase();
    if (!(SHIPMENT_DOCUMENT_STATUSES as readonly string[]).includes(s)) {
      errors.push({ field: "status", message: "status must be DRAFT or FINAL" });
    } else {
      status = s;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  if (status) {
    errors.push({ field: "status", message: "status must not be set for this document type" });
    return { ok: false, errors };
  }

  let intakeId: string | null = null;
  const rawIntake = body?.intake_id;
  if (rawIntake != null && String(rawIntake).trim() !== "") {
    const id = String(rawIntake).trim();
    if (!UUID_RE.test(id)) {
      errors.push({ field: "intake_id", message: "intake_id must be a valid UUID" });
    } else {
      intakeId = id;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  if (shipmentDocumentRequiresIntakeId(typeStr)) {
    if (!intakeId) {
      errors.push({
        field: "intake_id",
        message: "intake_id is required for PO (use the linked PO intake UUID)",
      });
      return { ok: false, errors };
    }
  } else if (intakeId) {
    errors.push({
      field: "intake_id",
      message: "intake_id is only allowed for document type PO",
    });
    return { ok: false, errors };
  }

  return { ok: true, data: { document_type: typeStr, status, intake_id: intakeId } };
}
