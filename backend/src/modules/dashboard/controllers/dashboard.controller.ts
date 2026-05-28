import type { NextFunction, Request, Response } from "express";
import { mergeFilterTokens } from "../../../shared/http-query-multi.js";
import { sendError, sendSuccess } from "../../../shared/response.js";
import { DashboardRepository } from "../repositories/dashboard.repository.js";
import { DashboardService } from "../services/dashboard.service.js";

const service = new DashboardService(new DashboardRepository());

function parseIntegerQuery(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseOptionalStringQuery(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  if (t === "") return undefined;
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

export async function getDeliveredManagementSummary(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const month = parseIntegerQuery(req.query.month);
  const year = parseIntegerQuery(req.query.year);

  if (month != null && (month < 1 || month > 12)) {
    sendError(res, "Validation error", {
      statusCode: 400,
      errors: [{ field: "month", message: "month must be between 1 and 12" }],
    });
    return;
  }
  if (year != null && (year < 2000 || year > 9999)) {
    sendError(res, "Validation error", {
      statusCode: 400,
      errors: [{ field: "year", message: "year must be a 4-digit number" }],
    });
    return;
  }

  try {
    const items = await service.getDeliveredManagementSummary({ month, year });
    sendSuccess(res, items);
  } catch (error) {
    next(error);
  }
}

export async function getDeliveredByPtPlantAgg(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const month = parseIntegerQuery(req.query.month);
  const year = parseIntegerQuery(req.query.year);
  const pt = parseOptionalStringQuery(req.query.pt, 255);
  const plant = parseOptionalStringQuery(req.query.plant, 255);

  if (month != null && (month < 1 || month > 12)) {
    sendError(res, "Validation error", {
      statusCode: 400,
      errors: [{ field: "month", message: "month must be between 1 and 12" }],
    });
    return;
  }
  if (year != null && (year < 2000 || year > 9999)) {
    sendError(res, "Validation error", {
      statusCode: 400,
      errors: [{ field: "year", message: "year must be a 4-digit number" }],
    });
    return;
  }

  try {
    const items = await service.getDeliveredByPtPlantAgg({ month, year, pt, plant });
    sendSuccess(res, items);
  } catch (error) {
    next(error);
  }
}

export async function getDeliveredByClassificationAgg(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const month = parseIntegerQuery(req.query.month);
  const year = parseIntegerQuery(req.query.year);

  if (month != null && (month < 1 || month > 12)) {
    sendError(res, "Validation error", {
      statusCode: 400,
      errors: [{ field: "month", message: "month must be between 1 and 12" }],
    });
    return;
  }
  if (year != null && (year < 2000 || year > 9999)) {
    sendError(res, "Validation error", {
      statusCode: 400,
      errors: [{ field: "year", message: "year must be a 4-digit number" }],
    });
    return;
  }

  try {
    const items = await service.getDeliveredByClassificationAgg({ month, year });
    sendSuccess(res, items);
  } catch (error) {
    next(error);
  }
}

/** Procurement-style plant report: YTD + selected month + previous month (US$ + qty). */
export async function getProcurementPlantReport(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const month = parseIntegerQuery(req.query.month);
  const year = parseIntegerQuery(req.query.year);

  if (month == null || year == null) {
    sendError(res, "Validation error", {
      statusCode: 400,
      errors: [
        { field: "month", message: "month is required (1–12)" },
        { field: "year", message: "year is required" },
      ],
    });
    return;
  }
  if (month < 1 || month > 12) {
    sendError(res, "Validation error", {
      statusCode: 400,
      errors: [{ field: "month", message: "month must be between 1 and 12" }],
    });
    return;
  }
  if (year < 2000 || year > 9999) {
    sendError(res, "Validation error", {
      statusCode: 400,
      errors: [{ field: "year", message: "year must be a 4-digit number" }],
    });
    return;
  }

  try {
    const payload = await service.getProcurementPlantReport(year, month);
    sendSuccess(res, payload);
  } catch (error) {
    next(error);
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Shipment analytics for dashboard (created date + optional PT/plant/vendor/class/method). */
export async function getShipmentAnalytics(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const q = req.query as Record<string, unknown>;
  const date_from = typeof q.date_from === "string" ? q.date_from.trim() : "";
  const date_to = typeof q.date_to === "string" ? q.date_to.trim() : "";

  if (!DATE_RE.test(date_from) || !DATE_RE.test(date_to)) {
    sendError(res, "Validation error", {
      statusCode: 400,
      errors: [
        { field: "date_from", message: "date_from is required (YYYY-MM-DD)" },
        { field: "date_to", message: "date_to is required (YYYY-MM-DD)" },
      ],
    });
    return;
  }

  const pts = mergeFilterTokens(q, "pt", "pts_in");
  const plants = mergeFilterTokens(q, "plant", "plants_in");
  const vendor_names = mergeFilterTokens(q, "vendor_name", "vendor_names_in");
  const product_classifications = mergeFilterTokens(q, "product_classification", "product_classifications_in");
  const shipment_method = parseOptionalStringQuery(q.shipment_method, 40);

  try {
    const payload = await service.getShipmentAnalytics({
      date_from,
      date_to,
      pts,
      plants,
      vendor_names,
      product_classifications,
      shipment_method,
    });
    sendSuccess(res, payload);
  } catch (error) {
    next(error);
  }
}

/** Aggregated PO lines for shipment analytics drill (plant / classification). */
export async function getShipmentAnalyticsLines(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const q = req.query as Record<string, unknown>;
  const date_from = typeof q.date_from === "string" ? q.date_from.trim() : "";
  const date_to = typeof q.date_to === "string" ? q.date_to.trim() : "";

  if (!DATE_RE.test(date_from) || !DATE_RE.test(date_to)) {
    sendError(res, "Validation error", {
      statusCode: 400,
      errors: [
        { field: "date_from", message: "date_from is required (YYYY-MM-DD)" },
        { field: "date_to", message: "date_to is required (YYYY-MM-DD)" },
      ],
    });
    return;
  }

  const detailKindRaw = typeof q.detail_kind === "string" ? q.detail_kind.trim().toLowerCase() : "";
  if (detailKindRaw !== "plant" && detailKindRaw !== "classification") {
    sendError(res, "Validation error", {
      statusCode: 400,
      errors: [{ field: "detail_kind", message: "detail_kind must be plant or classification" }],
    });
    return;
  }

  const pts = mergeFilterTokens(q, "pt", "pts_in");
  const plants = mergeFilterTokens(q, "plant", "plants_in");
  const vendor_names = mergeFilterTokens(q, "vendor_name", "vendor_names_in");
  const product_classifications = mergeFilterTokens(q, "product_classification", "product_classifications_in");
  const shipment_method = parseOptionalStringQuery(q.shipment_method, 40);
  const detail_plant = parseOptionalStringQuery(q.detail_plant, 255);
  const detail_classification = parseOptionalStringQuery(q.detail_classification, 120);

  try {
    const payload = await service.getShipmentAnalyticsLines({
      date_from,
      date_to,
      pts,
      plants,
      vendor_names,
      product_classifications,
      shipment_method,
      detail_kind: detailKindRaw as "plant" | "classification",
      detail_plant,
      detail_classification,
    });
    sendSuccess(res, payload);
  } catch (error) {
    next(error);
  }
}
