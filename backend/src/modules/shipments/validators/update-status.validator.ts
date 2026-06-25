/**
 * Update shipment status validation (forward-only transition).
 */

import type { Request } from "express";
import type { ErrorField } from "../../../shared/response.js";
import { SHIPMENT_STATUSES } from "../dto/index.js";

const VALID_SET = new Set<string>(SHIPMENT_STATUSES);

export function validateUpdateStatusBody(
  req: Request
): { ok: true; data: { new_status: string; remarks?: string; closed_at?: string } } | { ok: false; errors: ErrorField[] } {
  const body = req.body as Record<string, unknown>;
  const errors: ErrorField[] = [];

  const new_status = typeof body?.new_status === "string" ? body.new_status.trim() : "";
  if (!new_status) {
    errors.push({ field: "new_status", message: "New status is required" });
  } else if (!VALID_SET.has(new_status)) {
    errors.push({ field: "new_status", message: "New status must be a valid shipment status value" });
  }

  let closed_at: string | undefined;
  if (new_status === "DELIVERED") {
    const raw = typeof body?.closed_at === "string" ? body.closed_at.trim() : "";
    if (!raw) {
      errors.push({ field: "closed_at", message: "Delivered date is required when status is Delivered" });
    } else if (Number.isNaN(Date.parse(raw))) {
      errors.push({ field: "closed_at", message: "Delivered date must be a valid date" });
    } else {
      closed_at = raw;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const data: { new_status: string; remarks?: string; closed_at?: string } = { new_status };
  if (typeof body?.remarks === "string") data.remarks = body.remarks.trim();
  if (closed_at) data.closed_at = closed_at;
  return { ok: true, data };
}
