import { Router } from "express";
import { authMiddleware } from "../auth/auth.middleware.js";
import { requirePermission } from "../auth/rbac.middleware.js";
import { PERMISSIONS } from "../../shared/rbac.js";
import * as ctrl from "./controllers/export-bulking.controller.js";

export const exportBulkingRoutes = Router();

const P = PERMISSIONS;

/* ───── shipment CRUD ───── */
exportBulkingRoutes.post("/shipments", authMiddleware, requirePermission(P.CREATE_EXPORT_BULKING), ctrl.create);
exportBulkingRoutes.get("/shipments", authMiddleware, requirePermission(P.VIEW_EXPORT_BULKING), ctrl.list);
exportBulkingRoutes.get("/shipments/filter-options", authMiddleware, requirePermission(P.VIEW_EXPORT_BULKING), ctrl.listFilterOptions);
exportBulkingRoutes.get("/shipments/:id", authMiddleware, requirePermission(P.VIEW_EXPORT_BULKING), ctrl.getById);
exportBulkingRoutes.get("/shipments/:id/full", authMiddleware, requirePermission(P.VIEW_EXPORT_BULKING), ctrl.getFullDetail);
exportBulkingRoutes.patch("/shipments/:id", authMiddleware, requirePermission(P.UPDATE_EXPORT_BULKING), ctrl.update);
exportBulkingRoutes.delete("/shipments/:id", authMiddleware, requirePermission(P.UPDATE_EXPORT_BULKING), ctrl.remove);
exportBulkingRoutes.patch("/shipments/:id/status", authMiddleware, requirePermission(P.UPDATE_EXPORT_BULKING_STATUS), ctrl.updateStatus);
exportBulkingRoutes.get("/shipments/:id/status-events", authMiddleware, requirePermission(P.VIEW_EXPORT_BULKING), ctrl.getStatusEvents);

/* ───── cargo lines ───── */
exportBulkingRoutes.get("/shipments/:id/cargos", authMiddleware, requirePermission(P.VIEW_EXPORT_BULKING), ctrl.listCargos);
exportBulkingRoutes.put("/shipments/:id/cargos", authMiddleware, requirePermission(P.UPDATE_EXPORT_BULKING), ctrl.upsertCargos);
exportBulkingRoutes.delete("/shipments/:id/cargos/:cargoId", authMiddleware, requirePermission(P.UPDATE_EXPORT_BULKING), ctrl.deleteCargo);

/* ───── shipping instructions ───── */
exportBulkingRoutes.get("/shipments/:id/shipping-instructions", authMiddleware, requirePermission(P.VIEW_EXPORT_BULKING), ctrl.listSIs);
exportBulkingRoutes.post("/shipments/:id/shipping-instructions", authMiddleware, requirePermission(P.UPDATE_EXPORT_BULKING), ctrl.createSI);
exportBulkingRoutes.patch("/shipments/:id/shipping-instructions/:siId", authMiddleware, requirePermission(P.UPDATE_EXPORT_BULKING), ctrl.updateSI);
exportBulkingRoutes.post(
  "/shipments/:id/shipping-instructions/:siId/regenerate-number",
  authMiddleware,
  requirePermission(P.UPDATE_EXPORT_BULKING),
  ctrl.regenerateSINumber,
);
exportBulkingRoutes.delete("/shipments/:id/shipping-instructions/:siId", authMiddleware, requirePermission(P.UPDATE_EXPORT_BULKING), ctrl.deleteSI);

/* ───── invoices ───── */
exportBulkingRoutes.get("/shipments/:id/invoices", authMiddleware, requirePermission(P.VIEW_EXPORT_BULKING), ctrl.listInvoices);
exportBulkingRoutes.post("/shipments/:id/invoices", authMiddleware, requirePermission(P.UPDATE_EXPORT_BULKING), ctrl.createInvoice);
exportBulkingRoutes.patch("/shipments/:id/invoices/:invId", authMiddleware, requirePermission(P.UPDATE_EXPORT_BULKING), ctrl.updateInvoice);
exportBulkingRoutes.post(
  "/shipments/:id/invoices/:invId/regenerate-number",
  authMiddleware,
  requirePermission(P.UPDATE_EXPORT_BULKING),
  ctrl.regenerateInvoiceNumber,
);
exportBulkingRoutes.delete("/shipments/:id/invoices/:invId", authMiddleware, requirePermission(P.UPDATE_EXPORT_BULKING), ctrl.deleteInvoice);

/* ───── packing lists ───── */
exportBulkingRoutes.get("/shipments/:id/packing-lists", authMiddleware, requirePermission(P.VIEW_EXPORT_BULKING), ctrl.listPLs);
exportBulkingRoutes.post("/shipments/:id/packing-lists", authMiddleware, requirePermission(P.UPDATE_EXPORT_BULKING), ctrl.createPL);
exportBulkingRoutes.patch("/shipments/:id/packing-lists/:plId", authMiddleware, requirePermission(P.UPDATE_EXPORT_BULKING), ctrl.updatePL);
exportBulkingRoutes.post(
  "/shipments/:id/packing-lists/:plId/regenerate-number",
  authMiddleware,
  requirePermission(P.UPDATE_EXPORT_BULKING),
  ctrl.regeneratePackingListNumber,
);
exportBulkingRoutes.delete("/shipments/:id/packing-lists/:plId", authMiddleware, requirePermission(P.UPDATE_EXPORT_BULKING), ctrl.deletePL);
