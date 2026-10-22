/**
 * Master-data routes (DHM-backed company / site / plant + exchange_rate). All require auth.
 */

import { Router } from "express";
import { authMiddleware } from "../auth/auth.middleware.js";
import { requirePermission, requireRole } from "../auth/rbac.middleware.js";
import { PERMISSIONS, ROLES } from "../../shared/rbac.js";
import * as controller from "./controllers/masters.controller.js";

export const mastersRoutes = Router();

mastersRoutes.get(
  "/companies",
  authMiddleware,
  requirePermission(PERMISSIONS.VIEW_SHIPMENTS),
  controller.listCompanies
);

mastersRoutes.get(
  "/pt-plant-tree",
  authMiddleware,
  requirePermission(PERMISSIONS.VIEW_SHIPMENTS, PERMISSIONS.VIEW_PO_INTAKE),
  controller.getPtPlantTree
);

mastersRoutes.get(
  "/catalog",
  authMiddleware,
  requirePermission(PERMISSIONS.VIEW_SHIPMENTS, PERMISSIONS.VIEW_PO_INTAKE),
  controller.getCatalog
);

mastersRoutes.post(
  "/companies",
  authMiddleware,
  requirePermission(PERMISSIONS.CREATE_SHIPMENT, PERMISSIONS.UPDATE_SHIPMENT),
  controller.createCompany
);

mastersRoutes.get(
  "/exchange-rates/latest",
  authMiddleware,
  requirePermission(PERMISSIONS.VIEW_SHIPMENTS),
  controller.getLatestExchangeRate
);

mastersRoutes.post("/dhm/sync", authMiddleware, requireRole(ROLES.ADMIN), controller.triggerSync);
mastersRoutes.get("/dhm/health", authMiddleware, requireRole(ROLES.ADMIN), controller.getSyncHealth);
