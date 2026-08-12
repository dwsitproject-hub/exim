import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ShipmentRow } from "../../modules/shipments/dto/index.js";
import { mapShipmentToJpsPayload } from "./jps-shipping-instruction-mapper.js";

function baseShipment(over: Partial<ShipmentRow> = {}): ShipmentRow {
  return {
    id: "s1",
    shipment_no: "SHP-2026-0001",
    vendor_code: null,
    vendor_name: null,
    forwarder_code: null,
    forwarder_name: null,
    warehouse_code: null,
    warehouse_name: null,
    incoterm: null,
    shipment_method: "Sea",
    origin_port_code: null,
    origin_port_name: null,
    origin_port_country: null,
    destination_port_code: null,
    destination_port_name: null,
    destination_port_country: null,
    etd: new Date("2026-07-01T00:00:00.000Z"),
    eta: new Date("2026-07-10T00:00:00.000Z"),
    atd: null,
    ata: null,
    depo: null,
    depo_location: null,
    current_status: "ON_SHIPMENT",
    closed_at: null,
    close_reason: null,
    remarks: "Note",
    created_at: new Date(),
    updated_at: new Date(),
    pib_type: null,
    no_request_pib: null,
    ppjk_mkl: null,
    nopen: null,
    nopen_date: null,
    ship_by: null,
    bl_awb: null,
    insurance_no: null,
    insurance_amount: null,
    coo: null,
    incoterm_amount: null,
    incoterm_currency: "USD",
    cbm: null,
    net_weight_mt: 1000,
    gross_weight_mt: null,
    bm: null,
    ppn_amount: null,
    pph_amount: null,
    kawasan_berikat: null,
    surveyor: null,
    product_classification: null,
    unit_20ft: false,
    unit_40ft: false,
    unit_package: false,
    unit_20_iso_tank: false,
    unit_40_hc: false,
    unit_20_fr: false,
    unit_40_fr: false,
    container_count_20ft: null,
    container_count_40ft: null,
    package_count: null,
    container_count_20_iso_tank: null,
    container_count_40_hc: null,
    container_count_20_fr: null,
    container_count_40_fr: null,
    deleted_at: null,
    deleted_by: null,
    vessel_name: "MV TEST",
    voyage_no: "V1",
    agent_name: "PT Agent",
    jps_si_id: null,
    jps_status: null,
    jps_external_reference: null,
    jps_submitted_at: null,
    jps_last_synced_at: null,
    jps_sync_dirty: false,
    jps_last_error: null,
    jps_rejection_reason: null,
    jps_jetty_name: null,
    jps_planned_berthing_time: null,
    ...over,
  };
}

describe("mapShipmentToJpsPayload", () => {
  it("maps Unloading purpose and MT cargo", () => {
    const payload = mapShipmentToJpsPayload({
      shipment: baseShipment(),
      requestedBy: "dev@example.com",
      contractNo: "PO-1",
      portId: 1,
      cargoType: "CPO",
    });
    assert.equal(payload.purpose, "Unloading");
    assert.equal(payload.vessel_name, "MV TEST");
    assert.equal(payload.agent_name, "PT Agent");
    assert.equal(payload.voyage_no, "V1");
    assert.equal(payload.external_reference, "SHP-2026-0001");
    assert.equal(payload.requested_by, "dev@example.com");
    assert.equal(payload.cargo.length, 1);
    assert.equal(payload.cargo[0]!.cargo_type, "CPO");
    assert.equal(payload.cargo[0]!.unit, "MT");
    assert.equal(payload.cargo[0]!.tonnage, 1000);
    assert.equal(payload.cargo[0]!.contract_no, "PO-1");
    // EOS eta-after-etd: do not send etd to JPS (JPS wants etd after eta)
    assert.equal(payload.etd, undefined);
  });
});
