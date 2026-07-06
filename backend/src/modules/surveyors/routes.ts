import { Router } from "express";
import { authMiddleware } from "../auth/auth.middleware.js";
import { requirePermission } from "../auth/rbac.middleware.js";
import { PERMISSIONS, PERMS_MANAGE_EXPORT_MASTERS } from "../../shared/rbac.js";
import * as ctrl from "./controllers/surveyor.controller.js";

export const surveyorRoutes = Router();

const P = PERMISSIONS;

surveyorRoutes.get("/", authMiddleware, requirePermission(P.VIEW_EXPORT_BULKING, ...PERMS_MANAGE_EXPORT_MASTERS), ctrl.listSurveyors);
surveyorRoutes.get("/:id", authMiddleware, requirePermission(P.MANAGE_SURVEYORS, ...PERMS_MANAGE_EXPORT_MASTERS), ctrl.getSurveyorById);
surveyorRoutes.post("/", authMiddleware, requirePermission(P.VIEW_EXPORT_BULKING), ctrl.createSurveyor);
surveyorRoutes.patch("/:id", authMiddleware, requirePermission(P.MANAGE_SURVEYORS, ...PERMS_MANAGE_EXPORT_MASTERS), ctrl.updateSurveyor);
surveyorRoutes.delete("/:id", authMiddleware, requirePermission(P.MANAGE_SURVEYORS, ...PERMS_MANAGE_EXPORT_MASTERS), ctrl.removeSurveyor);
