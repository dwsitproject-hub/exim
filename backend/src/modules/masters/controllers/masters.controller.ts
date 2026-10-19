/**
 * Master-data HTTP handlers (DHM-backed company + exchange_rate).
 */

import type { Request, Response, NextFunction } from "express";
import { sendSuccess, sendError } from "../../../shared/response.js";
import { MastersService } from "../services/masters.service.js";
import { validateCreateCompanyBody, validateExchangeRateQuery } from "../validators/masters.validator.js";

const mastersService = new MastersService();

export async function listCompanies(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = typeof req.query.query === "string" ? req.query.query : "";
    const limitRaw = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : undefined;
    const limit = Number.isFinite(limitRaw) && limitRaw ? Math.min(50, Math.max(1, limitRaw)) : 20;
    const companies = await mastersService.searchCompanies(query, limit);
    sendSuccess(res, companies, { message: "OK" });
  } catch (e) {
    next(e);
  }
}

export async function getPtPlantTree(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tree = await mastersService.getPtPlantTree();
    sendSuccess(res, tree, { message: "OK" });
  } catch (e) {
    next(e);
  }
}

export async function getCatalog(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const catalog = await mastersService.getCatalog();
    sendSuccess(res, catalog, { message: "OK" });
  } catch (e) {
    next(e);
  }
}

export async function createCompany(req: Request, res: Response, next: NextFunction): Promise<void> {
  const validation = validateCreateCompanyBody(req);
  if (!validation.ok) {
    sendError(res, "Validation failed", { errors: validation.errors, statusCode: 400 });
    return;
  }
  try {
    const idempotencyKey =
      typeof req.header("Idempotency-Key") === "string" && req.header("Idempotency-Key")
        ? (req.header("Idempotency-Key") as string)
        : undefined;
    const result = await mastersService.createCompany(validation.data, {
      userId: req.user?.id,
      idempotencyKey,
    });
    const statusCode = result.status === "created" ? 201 : result.pendingReview ? 202 : 200;
    sendSuccess(res, result, {
      message: result.pendingReview
        ? "Submitted to DHM; a data steward will review this company."
        : "Company created in DHM.",
      statusCode,
    });
  } catch (e) {
    next(e);
  }
}

export async function getLatestExchangeRate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const validation = validateExchangeRateQuery(req);
  if (!validation.ok) {
    sendError(res, "Validation failed", { errors: validation.errors, statusCode: 400 });
    return;
  }
  try {
    const { from, to, date } = validation.data;
    const rate = await mastersService.getLatestExchangeRate(from, to, date);
    if (!rate) {
      sendError(res, `No DHM exchange rate found for ${from}/${to} on or before ${date}`, { statusCode: 404 });
      return;
    }
    sendSuccess(res, rate, { message: "OK" });
  } catch (e) {
    next(e);
  }
}

export async function triggerSync(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const entityType = req.body?.entityType as "company" | "site" | "plant" | "exchange_rate" | undefined;
    await mastersService.triggerSync(entityType);
    sendSuccess(res, { triggered: true, entityType: entityType ?? "all" }, { message: "DHM sync triggered" });
  } catch (e) {
    next(e);
  }
}

export async function getSyncHealth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const health = await mastersService.getSyncHealth();
    sendSuccess(res, health, { message: "OK" });
  } catch (e) {
    next(e);
  }
}
