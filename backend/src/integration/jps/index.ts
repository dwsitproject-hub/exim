export { JpsApiClient } from "./jps-api-client.js";
export {
  mapShipmentToJpsPayload,
  dtoTouchesJpsMappedFields,
  JPS_MAPPED_SHIPMENT_FIELDS,
} from "./jps-shipping-instruction-mapper.js";
export {
  JpsSyncService,
  getJpsSyncService,
  isJpsEligible,
  isJpsConfigReady,
} from "./jps-sync.service.js";
export { JpsApiError } from "./types.js";
export type {
  JpsShippingInstructionPayload,
  JpsShippingInstructionData,
  JpsPartnerStatus,
} from "./types.js";
