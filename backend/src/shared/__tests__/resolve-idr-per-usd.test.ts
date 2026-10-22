import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DhmSyncRepository } from "../../integration/dhm/dhm-sync.repository.js";
import { resolveIdrPerUsd } from "../resolve-idr-per-usd.js";

describe("resolveIdrPerUsd", () => {
  it("uses DHM master USD→IDR rate when present", async () => {
    const repo = {
      findLatestExchangeRate: async () => ({
        id: "x",
        code: "FX-1",
        name: "USD/IDR",
        from_currency: "USD",
        to_currency: "IDR",
        rate: 16250,
        rate_date: "2026-09-30",
        from_decimals: 2,
        to_decimals: 0,
        coupa_id: null,
        coupa_updated_at: null,
        is_active: true,
        version: 1,
        is_deleted: false,
        raw_data: {},
        dhm_updated_at: new Date(),
      }),
    } as unknown as DhmSyncRepository;

    const resolved = await resolveIdrPerUsd("2026-10-15", repo);
    assert.equal(resolved.source, "master");
    assert.equal(resolved.idr_per_usd, 16250);
    assert.equal(resolved.exchange_rate_date, "2026-09-30");
  });

  it("falls back to env default when master has no rate", async () => {
    const repo = {
      findLatestExchangeRate: async () => null,
    } as unknown as DhmSyncRepository;

    const resolved = await resolveIdrPerUsd("2026-10-15", repo);
    assert.equal(resolved.source, "fallback");
    assert.equal(resolved.exchange_rate_date, null);
    assert.ok(resolved.idr_per_usd > 0);
  });
});
