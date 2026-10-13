/**
 * Backend entry: load config, connect DB, create app, start server, start PO polling if enabled.
 */

import { config } from "./config/index.js";
import { connectDb, closeDb } from "./db/index.js";
import { initPoItemUnitRegistry } from "./shared/po-item-unit-registry.js";
import { createApp } from "./app/index.js";
import { createServer } from "./server.js";
import { logger } from "./utils/logger.js";
import { PoIntakeRepository } from "./modules/po-intake/repositories/po-intake.repository.js";
import { PoIntakeService } from "./modules/po-intake/services/po-intake.service.js";
import { ShipmentPoMappingRepository } from "./modules/shipments/repositories/shipment-po-mapping.repository.js";
import { UserRepository } from "./modules/auth/repositories/user.repository.js";
import {
  createPoApiClient,
  isMockPoSamplesEnabled,
  isSynceraConfigured,
  startPoPolling,
} from "./integration/saaS/index.js";
import { SynceraIntegrationAuditRepository } from "./integration/saaS/syncera-integration-audit.repository.js";
import {
  startShipmentEtaReminderJob,
  stopShipmentEtaReminderJob,
} from "./integration/jobs/shipment-eta-reminder-job.js";

let stopCoupaStagingIntegrationFn: (() => void) | null = null;

async function main(): Promise<void> {
  try {
    await connectDb();
    await initPoItemUnitRegistry();
  } catch (err) {
    logger.error("Database connection failed", { error: String(err) });
    process.exit(1);
  }

  const app = createApp();
  await createServer(app);

  if (config.poPolling.enabled) {
    const synceraReady = isSynceraConfigured(config.poPolling);
    if (!synceraReady && !isMockPoSamplesEnabled()) {
      logger.error(
        "PO polling enabled but SAAS_PO_API_BASE_URL, SYNCERA_CLIENT_ID, and SYNCERA_CLIENT_SECRET are required (or set MOCK_PO_SAMPLES=true)"
      );
    } else {
      const repo = new PoIntakeRepository();
      const mappingRepo = new ShipmentPoMappingRepository();
      const service = new PoIntakeService(repo, mappingRepo, new UserRepository());
      const client = createPoApiClient(config.poPolling);
      const auditRepo = new SynceraIntegrationAuditRepository();
      startPoPolling(
        {
          repo,
          service,
          mappingRepo,
          client,
          auditRepo,
          lookbackDays: config.poPolling.lookbackDays,
        },
        config.poPolling.intervalMs
      );
    }
  }

  if (config.etaReminder.enabled) {
    startShipmentEtaReminderJob(config.etaReminder.runHourJakarta, config.etaReminder.runMinuteJakarta);
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
  stopShipmentEtaReminderJob();
  stopCoupaStagingIntegrationFn?.();
  await closeDb();
  process.exit(0);
});
