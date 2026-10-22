import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ensureSynceraUnitRegistered,
  isPoItemUnitAllowed,
  isValidUnitCodeFormat,
  resetPoItemUnitRegistryForTests,
} from "../po-item-unit-registry.js";

describe("po-item-unit-registry", () => {
  it("accepts Syncera-style unit codes and adds them to the allow-list", async () => {
    resetPoItemUnitRegistryForTests();
    assert.equal(isValidUnitCodeFormat("M3"), true);
    assert.equal(isValidUnitCodeFormat("TUB"), true);
    assert.equal(isPoItemUnitAllowed("M3"), false);
    const ok = await ensureSynceraUnitRegistered("M3");
    assert.equal(ok, true);
    assert.equal(isPoItemUnitAllowed("M3"), true);
  });

  it("rejects invalid unit formats", async () => {
    resetPoItemUnitRegistryForTests();
    assert.equal(isValidUnitCodeFormat(""), false);
    assert.equal(isValidUnitCodeFormat("has space"), false);
    const ok = await ensureSynceraUnitRegistered("bad unit");
    assert.equal(ok, false);
  });
});
