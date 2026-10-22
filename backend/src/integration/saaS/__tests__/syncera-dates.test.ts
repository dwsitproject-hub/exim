import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { jakartaCalendarYyyymmdd, synceraDateWindow, yyyymmddAddDays } from "../syncera-dates.js";

describe("syncera-dates", () => {
  it("formats a known instant as Asia/Jakarta yyyymmdd", () => {
    // 2026-09-21 17:00 UTC+7 = 2026-09-21 10:00 UTC
    const d = new Date("2026-09-21T10:00:00.000Z");
    assert.equal(jakartaCalendarYyyymmdd(d), "20260921");
  });

  it("adds calendar days in UTC date space", () => {
    assert.equal(yyyymmddAddDays("20260301", -1), "20260228");
    assert.equal(yyyymmddAddDays("20260101", -14), "20251218");
  });

  it("builds a lookback window ending today Jakarta", () => {
    const { dateFrom, dateTo } = synceraDateWindow(14, new Date("2026-09-21T10:00:00.000Z"));
    assert.equal(dateTo, "20260921");
    assert.equal(dateFrom, "20260907");
  });
});
