import { Router } from "express";
import { authMiddleware } from "../auth/auth.middleware.js";
import { requirePermission } from "../auth/rbac.middleware.js";
import { PERMISSIONS } from "../../shared/rbac.js";
import * as ctrl from "./controllers/agent.controller.js";

export const agentRoutes = Router();

const P = PERMISSIONS;

agentRoutes.get("/", authMiddleware, requirePermission(P.VIEW_EXPORT_BULKING), ctrl.listAgents);
agentRoutes.get("/:id", authMiddleware, requirePermission(P.MANAGE_AGENTS), ctrl.getAgentById);
agentRoutes.post("/", authMiddleware, requirePermission(P.VIEW_EXPORT_BULKING), ctrl.createAgent);
agentRoutes.patch("/:id", authMiddleware, requirePermission(P.MANAGE_AGENTS), ctrl.updateAgent);
agentRoutes.delete("/:id", authMiddleware, requirePermission(P.MANAGE_AGENTS), ctrl.removeAgent);
