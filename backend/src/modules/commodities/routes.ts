import { Router } from "express";
import { authMiddleware } from "../auth/auth.middleware.js";
import { requirePermission } from "../auth/rbac.middleware.js";
import {
  PERMISSIONS,
  PERMS_MANAGE_EXPORT_MASTERS,
  PERMS_MANAGE_IMPORT_MASTERS,
} from "../../shared/rbac.js";
import * as ctrl from "./controllers/commodity.controller.js";

export const commodityRoutes = Router();

const P = PERMISSIONS;

commodityRoutes.get(
  "/",
  authMiddleware,
  requirePermission(P.VIEW_EXPORT_BULKING, P.VIEW_SHIPMENTS, ...PERMS_MANAGE_EXPORT_MASTERS),
  ctrl.listCommodities
);
commodityRoutes.get(
  "/jps-mapped",
  authMiddleware,
  requirePermission(P.VIEW_SHIPMENTS, P.VIEW_EXPORT_BULKING, ...PERMS_MANAGE_EXPORT_MASTERS),
  ctrl.listJpsMappedCommodities
);
commodityRoutes.get("/:id", authMiddleware, requirePermission(P.MANAGE_COMMODITIES, ...PERMS_MANAGE_EXPORT_MASTERS), ctrl.getCommodityById);
commodityRoutes.post(
  "/",
  authMiddleware,
  requirePermission(P.UPDATE_EXPORT_OPERATIONS, ...PERMS_MANAGE_EXPORT_MASTERS),
  ctrl.createCommodity,
);
commodityRoutes.patch(
  "/:id",
  authMiddleware,
  requirePermission(P.MANAGE_COMMODITIES, ...PERMS_MANAGE_EXPORT_MASTERS, ...PERMS_MANAGE_IMPORT_MASTERS),
  ctrl.updateCommodity
);
commodityRoutes.delete("/:id", authMiddleware, requirePermission(P.MANAGE_COMMODITIES, ...PERMS_MANAGE_EXPORT_MASTERS), ctrl.removeCommodity);
