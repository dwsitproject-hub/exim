import { Router } from "express";
import { authMiddleware } from "../auth/auth.middleware.js";
import { requirePermission } from "../auth/rbac.middleware.js";
import { PERMISSIONS } from "../../shared/rbac.js";
import * as dashboardController from "./controllers/dashboard.controller.js";

export const dashboardRoutes = Router();

dashboardRoutes.get(
  "/delivered-management",
  authMiddleware,
  requirePermission(PERMISSIONS.VIEW_SHIPMENTS),
  dashboardController.getDeliveredManagementSummary
);
dashboardRoutes.get(
  "/delivered-by-pt-plant",
  authMiddleware,
  requirePermission(PERMISSIONS.VIEW_SHIPMENTS),
  dashboardController.getDeliveredByPtPlantAgg
);
dashboardRoutes.get(
  "/delivered-by-classification",
  authMiddleware,
  requirePermission(PERMISSIONS.VIEW_SHIPMENTS),
  dashboardController.getDeliveredByClassificationAgg
);
dashboardRoutes.get(
  "/procurement-plant-report",
  authMiddleware,
  requirePermission(PERMISSIONS.VIEW_SHIPMENTS),
  dashboardController.getProcurementPlantReport
);
dashboardRoutes.get(
  "/shipment-analytics",
  authMiddleware,
  requirePermission(PERMISSIONS.VIEW_SHIPMENTS),
  dashboardController.getShipmentAnalytics
);
dashboardRoutes.get(
  "/shipment-analytics/lines",
  authMiddleware,
  requirePermission(PERMISSIONS.VIEW_SHIPMENTS),
  dashboardController.getShipmentAnalyticsLines
);
/** @deprecated Use GET /dashboard/delivered-management — same response shape. */
dashboardRoutes.get(
  "/product-specification-summary",
  authMiddleware,
  requirePermission(PERMISSIONS.VIEW_SHIPMENTS),
  dashboardController.getDeliveredManagementSummary
);
