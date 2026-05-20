import { Router } from "express";
import { authMiddleware } from "../auth/auth.middleware.js";
import { requirePermission } from "../auth/rbac.middleware.js";
import { PERMISSIONS } from "../../shared/rbac.js";
import * as ctrl from "./controllers/shipper.controller.js";

export const shipperRoutes = Router();

const P = PERMISSIONS;

/* ───── shippers ───── */
shipperRoutes.get("/", authMiddleware, requirePermission(P.VIEW_EXPORT_BULKING), ctrl.listShippers);
shipperRoutes.get("/:id", authMiddleware, requirePermission(P.MANAGE_SHIPPERS), ctrl.getShipperById);
shipperRoutes.post("/", authMiddleware, requirePermission(P.MANAGE_SHIPPERS), ctrl.createShipper);
shipperRoutes.patch("/:id", authMiddleware, requirePermission(P.MANAGE_SHIPPERS), ctrl.updateShipper);
shipperRoutes.delete("/:id", authMiddleware, requirePermission(P.MANAGE_SHIPPERS), ctrl.removeShipper);

/* ───── shipper loadports ───── */
shipperRoutes.get("/:id/loadports", authMiddleware, requirePermission(P.VIEW_EXPORT_BULKING), ctrl.listLoadports);
shipperRoutes.post("/:id/loadports", authMiddleware, requirePermission(P.VIEW_EXPORT_BULKING), ctrl.createLoadport);
shipperRoutes.patch("/loadports/:lpId", authMiddleware, requirePermission(P.MANAGE_SHIPPERS), ctrl.updateLoadport);
shipperRoutes.delete("/loadports/:lpId", authMiddleware, requirePermission(P.MANAGE_SHIPPERS), ctrl.removeLoadport);
