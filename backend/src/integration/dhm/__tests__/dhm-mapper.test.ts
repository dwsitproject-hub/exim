import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCompanyInboundPayload,
  mapCompanyRecord,
  mapExchangeRateRecord,
  mapPlantRecord,
  mapSiteRecord,
} from "../dhm-mapper.js";
import type { DhmRecordEnvelope } from "../types.js";

describe("dhm-mapper", () => {
  it("maps a company sync record to a local row using dhm_id / dhm_code", () => {
    const record: DhmRecordEnvelope = {
      id: "11111111-1111-1111-1111-111111111111",
      version: 3,
      isDeleted: false,
      data: { code: "ORG-0001", name: "Exim Operations Jakarta", country: "ID", is_active: true },
      updatedAt: "2026-10-01T00:00:00.000Z",
    };
    const row = mapCompanyRecord(record);
    assert.equal(row.dhm_id, record.id);
    assert.equal(row.dhm_code, "ORG-0001");
    assert.equal(row.name, "Exim Operations Jakarta");
    assert.equal(row.country, "ID");
    assert.equal(row.is_active, true);
    assert.equal(row.is_deleted, false);
    assert.equal(row.version, 3);
  });

  it("defaults is_active to true when omitted, and carries isDeleted/mergedInto through", () => {
    const record: DhmRecordEnvelope = {
      id: "22222222-2222-2222-2222-222222222222",
      version: 5,
      isDeleted: true,
      data: { code: "ORG-0002", name: "Old Co" },
      updatedAt: "2026-10-02T00:00:00.000Z",
      mergedInto: { id: "33333333-3333-3333-3333-333333333333", code: "ORG-0003" },
    };
    const row = mapCompanyRecord(record);
    assert.equal(row.is_active, true);
    assert.equal(row.is_deleted, true);
    assert.equal(row.merged_into_code, "ORG-0003");
  });

  it("maps a site sync record and keeps company_id as the DHM UUID", () => {
    const record: DhmRecordEnvelope = {
      id: "55555555-5555-5555-5555-555555555555",
      version: 1,
      isDeleted: false,
      data: {
        code: "SITE-0001",
        name: "Dumai Site",
        company_id: "11111111-1111-1111-1111-111111111111",
        address: "Jl. Pelabuhan",
      },
      updatedAt: "2026-10-03T00:00:00.000Z",
    };
    const row = mapSiteRecord(record);
    assert.equal(row.dhm_id, record.id);
    assert.equal(row.dhm_code, "SITE-0001");
    assert.equal(row.dhm_company_id, "11111111-1111-1111-1111-111111111111");
    assert.equal(row.name, "Dumai Site");
    assert.equal(row.address, "Jl. Pelabuhan");
  });

  it("maps a plant sync record and keeps site_id as the DHM UUID", () => {
    const record: DhmRecordEnvelope = {
      id: "66666666-6666-6666-6666-666666666666",
      version: 2,
      isDeleted: false,
      data: {
        code: "PLT-0001",
        name: "BONTANG",
        plant_code: "EU72",
        site_id: "55555555-5555-5555-5555-555555555555",
      },
      updatedAt: "2026-10-04T00:00:00.000Z",
    };
    const row = mapPlantRecord(record);
    assert.equal(row.dhm_id, record.id);
    assert.equal(row.dhm_code, "PLT-0001");
    assert.equal(row.dhm_site_id, "55555555-5555-5555-5555-555555555555");
    assert.equal(row.plant_code, "EU72");
    assert.equal(row.name, "BONTANG");
  });

  it("maps an exchange_rate sync record and uppercases currency codes", () => {
    const record: DhmRecordEnvelope = {
      id: "44444444-4444-4444-4444-444444444444",
      version: 1,
      isDeleted: false,
      data: {
        code: "FX-0001",
        name: "USD/IDR",
        from_currency: "usd",
        to_currency: "idr",
        rate: "16500.5",
        rate_date: "2026-10-01T00:00:00.000Z",
      },
      updatedAt: "2026-10-01T01:00:00.000Z",
    };
    const row = mapExchangeRateRecord(record);
    assert.equal(row.from_currency, "USD");
    assert.equal(row.to_currency, "IDR");
    assert.equal(row.rate, 16500.5);
    assert.equal(row.rate_date, "2026-10-01");
  });

  it("builds a create payload without code/system-generated fields", () => {
    const payload = buildCompanyInboundPayload({ name: "  Acme Co  ", country: "sg" });
    assert.deepEqual(payload, { name: "Acme Co", country: "sg" });
    assert.equal("code" in payload, false);
  });
});
