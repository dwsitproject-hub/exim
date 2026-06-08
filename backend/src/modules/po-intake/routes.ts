/**
 * PO routes. API: GET /po, GET /po/:id, POST /:id/take, POST /:id/create-shipment, POST /:id/couple-to-shipment.
 * test-create kept for E2E.
 */

import { Router } from "express";
import { authMiddleware } from "../auth/auth.middleware.js";
import { requirePermission } from "../auth/rbac.middleware.js";
import { PERMISSIONS } from "../../shared/rbac.js";
import { uploadSingle } from "../../middlewares/upload.middleware.js";
import * as controller from "./controllers/po-intake.controller.js";
import * as activityController from "./controllers/po-intake-activity.controller.js";
import * as pdfParseController from "./controllers/po-pdf-parse.controller.js";
import * as pdfAiAdminController from "./controllers/po-pdf-ai-admin.controller.js";

export const poIntakeRoutes = Router();

poIntakeRoutes.post(
  "/test-create",
  authMiddleware,
  requirePermission(PERMISSIONS.CREATE_PO_INTAKE_TEST),
  controller.create
);
poIntakeRoutes.get("/", authMiddleware, requirePermission(PERMISSIONS.VIEW_PO_INTAKE), controller.list);
poIntakeRoutes.get(
  "/list-filter-options",
  authMiddleware,
  requirePermission(PERMISSIONS.VIEW_PO_INTAKE),
  controller.listFilterOptions
);
poIntakeRoutes.get(
  "/lookup-by-po-number",
  authMiddleware,
  requirePermission(PERMISSIONS.VIEW_PO_INTAKE),
  controller.lookupByPoNumber
);
poIntakeRoutes.get(
  "/import/template-csv",
  authMiddleware,
  requirePermission(PERMISSIONS.IMPORT_PO_CSV),
  controller.downloadImportTemplate
);
poIntakeRoutes.get(
  "/import/history",
  authMiddleware,
  requirePermission(PERMISSIONS.IMPORT_PO_CSV),
  controller.listImportHistory
);
poIntakeRoutes.post(
  "/import/csv",
  authMiddleware,
  requirePermission(PERMISSIONS.IMPORT_PO_CSV),
  uploadSingle,
  controller.importCsv
);
poIntakeRoutes.post(
  "/import/parse-pdf",
  authMiddleware,
  requirePermission(PERMISSIONS.PARSE_PO_PDF),
  uploadSingle,
  pdfParseController.parsePdf
);
poIntakeRoutes.get(
  "/admin/pdf-ai-requests",
  authMiddleware,
  requirePermission(PERMISSIONS.VIEW_PO_PDF_AI_USAGE),
  pdfAiAdminController.listPdfAiRequests
);
poIntakeRoutes.patch(
  "/:id",
  authMiddleware,
  requirePermission(PERMISSIONS.UPDATE_PO_INTAKE),
  controller.updateIntake
);
poIntakeRoutes.get(
  "/:id/activity-log",
  authMiddleware,
  requirePermission(PERMISSIONS.VIEW_PO_INTAKE),
  activityController.getActivityLog
);
poIntakeRoutes.get("/:id", authMiddleware, requirePermission(PERMISSIONS.VIEW_PO_INTAKE), controller.getById);
poIntakeRoutes.post("/:id/take", authMiddleware, requirePermission(PERMISSIONS.TAKE_OWNERSHIP), controller.takeOwnership);
poIntakeRoutes.post(
  "/:id/create-shipment",
  authMiddleware,
  requirePermission(PERMISSIONS.CREATE_SHIPMENT),
  controller.createShipment
);
poIntakeRoutes.post(
  "/:id/couple-to-shipment",
  authMiddleware,
  requirePermission(PERMISSIONS.COUPLE_DECOUPLE_PO),
  controller.coupleToShipment
);
