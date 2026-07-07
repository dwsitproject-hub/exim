import { Router } from "express";
import { authMiddleware } from "../auth/auth.middleware.js";
import { requirePermission } from "../auth/rbac.middleware.js";
import { PERMISSIONS, PERMS_MANAGE_EXPORT_MASTERS } from "../../shared/rbac.js";
import * as ctrl from "./controllers/agent.controller.js";

export const agentRoutes = Router();

const P = PERMISSIONS;

agentRoutes.get("/", authMiddleware, requirePermission(P.VIEW_EXPORT_BULKING, ...PERMS_MANAGE_EXPORT_MASTERS), ctrl.listAgents);
agentRoutes.get("/:id", authMiddleware, requirePermission(P.MANAGE_AGENTS, ...PERMS_MANAGE_EXPORT_MASTERS), ctrl.getAgentById);
agentRoutes.post(
  "/",
  authMiddleware,
  requirePermission(P.UPDATE_EXPORT_OPERATIONS, P.UPDATE_EXPORT_BULKING, ...PERMS_MANAGE_EXPORT_MASTERS),
  ctrl.createAgent,
);
agentRoutes.patch("/:id", authMiddleware, requirePermission(P.MANAGE_AGENTS, ...PERMS_MANAGE_EXPORT_MASTERS), ctrl.updateAgent);
agentRoutes.delete("/:id", authMiddleware, requirePermission(P.MANAGE_AGENTS, ...PERMS_MANAGE_EXPORT_MASTERS), ctrl.removeAgent);
