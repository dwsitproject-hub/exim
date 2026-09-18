import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePoolSslOptions, sslModeFromUrl } from "../pool-ssl.js";

describe("pool SSL", () => {
  it("reads sslmode from a postgres URL", () => {
    assert.equal(
      sslModeFromUrl("postgres://u:p@host:5432/db?sslmode=require"),
      "require"
    );
  });

  it("leaves local Docker URLs unencrypted", () => {
    assert.equal(
      resolvePoolSslOptions({
        url: "postgres://eos:eos@localhost:5433/eos_db",
        sslRejectUnauthorized: false,
      }),
      false
    );
  });

  it("enables TLS when sslmode=require", () => {
    assert.deepEqual(
      resolvePoolSslOptions({
        url: "postgres://u:p@rm.example:5432/eos_staging?sslmode=require",
        sslRejectUnauthorized: false,
      }),
      { rejectUnauthorized: false }
    );
  });

  it("DATABASE_SSL=false wins over sslmode", () => {
    assert.equal(
      resolvePoolSslOptions({
        url: "postgres://u:p@host:5432/db?sslmode=require",
        ssl: false,
        sslRejectUnauthorized: false,
      }),
      false
    );
  });

  it("DATABASE_SSL=true enables TLS without sslmode", () => {
    assert.deepEqual(
      resolvePoolSslOptions({
        url: "postgres://u:p@host:5432/db",
        ssl: true,
        sslRejectUnauthorized: false,
      }),
      { rejectUnauthorized: false }
    );
  });

  it("verify-full verifies the certificate", () => {
    assert.deepEqual(
      resolvePoolSslOptions({
        url: "postgres://u:p@host:5432/db?sslmode=verify-full",
        sslRejectUnauthorized: false,
      }),
      { rejectUnauthorized: true }
    );
  });
});
