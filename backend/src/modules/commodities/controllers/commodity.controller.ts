import type { Request, Response, NextFunction } from "express";
import { sendSuccess, sendError } from "../../../shared/response.js";
import { CommodityService } from "../services/commodity.service.js";
import { CommodityRepository } from "../repositories/commodity.repository.js";
import type { ListCommoditiesQuery } from "../dto/index.js";

const repo = new CommodityRepository();
const service = new CommodityService(repo);

export async function listCommodities(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query: ListCommoditiesQuery = {
      search: typeof req.query.search === "string" ? req.query.search : undefined,
    };
    const rows = await service.listCommodities(query);
    sendSuccess(res, rows);
  } catch (err) {
    next(err);
  }
}

export async function getCommodityById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const row = await service.getCommodityById(req.params.id);
    if (!row) {
      sendError(res, "Commodity not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

export async function createCommodity(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const row = await service.createCommodity(req.body);
    sendSuccess(res, row, { statusCode: 201 });
  } catch (err) {
    next(err);
  }
}

export async function updateCommodity(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const row = await service.updateCommodity(req.params.id, req.body);
    if (!row) {
      sendError(res, "Commodity not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

export async function removeCommodity(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const row = await service.softDeleteCommodity(req.params.id);
    if (!row) {
      sendError(res, "Commodity not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, { message: "Deleted" });
  } catch (err) {
    next(err);
  }
}
