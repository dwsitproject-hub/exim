/**
 * Export Bulking — status transition validation tests.
 * Run with: npx tsx backend/src/modules/export-bulking/__tests__/status-transitions.test.ts
 */

import { STATUS_TRANSITIONS, EXPORT_BULKING_STATUSES } from "../dto/index.js";
import type { ExportBulkingStatus } from "../dto/index.js";
import {
  getMissingRequirementsForAdvance,
  getMissingRequirementLabels,
} from "../utils/export-status-requirements.js";
import type { ExportBulkingForStatusValidation, SiForRequirements } from "../utils/export-status-requirements.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

function completeSi(overrides: Partial<SiForRequirements> = {}): SiForRequirements {
  return {
    messrs: "PT. Tirta Permai Bahari",
    bill_of_lading_option: "3 ORIGINAL & 3 NNBL AT LOADPORT",
    consignee: "ABC Trading Co.",
    notify_party: "Same as consignee",
    freight: "PREPAID",
    npwp: "01.234.567.8-901.000",
    bl_indicated: "TO ORDER",
    lines: [{ cargo_line_id: "cargo-1", bl_split_qty: 1000 }],
    ...overrides,
  };
}

function baseShipment(overrides: Partial<ExportBulkingForStatusValidation> = {}): ExportBulkingForStatusValidation {
  return {
    current_status: "SHIPMENT_PLANNING",
    loadport_name: "Taboneo",
    total_quantity: 1000,
    received_nomination: null,
    received_shipping_instruction: null,
    incoterms: null,
    laycan_from: null,
    laycan_to: null,
    est_cargo_readiness: null,
    est_cargo_readiness_period: null,
    eta: null,
    ata: null,
    etb: null,
    atb: null,
    commence_loading: null,
    etc: null,
    atc: null,
    td: null,
    laytime_rate_mtph: null,
    demurrage_rate_pdpr: null,
    cargo_count: 1,
    shipping_instructions: [],
    ...overrides,
  };
}

console.log("Export Bulking — Status transition tests\n");

assert(EXPORT_BULKING_STATUSES.length === 8, "8 statuses defined");
assert(EXPORT_BULKING_STATUSES[0] === "SHIPMENT_PLANNING", "first status is SHIPMENT_PLANNING");
assert(EXPORT_BULKING_STATUSES[7] === "CASE_OFF", "last status is CASE_OFF");

assert(STATUS_TRANSITIONS.SHIPMENT_PLANNING === "NOMINATION", "SHIPMENT_PLANNING -> NOMINATION");
assert(STATUS_TRANSITIONS.NOMINATION === "SI_RECEIVE", "NOMINATION -> SI_RECEIVE");
assert(STATUS_TRANSITIONS.SI_RECEIVE === "ARRIVAL", "SI_RECEIVE -> ARRIVAL");
assert(STATUS_TRANSITIONS.ARRIVAL === "AT_BERTH", "ARRIVAL -> AT_BERTH");
assert(STATUS_TRANSITIONS.AT_BERTH === "LOADING", "AT_BERTH -> LOADING");
assert(STATUS_TRANSITIONS.LOADING === "NPE", "LOADING -> NPE");
assert(STATUS_TRANSITIONS.NPE === "CASE_OFF", "NPE -> CASE_OFF");
assert(STATUS_TRANSITIONS.CASE_OFF === null, "CASE_OFF is terminal");

for (const status of EXPORT_BULKING_STATUSES) {
  assert(status in STATUS_TRANSITIONS, `STATUS_TRANSITIONS has entry for ${status}`);
}

const allowedTargets = Object.values(STATUS_TRANSITIONS).filter(Boolean) as ExportBulkingStatus[];
for (const target of allowedTargets) {
  const fromIdx = EXPORT_BULKING_STATUSES.indexOf(
    Object.keys(STATUS_TRANSITIONS).find((k) => STATUS_TRANSITIONS[k as ExportBulkingStatus] === target) as ExportBulkingStatus,
  );
  const toIdx = EXPORT_BULKING_STATUSES.indexOf(target);
  assert(toIdx > fromIdx, `transition to ${target} moves forward (${fromIdx} -> ${toIdx})`);
}

function validateTransition(current: string, next: string): boolean {
  const allowed = STATUS_TRANSITIONS[current as ExportBulkingStatus];
  return allowed === next;
}

assert(validateTransition("SHIPMENT_PLANNING", "NOMINATION") === true, "validate: SHIPMENT_PLANNING -> NOMINATION allowed");
assert(validateTransition("SHIPMENT_PLANNING", "SI_RECEIVE") === false, "validate: SHIPMENT_PLANNING -> SI_RECEIVE blocked");
assert(validateTransition("NOMINATION", "SHIPMENT_PLANNING") === false, "validate: backward NOMINATION -> SHIPMENT_PLANNING blocked");
assert(validateTransition("SI_RECEIVE", "ARRIVAL") === true, "validate: SI_RECEIVE -> ARRIVAL allowed");
assert(validateTransition("ARRIVAL", "AT_BERTH") === true, "validate: ARRIVAL -> AT_BERTH allowed");
assert(validateTransition("AT_BERTH", "LOADING") === true, "validate: AT_BERTH -> LOADING allowed");
assert(validateTransition("LOADING", "NPE") === true, "validate: LOADING -> NPE allowed");
assert(validateTransition("NPE", "CASE_OFF") === true, "validate: NPE -> CASE_OFF allowed");
assert(validateTransition("CASE_OFF", "NOMINATION") === false, "validate: CASE_OFF -> NOMINATION blocked");

console.log("\nAdvance requirements — SHIPMENT_PLANNING -> NOMINATION");

const planningMissing = getMissingRequirementsForAdvance(baseShipment());
assert(planningMissing.length === 0, "planning complete when load port, qty, cargo lines present");
assert(
  getMissingRequirementsForAdvance(baseShipment({ loadport_name: null })).includes("loadport_name"),
  "planning blocked without load port",
);
assert(
  getMissingRequirementsForAdvance(baseShipment({ total_quantity: null })).includes("total_quantity"),
  "planning blocked without total quantity",
);
assert(
  getMissingRequirementsForAdvance(
    baseShipment({
      total_quantity: null,
      cargo_lines: [{ id: "cargo-1", quantity: 5000 }],
    }),
  ).length === 0,
  "planning complete when total quantity comes from cargo line quantities",
);
assert(
  getMissingRequirementsForAdvance(baseShipment({ cargo_count: 0 })).includes("has_cargo_lines"),
  "planning blocked without cargo lines",
);
assert(
  planningMissing[0] === undefined || planningMissing.includes("total_quantity") === false,
  "planning requirement order starts with total quantity when missing",
);
assert(
  getMissingRequirementsForAdvance(baseShipment({ loadport_name: null, total_quantity: null }))[0] === "total_quantity",
  "planning missing fields ordered: total quantity before load port",
);

console.log("\nAdvance requirements — NOMINATION -> SI_RECEIVE");

const nominationReady = baseShipment({
  current_status: "NOMINATION",
  received_nomination: "2024-05-10",
  laycan_from: "2024-05-10",
  laycan_to: "2024-05-15",
  est_cargo_readiness: "2024-05-12",
  est_cargo_readiness_period: "AM",
  eta: "2024-05-20",
  laytime_rate_mtph: 5000,
  demurrage_rate_pdpr: 12000,
  incoterms: "FOB",
});

assert(getMissingRequirementsForAdvance(nominationReady).length === 0, "nomination complete with all required fields");
assert(
  getMissingRequirementsForAdvance(baseShipment({ current_status: "NOMINATION" })).includes("received_nomination"),
  "nomination blocked without received nomination",
);
assert(
  getMissingRequirementsForAdvance(baseShipment({
    current_status: "NOMINATION",
    received_nomination: "2024-05-10",
    laycan_from: "2024-05-15",
    laycan_to: "2024-05-20",
    est_cargo_readiness: "2024-05-12",
    eta: "2024-05-20",
    laytime_rate_mtph: 5000,
    demurrage_rate_pdpr: 12000,
  })).includes("incoterms"),
  "nomination blocked without incoterms",
);
assert(
  getMissingRequirementsForAdvance(baseShipment({
    current_status: "NOMINATION",
    received_nomination: "2024-05-10",
    laycan_from: "2024-05-10",
    laycan_to: "2024-05-15",
    est_cargo_readiness: "2024-05-12",
    eta: "2024-05-20",
    laytime_rate_mtph: 5000,
    demurrage_rate_pdpr: 12000,
    incoterms: "FOB",
  })).includes("est_cargo_readiness"),
  "nomination blocked without est cargo readiness (date or AM/PM)",
);
assert(
  getMissingRequirementsForAdvance(baseShipment({
    current_status: "NOMINATION",
    received_nomination: "2024-05-10",
    laycan_from: "2024-05-10",
  })).includes("laycan"),
  "nomination blocked without full laycan range",
);
assert(
  getMissingRequirementLabels(baseShipment({ current_status: "NOMINATION", received_nomination: "2024-05-10" })).some((l) => l.includes("Laycan")),
  "nomination labels include Laycan",
);

console.log("\nAdvance requirements — SI_RECEIVE -> ARRIVAL");

const siReady = baseShipment({
  current_status: "SI_RECEIVE",
  received_shipping_instruction: "2024-05-18",
  shipping_instructions: [completeSi()],
});

assert(getMissingRequirementsForAdvance(siReady).length === 0, "SI receive complete with all SI fields");
assert(
  getMissingRequirementsForAdvance(baseShipment({ current_status: "SI_RECEIVE" })).includes("received_shipping_instruction"),
  "SI receive blocked without received shipping instruction",
);
assert(
  getMissingRequirementsForAdvance(baseShipment({
    current_status: "SI_RECEIVE",
    received_shipping_instruction: "2024-05-18",
  })).includes("has_shipping_instructions"),
  "SI receive blocked without at least one SI",
);
assert(
  getMissingRequirementsForAdvance(baseShipment({
    current_status: "SI_RECEIVE",
    received_shipping_instruction: "2024-05-18",
    shipping_instructions: [completeSi({ messrs: null })],
  })).includes("si_messrs"),
  "SI receive blocked when Messrs missing",
);
assert(
  getMissingRequirementsForAdvance(baseShipment({
    current_status: "SI_RECEIVE",
    received_shipping_instruction: "2024-05-18",
    shipping_instructions: [completeSi({ lines: [] })],
  })).includes("si_cargo_lines"),
  "SI receive blocked when cargo lines / B/L split missing",
);

console.log("\nAdvance requirements — ARRIVAL -> AT_BERTH");
assert(
  getMissingRequirementsForAdvance(baseShipment({ current_status: "ARRIVAL" })).includes("ata"),
  "ARRIVAL blocked without ATA",
);
assert(
  getMissingRequirementsForAdvance(baseShipment({ current_status: "ARRIVAL", ata: "2024-05-21", etb: "2024-05-22" })).length === 0,
  "ARRIVAL complete with ATA and ETB",
);

console.log("\nAdvance requirements — AT_BERTH -> LOADING");
assert(
  getMissingRequirementsForAdvance(baseShipment({ current_status: "AT_BERTH" })).includes("atb"),
  "AT_BERTH blocked without ATB",
);
assert(
  getMissingRequirementsForAdvance(baseShipment({ current_status: "AT_BERTH", atb: "2024-05-23" })).length === 0,
  "AT_BERTH complete with ATB",
);

console.log("\nAdvance requirements — LOADING -> NPE");
assert(
  getMissingRequirementsForAdvance(baseShipment({ current_status: "LOADING" })).includes("commence_loading"),
  "LOADING blocked without commence_loading",
);
assert(
  getMissingRequirementsForAdvance(baseShipment({
    current_status: "LOADING",
    commence_loading: "2024-05-23T08:00:00Z",
    etc: "2024-05-24",
  })).length === 0,
  "LOADING complete with commence_loading and ETC",
);

console.log("\nAdvance requirements — NPE -> CASE_OFF");
assert(
  getMissingRequirementsForAdvance(baseShipment({ current_status: "NPE" })).includes("atc"),
  "NPE blocked without ATC",
);
assert(
  getMissingRequirementsForAdvance(baseShipment({ current_status: "NPE", atc: "2024-05-25" })).length === 0,
  "NPE complete with ATC",
);

console.log("\nCase Off completion requirements — CASE_OFF (terminal)");
assert(
  getMissingRequirementsForAdvance(baseShipment({ current_status: "CASE_OFF" })).includes("td"),
  "CASE_OFF blocked without TD",
);
assert(
  getMissingRequirementsForAdvance(baseShipment({ current_status: "CASE_OFF", td: "2024-05-26" })).length === 0,
  "CASE_OFF complete with TD",
);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
