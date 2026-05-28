/**
 * Admin user routes — require MANAGE_USERS.
 */

import { Router } from "express";
import { authMiddleware } from "../auth/auth.middleware.js";
import { requirePermission } from "../auth/rbac.middleware.js";
import { PERMISSIONS } from "../../shared/rbac.js";
import * as controller from "./controllers/user-admin.controller.js";
import * as mentionController from "./controllers/user-mention.controller.js";

export const userAdminRoutes = Router();

const manage = [authMiddleware, requirePermission(PERMISSIONS.MANAGE_USERS)];

userAdminRoutes.get(
  "/mentionable",
  authMiddleware,
  requirePermission(PERMISSIONS.VIEW_SHIPMENTS),
  mentionController.listMentionable
);

userAdminRoutes.get("/", ...manage, controller.list);
userAdminRoutes.post("/", ...manage, controller.create);
userAdminRoutes.post(
  "/import",
  ...manage,
  controller.userImportUpload.single("file"),
  controller.importCsv
);
userAdminRoutes.get("/:id", ...manage, controller.getById);
userAdminRoutes.patch("/:id", ...manage, controller.patch);
