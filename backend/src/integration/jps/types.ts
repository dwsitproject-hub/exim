/**
 * Jetty Planning System (JPS) partner API types.
 * See docs/INBOUND-SHIPPING-INSTRUCTION-PARTNER-API.md
 */

export type JpsPartnerStatus = "Pending" | "Approved" | "Rejected" | "Allocated";

export interface JpsCargoLine {
  cargo_type: string;
  description?: string;
  tonnage: number;
  unit: "MT" | "KL";
  contract_no?: string;
}

export interface JpsShippingInstructionPayload {
  external_reference: string;
  requested_by?: string;
  port_id: number;
  vessel_name: string;
  voyage_no?: string;
  purpose: "Loading" | "Unloading";
  eta: string;
  etd?: string;
  agent_name: string;
  notes?: string;
  cargo: JpsCargoLine[];
}

export interface JpsShippingInstructionData {
  id: number;
  external_reference: string;
  requested_by?: string | null;
  status: JpsPartnerStatus | string;
  vessel_name?: string | null;
  voyage_no?: string | null;
  purpose?: string | null;
  vessel_loa_m?: number | null;
  vessel_gross_tonnage?: number | null;
  vessel_draft?: number | null;
  vessel_capacity?: number | null;
  vessel_dwt?: number | null;
  eta?: string | null;
  etd?: string | null;
  port_id?: number | null;
  allocation?: {
    jetty_name?: string | null;
    planned_berthing_time?: string | null;
  } | null;
  rejection_reason?: string | null;
  submitted_at?: string | null;
  last_updated_at?: string | null;
  received_at?: string | null;
}

export interface JpsApiSuccess<T> {
  success: true;
  data: T;
}

export interface JpsApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  request_id?: string;
}

export type JpsApiResponse<T> = JpsApiSuccess<T> | JpsApiErrorBody;

export class JpsApiError extends Error {
  readonly httpStatus: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(args: {
    httpStatus: number;
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  }) {
    super(args.message);
    this.name = "JpsApiError";
    this.httpStatus = args.httpStatus;
    this.code = args.code;
    this.requestId = args.requestId;
    this.details = args.details;
  }
}
