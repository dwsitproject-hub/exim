/**
 * Express app bootstrap: middlewares, routes, error handling.
 */

import express from "express";
import cookieParser from "cookie-parser";
import cors, { type CorsOptions } from "cors";
import helmet from "helmet";
import { config } from "../config/index.js";
import { errorHandler, AppError } from "../middlewares/errorHandler.js";
import { healthRoutes } from "../modules/health/routes.js";
import { authRoutes } from "../modules/auth/routes.js";
import { poIntakeRoutes } from "../modules/po-intake/routes.js";
import { shipmentRoutes } from "../modules/shipments/routes.js";
import { userAdminRoutes } from "../modules/users/routes.js";
import { dashboardRoutes } from "../modules/dashboard/routes.js";
import { notificationRoutes } from "../modules/notifications/routes.js";

function buildCorsOptions(): CorsOptions {
  const origins = config.cors.origins;
  const isDev = config.nodeEnv === "development";

  if (!isDev) {
    if (origins.length === 0) {
      throw new Error(
        "CORS_ORIGINS must be set to a comma-separated list of allowed browser origins when NODE_ENV is not development (e.g. https://app.example.com,http://localhost:3002)."
      );
    }
    return { origin: origins, credentials: true };
  }

  return {
    origin: origins.length > 0 ? origins : true,
    credentials: true,
  };
}

export function createApp(): express.Application {
  const app = express();

  if (config.trustProxy !== undefined) {
    app.set("trust proxy", config.trustProxy);
  }

  app.use(helmet());
  app.use(cookieParser());
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use(cors(buildCorsOptions()));

  app.get("/", (_req, res) => {
    res.json({ name: "EOS API", version: "1.0.0", scope: "Phase 1 Import" });
  });

  app.use("/api/v1/health", healthRoutes);
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/users", userAdminRoutes);
  app.use("/api/v1/notifications", notificationRoutes);
  app.use("/api/v1/po", poIntakeRoutes);
  app.use("/api/v1/shipments", shipmentRoutes);
  app.use("/api/v1/dashboard", dashboardRoutes);

  app.use((_req, _res, next) => next(new AppError("Not found", 404)));
  app.use(errorHandler);

  return app;
}
