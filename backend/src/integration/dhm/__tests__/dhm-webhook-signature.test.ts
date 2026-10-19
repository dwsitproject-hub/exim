import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "crypto";
import { verifyDhmWebhookSignature } from "../dhm-webhook.service.js";

const SECRET = "test-secret";

function sign(rawBody: string, t: number): string {
  const hex = createHmac("sha256", SECRET).update(`${t}.${rawBody}`).digest("hex");
  return `t=${t},v1=${hex}`;
}

describe("verifyDhmWebhookSignature", () => {
  it("accepts a correctly signed, fresh payload", () => {
    const rawBody = JSON.stringify({ event: "record.updated" });
    const now = 1_760_000_000_000;
    const header = sign(rawBody, Math.floor(now / 1000));
    const result = verifyDhmWebhookSignature({
      rawBody: Buffer.from(rawBody),
      signatureHeader: header,
      secret: SECRET,
      toleranceSeconds: 300,
      now,
    });
    assert.equal(result.ok, true);
  });

  it("rejects a tampered body", () => {
    const rawBody = JSON.stringify({ event: "record.updated" });
    const now = 1_760_000_000_000;
    const header = sign(rawBody, Math.floor(now / 1000));
    const result = verifyDhmWebhookSignature({
      rawBody: Buffer.from(rawBody + "x"),
      signatureHeader: header,
      secret: SECRET,
      toleranceSeconds: 300,
      now,
    });
    assert.equal(result.ok, false);
  });

  it("rejects a stale timestamp (replay protection)", () => {
    const rawBody = JSON.stringify({ event: "record.updated" });
    const now = 1_760_000_000_000;
    const oldT = Math.floor(now / 1000) - 600; // 10 minutes ago
    const header = sign(rawBody, oldT);
    const result = verifyDhmWebhookSignature({
      rawBody: Buffer.from(rawBody),
      signatureHeader: header,
      secret: SECRET,
      toleranceSeconds: 300,
      now,
    });
    assert.equal(result.ok, false);
  });

  it("rejects when the secret is not configured", () => {
    const rawBody = JSON.stringify({ event: "record.updated" });
    const header = sign(rawBody, Math.floor(Date.now() / 1000));
    const result = verifyDhmWebhookSignature({
      rawBody: Buffer.from(rawBody),
      signatureHeader: header,
      secret: "",
      toleranceSeconds: 300,
    });
    assert.equal(result.ok, false);
  });

  it("rejects a missing signature header", () => {
    const result = verifyDhmWebhookSignature({
      rawBody: Buffer.from("{}"),
      signatureHeader: undefined,
      secret: SECRET,
      toleranceSeconds: 300,
    });
    assert.equal(result.ok, false);
  });
});
