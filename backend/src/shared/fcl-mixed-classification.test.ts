import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyFclShipment,
  fclComboKeySql,
  fclExclusiveSql,
  fclMixedSql,
  parseFclComboKey,
} from "./fcl-mixed-classification.js";
import { FCL_CONTAINER_REGISTRY } from "./fcl-container-registry.js";

describe("classifyFclShipment", () => {
  it("returns empty when no container types have qty", () => {
    assert.deepEqual(classifyFclShipment({ "20FT": 0, "40FT": 0 }), { kind: "empty" });
  });

  it("classifies a single type as exclusive", () => {
    assert.deepEqual(classifyFclShipment({ "20FT": 4, ISO: 0 }), {
      kind: "exclusive",
      slug: "20FT",
    });
  });

  it("classifies two or more types as mixed so the shipment is counted once", () => {
    assert.deepEqual(classifyFclShipment({ "20FT": 2, "40FT": 1, ISO: 0 }), {
      kind: "mixed",
      slugs: ["20FT", "40FT"],
    });
  });

  it("keeps mixed slugs in registry order", () => {
    const classified = classifyFclShipment({ ISO: 3, "40HC": 1, "20FT": 2 });
    assert.equal(classified.kind, "mixed");
    if (classified.kind === "mixed") {
      assert.deepEqual(classified.slugs, ["20FT", "ISO", "40HC"]);
    }
  });
});

describe("parseFclComboKey", () => {
  it("maps combo keys to registry labels", () => {
    assert.deepEqual(parseFclComboKey("20FT+ISO"), {
      slugs: ["20FT", "ISO"],
      labels: ["20′", "20′ ISO tank"],
    });
  });
});

describe("FCL mixed SQL fragments", () => {
  it("exclusive predicate requires only the named type", () => {
    const twenty = FCL_CONTAINER_REGISTRY.find((t) => t.slug === "20FT");
    assert.ok(twenty);
    const sql = fclExclusiveSql(twenty);
    assert.match(sql, /container_count_20ft/);
    assert.match(sql, /= 1\)/);
  });

  it("mixed predicate requires two or more types", () => {
    assert.match(fclMixedSql(), />= 2/);
  });

  it("combo key concatenates present slugs in registry order", () => {
    const sql = fclComboKeySql();
    const isoIdx = sql.indexOf("'ISO'");
    const twentyIdx = sql.indexOf("'20FT'");
    assert.ok(twentyIdx >= 0 && isoIdx > twentyIdx);
  });
});
