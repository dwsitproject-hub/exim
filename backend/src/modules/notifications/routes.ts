/**
 * In-app notification routes.
 */

import { Router } from "express";
import { authMiddleware } from "../auth/auth.middleware.js";
import * as controller from "./controllers/notification.controller.js";

export const notificationRoutes = Router();

notificationRoutes.use(authMiddleware);

notificationRoutes.get("/", controller.listNotifications);
notificationRoutes.patch("/:id/read", controller.markRead);
notificationRoutes.post("/read-all", controller.markAllRead);
