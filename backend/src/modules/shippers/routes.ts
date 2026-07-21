import { Router } from "express";
import { authMiddleware } from "../auth/auth.middleware.js";
import { requirePermission } from "../auth/rbac.middleware.js";
import { PERMISSIONS, PERMS_MANAGE_EXPORT_MASTERS, PERMS_MANAGE_IMPORT_MASTERS, PERMS_READ_SHIPPER_MASTER } from "../../shared/rbac.js";
import { uploadSingle } from "../../middlewares/upload.middleware.js";
import * as ctrl from "./controllers/shipper.controller.js";

export const shipperRoutes = Router();

const P = PERMISSIONS;

/* ───── shippers ───── */
shipperRoutes.get("/master", authMiddleware, requirePermission(...PERMS_READ_SHIPPER_MASTER), ctrl.listShippersMaster);
shipperRoutes.get("/", authMiddleware, requirePermission(...PERMS_READ_SHIPPER_MASTER), ctrl.listShippers);
shipperRoutes.get("/:id", authMiddleware, requirePermission(...PERMS_MANAGE_IMPORT_MASTERS, ...PERMS_MANAGE_EXPORT_MASTERS), ctrl.getShipperById);
shipperRoutes.post("/", authMiddleware, requirePermission(...PERMS_MANAGE_IMPORT_MASTERS), ctrl.createShipper);
shipperRoutes.patch(
  "/:id",
  authMiddleware,
  requirePermission(...PERMS_MANAGE_IMPORT_MASTERS, ...PERMS_MANAGE_EXPORT_MASTERS),
  ctrl.updateShipper,
);
shipperRoutes.delete("/:id", authMiddleware, requirePermission(...PERMS_MANAGE_IMPORT_MASTERS), ctrl.removeShipper);

/* ───── plants (import) ───── */
shipperRoutes.get("/:id/plants", authMiddleware, requirePermission(...PERMS_READ_SHIPPER_MASTER), ctrl.listPlants);
shipperRoutes.post("/:id/plants", authMiddleware, requirePermission(...PERMS_MANAGE_IMPORT_MASTERS), ctrl.createPlant);
shipperRoutes.patch("/plants/:plantId", authMiddleware, requirePermission(...PERMS_MANAGE_IMPORT_MASTERS), ctrl.updatePlant);
shipperRoutes.delete("/plants/:plantId", authMiddleware, requirePermission(...PERMS_MANAGE_IMPORT_MASTERS), ctrl.removePlant);

/* ───── load ports (export) ───── */
shipperRoutes.get("/:id/loadports", authMiddleware, requirePermission(...PERMS_READ_SHIPPER_MASTER), ctrl.listLoadports);
shipperRoutes.post(
  "/:id/loadports",
  authMiddleware,
  requirePermission(P.UPDATE_EXPORT_OPERATIONS, P.UPDATE_EXPORT_BULKING, ...PERMS_MANAGE_EXPORT_MASTERS),
  ctrl.createLoadport,
);
shipperRoutes.patch("/loadports/:lpId", authMiddleware, requirePermission(...PERMS_MANAGE_EXPORT_MASTERS), ctrl.updateLoadport);
shipperRoutes.delete("/loadports/:lpId", authMiddleware, requirePermission(...PERMS_MANAGE_EXPORT_MASTERS), ctrl.removeLoadport);

/* ───── document header (export printable documents) ───── */
shipperRoutes.post(
  "/:id/document-header",
  authMiddleware,
  requirePermission(...PERMS_MANAGE_EXPORT_MASTERS),
  uploadSingle,
  ctrl.uploadDocumentHeader,
);
shipperRoutes.get(
  "/:id/document-header",
  authMiddleware,
  requirePermission(
    ...PERMS_READ_SHIPPER_MASTER,
    PERMISSIONS.VIEW_EXPORT_DOCUMENTATION,
    PERMISSIONS.VIEW_EXPORT_BULKING,
  ),
  ctrl.downloadDocumentHeader,
);
shipperRoutes.delete(
  "/:id/document-header",
  authMiddleware,
  requirePermission(...PERMS_MANAGE_EXPORT_MASTERS),
  ctrl.removeDocumentHeader,
);
