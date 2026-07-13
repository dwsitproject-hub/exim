/**
 * Export bulking activity log — merged audit trail for the detail UI.
 */

import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/response.js";
import { UserRepository } from "../../auth/repositories/user.repository.js";
import { ShipmentUpdateLogRepository } from "../../shipments/repositories/shipment-update-log.repository.js";
import { ExportBulkingRepository } from "../repositories/export-bulking.repository.js";
import { ExportBulkingActivityService } from "../services/export-bulking-activity.service.js";

const repo = new ExportBulkingRepository();
const updateLogRepo = new ShipmentUpdateLogRepository();
const userRepo = new UserRepository();
const service = new ExportBulkingActivityService(repo, updateLogRepo, userRepo);

export async function getActivityLog(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = req.params.id as string;
  try {
    const data = await service.getActivityLog(id);
    sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}
