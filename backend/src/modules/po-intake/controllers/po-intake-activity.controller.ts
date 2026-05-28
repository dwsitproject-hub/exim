/**
 * PO intake activity log — merged audit trail for the detail UI.
 */

import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/response.js";
import { PoIntakeRepository } from "../repositories/po-intake.repository.js";
import { PoIntakeUpdateLogRepository } from "../repositories/po-intake-update-log.repository.js";
import { ShipmentPoMappingRepository } from "../../shipments/repositories/shipment-po-mapping.repository.js";
import { UserRepository } from "../../auth/repositories/user.repository.js";
import { PoIntakeActivityService } from "../services/po-intake-activity.service.js";

const poRepo = new PoIntakeRepository();
const mappingRepo = new ShipmentPoMappingRepository();
const updateLogRepo = new PoIntakeUpdateLogRepository();
const userRepo = new UserRepository();
const service = new PoIntakeActivityService(poRepo, mappingRepo, updateLogRepo, userRepo);

export async function getActivityLog(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = req.params.id as string;
  try {
    const data = await service.getActivityLog(id);
    sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}
