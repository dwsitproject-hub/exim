import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePaymentRequestFromText } from "../utils/payment-request-pdf-parser.js";

const SAMPLE_HEADER = `
PAYMENT OF REQUEST - LEVY OR DUTY TAXES
PR01-SCG2-26-0000000031
Kurs IDR : 16,500
Duty US$ : 18.50
Levy US$ : 12.00
SO No
Qty (MT)
Billing Code Duty
Billing Code Levy
`.trim();

describe("parsePaymentRequestFromText", () => {
  it("extracts SO rows when PDF puts each table cell on its own line", () => {
    const text = [
      SAMPLE_HEADER,
      "1",
      "1641000071",
      "2,500.000",
      "123456789012345",
      "123456789012346",
      "2",
      "1641000072",
      "2,500.000",
      "123456789012347",
      "123456789012348",
      "Amount Duty : 100,000,000",
      "Amount Levy : 50,000,000",
    ].join("\n");

    const result = parsePaymentRequestFromText(text, { hintSos: ["1641000071", "1641000072"] });

    assert.equal(result.lines.length, 2);
    assert.deepEqual(
      result.lines.map((l) => l.so_no).sort(),
      ["1641000071", "1641000072"],
    );
    assert.equal(result.lines[0].billing_code_duty, "123456789012345");
    assert.equal(result.lines[0].billing_code_levy, "123456789012346");
    assert.equal(result.lines[0].qty_mt, 2500);
    assert.equal(result.lines[0].amount_duty_idr, Math.round(2500 * 18.5 * 16500));
    assert.equal(result.lines[0].amount_levy_idr, Math.round(2500 * 12 * 16500));
    assert.equal(result.confidence, "high");
  });

  it("extracts SO rows from same-line table layout", () => {
    const text = [
      SAMPLE_HEADER,
      "1 1641000071 2,500.000 123456789012345 123456789012346",
      "2 1641000072 2,500.000 123456789012347 123456789012348",
      "Amount Duty : 100,000,000",
      "Amount Levy : 50,000,000",
    ].join("\n");

    const result = parsePaymentRequestFromText(text);

    assert.equal(result.lines.length, 2);
    assert.deepEqual(
      result.lines.map((l) => l.so_no).sort(),
      ["1641000071", "1641000072"],
    );
  });

  it("uses hint SOs to recover rows when table headers are missing", () => {
    const text = [
      "PAYMENT OF REQUEST - LEVY OR DUTY TAXES",
      "Kurs IDR : 16,500",
      "Duty US$ : 18.50",
      "Levy US$ : 12.00",
      "1641000071",
      "123456789012345",
      "123456789012346",
      "Amount Duty : 50,000,000",
      "Amount Levy : 25,000,000",
    ].join("\n");

    const result = parsePaymentRequestFromText(text, { hintSos: ["1641000071"] });

    assert.equal(result.lines.length, 1);
    assert.equal(result.lines[0].so_no, "1641000071");
    assert.equal(result.lines[0].billing_code_duty, "123456789012345");
    assert.equal(result.lines[0].billing_code_levy, "123456789012346");
  });
});
