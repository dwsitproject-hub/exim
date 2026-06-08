/**
 * HTTP server: bind and listen. Called from index after DB connect.
 */

import type { Application } from "express";
import { config } from "./config/index.js";
import { logger } from "./utils/logger.js";

export function createServer(app: Application): Promise<void> {
  return new Promise((resolve) => {
    const server = app.listen(config.port, () => {
      logger.info("Server listening", { port: config.port, nodeEnv: config.nodeEnv });
      logger.info("PO PDF Claude", {
        enabled: config.poPdfClaude.enabled,
        api_key_configured: Boolean(config.poPdfClaude.apiKey),
        model: config.poPdfClaude.model,
      });
      resolve();
    });
    server.on("error", (err) => {
      logger.error("Server error", { error: String(err) });
      process.exitCode = 1;
    });
  });
}
