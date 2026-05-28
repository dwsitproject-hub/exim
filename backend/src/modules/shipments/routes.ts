/**
 * Shipment routes. CRUD, status, timeline, couple/decouple PO, bidding.
 */

import { Router } from "express";
import { authMiddleware } from "../auth/auth.middleware.js";
import { requirePermission } from "../auth/rbac.middleware.js";
import { PERMISSIONS } from "../../shared/rbac.js";
import { uploadSingle } from "../../middlewares/upload.middleware.js";
import * as shipmentController from "./controllers/shipment.controller.js";
import * as statusController from "./controllers/shipment-status.controller.js";
import * as bidController from "./controllers/shipment-bid.controller.js";
import * as noteController from "./controllers/shipment-note.controller.js";
import * as shipmentDocumentController from "./controllers/shipment-document.controller.js";
import * as activityController from "./controllers/shipment-activity.controller.js";

export const shipmentRoutes = Router();

shipmentRoutes.post("/", authMiddleware, requirePermission(PERMISSIONS.CREATE_SHIPMENT), shipmentController.create);
shipmentRoutes.get("/", authMiddleware, requirePermission(PERMISSIONS.VIEW_SHIPMENTS), shipmentController.list);
shipmentRoutes.get(
  "/list-filter-options",
  authMiddleware,
  requirePermission(PERMISSIONS.VIEW_SHIPMENTS),
  shipmentController.listFilterOptions
);
shipmentRoutes.get(
  "/import/combined-template-csv",
  authMiddleware,
  requirePermission(PERMISSIONS.IMPORT_PO_CSV),
  shipmentController.downloadCombinedImportTemplate
);
shipmentRoutes.post(
  "/import/combined-csv",
  authMiddleware,
  requirePermission(PERMISSIONS.IMPORT_PO_CSV),
  uploadSingle,
  shipmentController.importCombinedCsv
);
shipmentRoutes.get(
  "/import/history",
  authMiddleware,
  requirePermission(PERMISSIONS.IMPORT_PO_CSV),
  shipmentController.listShipmentImportHistory
);
shipmentRoutes.get("/:id", authMiddleware, requirePermission(PERMISSIONS.VIEW_SHIPMENTS), shipmentController.getById);
shipmentRoutes.put("/:id", authMiddleware, requirePermission(PERMISSIONS.UPDATE_SHIPMENT), shipmentController.update);
shipmentRoutes.patch("/:id/close", authMiddleware, requirePermission(PERMISSIONS.UPDATE_SHIPMENT), shipmentController.close);
shipmentRoutes.delete("/:id", authMiddleware, requirePermission(PERMISSIONS.UPDATE_SHIPMENT), shipmentController.softDelete);

shipmentRoutes.patch("/:id/status", authMiddleware, requirePermission(PERMISSIONS.UPDATE_STATUS), statusController.updateStatus);
shipmentRoutes.get("/:id/timeline", authMiddleware, requirePermission(PERMISSIONS.VIEW_SHIPMENTS), statusController.getTimeline);
shipmentRoutes.get("/:id/status-summary", authMiddleware, requirePermission(PERMISSIONS.VIEW_SHIPMENTS), statusController.getStatusSummary);
shipmentRoutes.get("/:id/activity-log", authMiddleware, requirePermission(PERMISSIONS.VIEW_SHIPMENTS), activityController.getActivityLog);

shipmentRoutes.get("/:id/notes", authMiddleware, requirePermission(PERMISSIONS.VIEW_SHIPMENTS), noteController.listNotes);
shipmentRoutes.post("/:id/notes", authMiddleware, requirePermission(PERMISSIONS.UPDATE_SHIPMENT), noteController.createNote);

shipmentRoutes.get("/:id/documents", authMiddleware, requirePermission(PERMISSIONS.VIEW_SHIPMENTS), shipmentDocumentController.listDocuments);
shipmentRoutes.post(
  "/:id/documents",
  authMiddleware,
  requirePermission(PERMISSIONS.UPLOAD_DOCUMENT),
  uploadSingle,
  shipmentDocumentController.uploadDocument
);
shipmentRoutes.get(
  "/:id/documents/:documentId/download",
  authMiddleware,
  requirePermission(PERMISSIONS.VIEW_SHIPMENTS),
  shipmentDocumentController.downloadDocument
);
shipmentRoutes.delete(
  "/:id/documents/:documentId",
  authMiddleware,
  requirePermission(PERMISSIONS.UPDATE_SHIPMENT),
  shipmentDocumentController.deleteDocument
);

shipmentRoutes.post("/:id/couple-po", authMiddleware, requirePermission(PERMISSIONS.COUPLE_DECOUPLE_PO), shipmentController.couplePo);
shipmentRoutes.post("/:id/decouple-po", authMiddleware, requirePermission(PERMISSIONS.COUPLE_DECOUPLE_PO), shipmentController.decouplePo);
shipmentRoutes.patch("/:id/po/:intakeId", authMiddleware, requirePermission(PERMISSIONS.UPDATE_SHIPMENT), shipmentController.updatePoMapping);
shipmentRoutes.patch("/:id/po/:intakeId/lines", authMiddleware, requirePermission(PERMISSIONS.UPDATE_SHIPMENT), shipmentController.updatePoLines);

shipmentRoutes.get("/bids/recent", authMiddleware, requirePermission(PERMISSIONS.VIEW_SHIPMENTS), bidController.listRecentForwarders);
shipmentRoutes.get("/:id/bids", authMiddleware, requirePermission(PERMISSIONS.VIEW_SHIPMENTS), bidController.listBids);
shipmentRoutes.post("/:id/bids", authMiddleware, requirePermission(PERMISSIONS.UPDATE_SHIPMENT), bidController.createBid);
shipmentRoutes.put("/:id/bids/:bidId", authMiddleware, requirePermission(PERMISSIONS.UPDATE_SHIPMENT), bidController.updateBid);
shipmentRoutes.delete("/:id/bids/:bidId", authMiddleware, requirePermission(PERMISSIONS.UPDATE_SHIPMENT), bidController.deleteBid);
shipmentRoutes.post("/:id/bids/:bidId/quotation", authMiddleware, requirePermission(PERMISSIONS.UPLOAD_DOCUMENT), uploadSingle, bidController.uploadQuotation);
shipmentRoutes.get("/:id/bids/:bidId/quotation", authMiddleware, requirePermission(PERMISSIONS.VIEW_SHIPMENTS), bidController.downloadQuotation);
