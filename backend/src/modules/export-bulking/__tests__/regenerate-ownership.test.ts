/**
 * Run with: npx tsx backend/src/modules/export-bulking/__tests__/regenerate-ownership.test.ts
 */

import assert from "node:assert/strict";
import { ExportBulkingService } from "../services/export-bulking.service.js";
import type { ExportBulkingRepository } from "../repositories/export-bulking.repository.js";
import { AppError } from "../../../middlewares/errorHandler.js";

let passed = 0;
let failed = 0;

function pass(label: string) {
  passed++;
  console.log(`  PASS: ${label}`);
}

function fail(label: string, err: unknown) {
  failed++;
  console.error(`  FAIL: ${label}`, err);
}

function makeRepo(overrides: Partial<ExportBulkingRepository>): ExportBulkingRepository {
  return {
    getShippingInstructionShipmentId: async () => "ship-a",
    getInvoiceHeader: async () => ({ shipment_id: "ship-a", shipping_instruction_id: null }),
    getPackingListShipmentId: async () => "ship-a",
    regenerateShippingInstructionNumber: async () => ({ id: "si-1" }),
    regenerateInvoiceNumber: async () => ({ id: "inv-1" }),
    regeneratePackingListNumber: async () => ({ id: "pl-1" }),
    ...overrides,
  } as unknown as ExportBulkingRepository;
}

async function testRegenerateSiCrossShipmentRejected() {
  const svc = new ExportBulkingService(makeRepo({}));
  try {
    await svc.regenerateShippingInstructionNumber("ship-b", "si-1", "user-1");
    fail("regenerate SI rejects cross-shipment", "expected throw");
  } catch (e) {
    assert.ok(e instanceof AppError);
    assert.equal(e.statusCode, 404);
    pass("regenerate SI rejects cross-shipment");
  }
}

async function testRegenerateInvoiceCrossShipmentRejected() {
  const svc = new ExportBulkingService(makeRepo({}));
  try {
    await svc.regenerateInvoiceNumber("ship-b", "inv-1", "user-1");
    fail("regenerate invoice rejects cross-shipment", "expected throw");
  } catch (e) {
    assert.ok(e instanceof AppError);
    assert.equal(e.statusCode, 404);
    pass("regenerate invoice rejects cross-shipment");
  }
}

async function testRegeneratePackingListCrossShipmentRejected() {
  const svc = new ExportBulkingService(makeRepo({}));
  try {
    await svc.regeneratePackingListNumber("ship-b", "pl-1", "user-1");
    fail("regenerate packing list rejects cross-shipment", "expected throw");
  } catch (e) {
    assert.ok(e instanceof AppError);
    assert.equal(e.statusCode, 404);
    pass("regenerate packing list rejects cross-shipment");
  }
}

async function testRegenerateSiSameShipmentAllowed() {
  const svc = new ExportBulkingService(makeRepo({}));
  const result = await svc.regenerateShippingInstructionNumber("ship-a", "si-1", "user-1");
  assert.equal((result as { id: string }).id, "si-1");
  pass("regenerate SI succeeds when shipment matches");
}

async function main() {
  console.log("Export Bulking — regenerate ownership checks\n");
  await testRegenerateSiCrossShipmentRejected();
  await testRegenerateInvoiceCrossShipmentRejected();
  await testRegeneratePackingListCrossShipmentRejected();
  await testRegenerateSiSameShipmentAllowed();
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
