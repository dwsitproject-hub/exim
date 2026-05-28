/**
 * Backend entry: load config, connect DB, create app, start server, start PO polling if enabled.
 */

import { config } from "./config/index.js";
import { connectDb, closeDb } from "./db/index.js";
import { createApp } from "./app/index.js";
import { createServer } from "./server.js";
import { logger } from "./utils/logger.js";
import { PoIntakeRepository } from "./modules/po-intake/repositories/po-intake.repository.js";
import { createPoApiClient, startPoPolling } from "./integration/saaS/index.js";

let stopCoupaStagingIntegrationFn: (() => void) | null = null;

async function main(): Promise<void> {
  try {
    await connectDb();
  } catch (err) {
    logger.error("Database connection failed", { error: String(err) });
    process.exit(1);
  }

  const app = createApp();
  await createServer(app);

  if (config.poPolling.enabled) {
    const repo = new PoIntakeRepository();
    const client = createPoApiClient(config.poPolling.saasApiBaseUrl);
    startPoPolling(repo, client, config.poPolling.intervalMs);
  }

  if (config.coupa.enabled) {
    const coupaModulePath = "./integration/coupa/index.js";
    const coupaModule = (await import(coupaModulePath)) as {
      CoupaPoApiClient: {
        fromConfig: (args: {
          baseUrl: string;
          issuedListPathOrUrl: string;
          accessToken?: string;
          clientId?: string;
          clientSecret?: string;
          oauthTokenUrl?: string;
          oauthScope?: string;
          requestTimeoutMs?: number;
        }) => unknown;
      };
      PurchaseOrderStagingRepository: new () => unknown;
      startCoupaStagingIntegration: (
        args: { stagingRepo: unknown; poRepo: PoIntakeRepository; coupa: unknown },
        options: { ingestMs: number; processorMs: number }
      ) => void;
      stopCoupaStagingIntegration: () => void;
    };

    const coupa = coupaModule.CoupaPoApiClient.fromConfig({
      baseUrl: config.coupa.baseUrl,
      issuedListPathOrUrl: config.coupa.issuedListPathOrUrl,
      accessToken: config.coupa.accessToken,
      clientId: config.coupa.clientId,
      clientSecret: config.coupa.clientSecret,
      oauthTokenUrl: config.coupa.oauthTokenUrl,
      oauthScope: config.coupa.oauthScope,
      requestTimeoutMs: config.coupa.requestTimeoutMs,
    });
    coupaModule.startCoupaStagingIntegration(
      {
        stagingRepo: new coupaModule.PurchaseOrderStagingRepository(),
        poRepo: new PoIntakeRepository(),
        coupa,
      },
      { ingestMs: config.coupa.ingestIntervalMs, processorMs: config.coupa.processorIntervalMs }
    );
    stopCoupaStagingIntegrationFn = coupaModule.stopCoupaStagingIntegration;
  }
}

main().catch((err) => {
  logger.error("Bootstrap failed", { error: String(err) });
  process.exit(1);
});

process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, stopping polling and closing DB");
  const { stopPoPolling } = await import("./integration/saaS/index.js");
  stopPoPolling();
  stopCoupaStagingIntegrationFn?.();
  await closeDb();
  process.exit(0);
});
