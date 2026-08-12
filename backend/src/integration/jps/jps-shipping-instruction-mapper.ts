/**
 * Map EOS shipment → JPS Shipping Instruction POST payload.
 */

import { config } from "../../config/index.js";
import type { ShipmentRow } from "../../modules/shipments/dto/index.js";
import type { JpsShippingInstructionPayload } from "./types.js";

export interface MapShipmentToJpsArgs {
  shipment: ShipmentRow;
  requestedBy?: string | null;
  /** First linked PO number for cargo.contract_no */
  contractNo?: string | null;
  portId?: number;
  cargoType?: string;
  externalReference?: string;
}

function toIsoUtc(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function mapShipmentToJpsPayload(args: MapShipmentToJpsArgs): JpsShippingInstructionPayload {
  const { shipment } = args;
  const vesselName = (shipment.vessel_name ?? "").trim();
  const agentName = (shipment.agent_name ?? "").trim();
  const eta = toIsoUtc(shipment.eta);
  const etd = toIsoUtc(shipment.etd);
  const tonnage = shipment.net_weight_mt != null ? Number(shipment.net_weight_mt) : NaN;

  if (!vesselName) throw new Error("vessel_name is required for JPS payload");
  if (!agentName) throw new Error("agent_name is required for JPS payload");
  if (!eta) throw new Error("eta is required for JPS payload");
  if (!Number.isFinite(tonnage) || tonnage <= 0) {
    throw new Error("net_weight_mt must be > 0 for JPS payload");
  }

  const payload: JpsShippingInstructionPayload = {
    external_reference: (args.externalReference ?? shipment.shipment_no).trim(),
    port_id: args.portId ?? config.jps.portId,
    vessel_name: vesselName,
    purpose: "Unloading",
    eta,
    agent_name: agentName,
    cargo: [
      {
        cargo_type: (args.cargoType ?? config.jps.defaultCargoType).trim(),
        tonnage,
        unit: "MT",
        description: shipment.shipment_no,
        ...(args.contractNo?.trim()
          ? { contract_no: args.contractNo.trim() }
          : {}),
      },
    ],
  };

  const voyage = (shipment.voyage_no ?? "").trim();
  if (voyage) payload.voyage_no = voyage;

  const requestedBy = (args.requestedBy ?? "").trim();
  if (requestedBy) payload.requested_by = requestedBy;

  const notes = (shipment.remarks ?? "").trim();
  if (notes) payload.notes = notes.slice(0, 2000);

  // JPS requires etd after eta when provided. EOS enforces eta after etd (import), so omit etd.
  if (etd) {
    const etaMs = new Date(eta).getTime();
    const etdMs = new Date(etd).getTime();
    if (etdMs > etaMs) payload.etd = etd;
  }

  return payload;
}

/** Fields that, when changed, dirties an already-submitted JPS SI. */
export const JPS_MAPPED_SHIPMENT_FIELDS = [
  "vessel_name",
  "voyage_no",
  "agent_name",
  "eta",
  "etd",
  "remarks",
  "net_weight_mt",
] as const;

export type JpsMappedShipmentField = (typeof JPS_MAPPED_SHIPMENT_FIELDS)[number];

export function dtoTouchesJpsMappedFields(dto: Record<string, unknown>): boolean {
  return JPS_MAPPED_SHIPMENT_FIELDS.some((k) => dto[k] !== undefined);
}
