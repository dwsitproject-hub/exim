/**
 * Map EOS shipment → JPS Shipping Instruction POST/PATCH payload.
 */

import type { ShipmentRow } from "../../modules/shipments/dto/index.js";
import type {
  JpsShippingInstructionPatchPayload,
  JpsShippingInstructionPayload,
} from "./types.js";

export interface MapShipmentToJpsArgs {
  shipment: ShipmentRow;
  requestedBy?: string | null;
  /** First linked PO number for cargo.contract_no */
  contractNo?: string | null;
  externalReference?: string;
}

function toIsoUtc(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function resolvePortAndCargo(shipment: ShipmentRow): { portId: number; cargoType: string } {
  const portId =
    shipment.jps_port_id != null && Number.isFinite(Number(shipment.jps_port_id))
      ? Number(shipment.jps_port_id)
      : NaN;
  const cargoType = (shipment.jps_cargo_type ?? "").trim();
  if (!Number.isFinite(portId) || portId <= 0) {
    throw new Error("jps_port_id is required for JPS payload");
  }
  if (!cargoType) {
    throw new Error("jps_cargo_type is required for JPS payload");
  }
  return { portId, cargoType };
}

export function mapShipmentToJpsPayload(args: MapShipmentToJpsArgs): JpsShippingInstructionPayload {
  const { shipment } = args;
  const vesselName = (shipment.vessel_name ?? "").trim();
  const agentName = (shipment.agent_name ?? "").trim();
  const eta = toIsoUtc(shipment.eta);
  const etd = toIsoUtc(shipment.etd);
  const tonnage = shipment.net_weight_mt != null ? Number(shipment.net_weight_mt) : NaN;
  const { portId, cargoType } = resolvePortAndCargo(shipment);

  if (!vesselName) throw new Error("vessel_name is required for JPS payload");
  if (!agentName) throw new Error("agent_name is required for JPS payload");
  if (!eta) throw new Error("eta is required for JPS payload");
  if (!Number.isFinite(tonnage) || tonnage <= 0) {
    throw new Error("net_weight_mt must be > 0 for JPS payload");
  }

  const payload: JpsShippingInstructionPayload = {
    external_reference: (args.externalReference ?? shipment.shipment_no).trim(),
    port_id: portId,
    vessel_name: vesselName,
    purpose: "Unloading",
    eta,
    agent_name: agentName,
    cargo: [
      {
        cargo_type: cargoType,
        tonnage,
        unit: "MT",
        description: shipment.shipment_no,
        ...(args.contractNo?.trim() ? { contract_no: args.contractNo.trim() } : {}),
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

export function mapShipmentToJpsPatchPayload(
  args: MapShipmentToJpsArgs
): JpsShippingInstructionPatchPayload {
  const { external_reference: _ref, ...rest } = mapShipmentToJpsPayload(args);
  void _ref;
  return rest;
}

/** Human-readable preview for first-send confirmation UI. */
export function buildJpsSyncPreview(args: MapShipmentToJpsArgs): {
  external_reference: string;
  purpose: "Unloading";
  vessel_name: string;
  voyage_no: string | null;
  agent_name: string;
  eta: string;
  port_id: number;
  cargo_type: string;
  tonnage: number;
  unit: "MT";
  contract_no: string | null;
  notes: string | null;
  already_submitted: boolean;
  jps_si_id: number | null;
  jps_status: string | null;
} {
  const payload = mapShipmentToJpsPayload(args);
  return {
    external_reference: payload.external_reference,
    purpose: "Unloading",
    vessel_name: payload.vessel_name,
    voyage_no: payload.voyage_no ?? null,
    agent_name: payload.agent_name,
    eta: payload.eta,
    port_id: payload.port_id,
    cargo_type: payload.cargo[0]!.cargo_type,
    tonnage: payload.cargo[0]!.tonnage,
    unit: "MT",
    contract_no: payload.cargo[0]!.contract_no ?? null,
    notes: payload.notes ?? null,
    already_submitted: args.shipment.jps_si_id != null,
    jps_si_id: args.shipment.jps_si_id,
    jps_status: args.shipment.jps_status,
  };
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
  "jps_port_id",
  "jps_cargo_type",
  "destination_unload_port_id",
] as const;

export type JpsMappedShipmentField = (typeof JPS_MAPPED_SHIPMENT_FIELDS)[number];

export function dtoTouchesJpsMappedFields(dto: Record<string, unknown>): boolean {
  return JPS_MAPPED_SHIPMENT_FIELDS.some((k) => dto[k] !== undefined);
}
