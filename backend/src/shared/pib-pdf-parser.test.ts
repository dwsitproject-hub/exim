/**
 * PIB PDF extraction tests against BC 2.0 / 2.3 LCL/FCL fixtures.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "path";
import { parsePibPdf } from "./pib-pdf-parser.js";
import { comparePibOcrToShipment } from "../modules/shipments/services/pib-ocr-verify.service.js";
import type { ShipmentRow } from "../modules/shipments/dto/index.js";

const FIX = join(__dirname, "..", "modules", "shipments", "__tests__", "fixtures", "pib");

describe("parsePibPdf fixtures", () => {
  it("extracts BC 2.0 LCL header fields", async () => {
    const r = await parsePibPdf(join(FIX, "PIB_BC_20_LCL.pdf"));
    assert.equal(r.form_type, "BC_20");
    assert.equal(r.no_request_pib, "000020ENA50420260204100390");
    assert.equal(r.origin_port_code, "CNSHA");
    assert.equal(r.destination_port_code, "IDTPP");
    assert.equal(r.bl_awb, "TL26010411");
    assert.equal(r.invoice_no, "YD-1002035826&1002035827");
    assert.ok(r.currency_rate != null && Math.abs(r.currency_rate - 2415.4) < 0.01);
    assert.equal(r.freight, 0);
    assert.equal(r.insurance_amount, 0);
    assert.ok(r.net_weight_kg != null && Math.abs(r.net_weight_kg - 5.8) < 0.01);
    assert.ok(r.gross_weight_kg != null && Math.abs(r.gross_weight_kg - 7) < 0.01);
    assert.equal(r.bm_total, 0);
    assert.equal(r.ppn_total, 1841790);
    assert.equal(r.pph_total, 418550);
  });

  it("extracts BC 2.0 FCL header fields", async () => {
    const r = await parsePibPdf(join(FIX, "PIB_BC_20_FCL.pdf"));
    assert.equal(r.form_type, "BC_20");
    assert.equal(r.origin_port_code, "CNDLC");
    assert.equal(r.bl_awb, "OOLU2332291310");
    assert.equal(r.invoice_no, "126297");
    assert.ok(r.net_weight_kg != null && Math.abs(r.net_weight_kg - 42840) < 0.1);
  });

  it("extracts BC 2.3 LCL header fields", async () => {
    const r = await parsePibPdf(join(FIX, "PIB_BC_23_LCL.pdf"));
    assert.equal(r.form_type, "BC_23");
    assert.equal(r.no_request_pib, "000023ENA50420260713000084");
    assert.equal(r.origin_port_code, "USDTW");
    assert.equal(r.destination_port_code, "IDCGK");
    assert.equal(r.bl_awb, "1368549836");
    assert.equal(r.invoice_no, "19432");
    assert.equal(r.freight, 529);
    assert.equal(r.insurance_amount, 73);
    assert.equal(r.ppn_total, 30109000);
    assert.equal(r.pph_total, 6843000);
  });

  it("extracts BC 2.3 FCL header fields", async () => {
    const r = await parsePibPdf(join(FIX, "PIB_BC_23_FCL.pdf"));
    assert.equal(r.form_type, "BC_23");
    assert.equal(r.origin_port_code, "CNLYG");
    assert.equal(r.bl_awb, "LDLYGJK0103");
    assert.equal(r.invoice_no, "SUZ26HG09067-1");
    assert.equal(r.ppn_total, 201994000);
    assert.equal(r.pph_total, 45908000);
  });

  it("soft-compares without blocking on mismatches", async () => {
    const r = await parsePibPdf(join(FIX, "PIB_BC_20_LCL.pdf"));
    const shipment = {
      origin_port_name: "Wrong Port",
      origin_port_code: "XXXXX",
      destination_port_name: "TANJUNG PRIOK",
      destination_port_code: "IDTPP",
      no_request_pib: "DIFFERENT",
      bl_awb: "TL26010411",
      incoterm_amount: 0,
      insurance_amount: 0,
      net_weight_mt: 0.0058,
      gross_weight_mt: 0.007,
      bm: 0,
      ppn_amount: 1841790,
      pph_amount: 418550,
    } as unknown as ShipmentRow;

    const warnings = comparePibOcrToShipment(r, {
      shipment,
      invoiceNos: ["YD-1002035826", "1002035827"],
      currencyRates: [2415.4],
    });
    assert.ok(warnings.some((w) => w.field === "origin_port" && w.severity === "mismatch"));
    assert.ok(warnings.some((w) => w.field === "no_request_pib" && w.severity === "mismatch"));
    assert.ok(!warnings.some((w) => w.field === "bl_awb" && w.severity === "mismatch"));
  });
});
