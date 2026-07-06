import type { Request, Response, NextFunction } from "express";
import { sendSuccess, sendError } from "../../../shared/response.js";
import { SurveyorService } from "../services/surveyor.service.js";
import { SurveyorRepository } from "../repositories/surveyor.repository.js";
import type { ListSurveyorsQuery } from "../dto/index.js";

const repo = new SurveyorRepository();
const service = new SurveyorService(repo);

export async function listSurveyors(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query: ListSurveyorsQuery = {
      search: typeof req.query.search === "string" ? req.query.search : undefined,
    };
    const rows = await service.listSurveyors(query);
    sendSuccess(res, rows);
  } catch (err) {
    next(err);
  }
}

export async function getSurveyorById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const row = await service.getSurveyorById(req.params.id);
    if (!row) {
      sendError(res, "Surveyor not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

export async function createSurveyor(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const row = await service.createSurveyor(req.body);
    sendSuccess(res, row, { statusCode: 201 });
  } catch (err) {
    next(err);
  }
}

export async function updateSurveyor(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const row = await service.updateSurveyor(req.params.id, req.body);
    if (!row) {
      sendError(res, "Surveyor not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

export async function removeSurveyor(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const row = await service.softDeleteSurveyor(req.params.id);
    if (!row) {
      sendError(res, "Surveyor not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, { message: "Deleted" });
  } catch (err) {
    next(err);
  }
}
