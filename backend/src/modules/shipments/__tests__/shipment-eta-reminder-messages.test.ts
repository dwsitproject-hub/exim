/**
 * Run with: npx tsx backend/src/modules/shipments/__tests__/shipment-eta-reminder-messages.test.ts
 */

import {
  buildEtaReminderMessage,
  etaReminderDaysAhead,
  etaReminderNotificationType,
  formatEtaDisplayDate,
} from "../utils/shipment-eta-reminder-messages.js";
import {
  jakartaDateKey,
  shouldRunEtaReminderNow,
} from "../../../integration/jobs/shipment-eta-reminder-job.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

assert(formatEtaDisplayDate("2026-06-27").includes("June"), "ETA display includes month name");
assert(formatEtaDisplayDate("2026-06-27").includes("2026"), "ETA display includes year");

const po = "1012014246, 1012014247";

const h3 = buildEtaReminderMessage("SHP-001", po, "2026-06-27", "h3");
assert(
  h3 ===
    "Import SHP-001 (PO 1012014246, 1012014247): ETA in 3 days (27 June 2026). Please review shipment readiness.",
  "H-3 message with PO numbers"
);

const h2 = buildEtaReminderMessage("SHP-001", po, "2026-06-27", "h2");
assert(
  h2 ===
    "Import SHP-001 (PO 1012014246, 1012014247): ETA in 2 days (27 June 2026). Please review shipment readiness.",
  "H-2 message with PO numbers"
);

const h1 = buildEtaReminderMessage("SHP-001", po, "2026-06-27", "h1");
assert(
  h1 ===
    "Import SHP-001 (PO 1012014246, 1012014247): ETA tomorrow (27 June 2026). Please confirm arrival preparation.",
  "H-1 message with PO numbers"
);

assert(etaReminderNotificationType("h3") === "shipment_eta_h3", "H-3 notification type");
assert(etaReminderNotificationType("h2") === "shipment_eta_h2", "H-2 notification type");
assert(etaReminderNotificationType("h1") === "shipment_eta_h1", "H-1 notification type");
assert(etaReminderDaysAhead("h3") === 3, "H-3 days ahead");
assert(etaReminderDaysAhead("h2") === 2, "H-2 days ahead");
assert(etaReminderDaysAhead("h1") === 1, "H-1 days ahead");

assert(
  shouldRunEtaReminderNow(7, 0, new Date("2026-06-24T08:00:00+07:00"), null),
  "runs after 07:00 Jakarta when not yet run today"
);
assert(
  !shouldRunEtaReminderNow(7, 0, new Date("2026-06-24T06:30:00+07:00"), null),
  "does not run before 07:00 Jakarta"
);
assert(
  !shouldRunEtaReminderNow(7, 0, new Date("2026-06-24T08:00:00+07:00"), jakartaDateKey(new Date("2026-06-24T08:00:00+07:00"))),
  "does not run twice same Jakarta day"
);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
