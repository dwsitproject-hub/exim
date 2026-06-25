export type TransportTab = "AIR" | "LCL" | "FCL" | "BULK";

/**
 * FCL sub-filter key.  Matches the `slug` values from the backend FCL_CONTAINER_REGISTRY
 * (e.g. "20FT", "40FT", "ISO", "40HC", "20FR", "40FR").  Kept as `string` so new container
 * types registered on the backend flow through without any frontend code changes.
 */
export type FclSubType = string;

export interface AirLogisticsRow {
  transportMode: "AIR";
  ptPlant: string;
  itemDescription: string;
  shipmentCount: number;
  forwarder: string;
}

export interface LclLogisticsRow {
  transportMode: "LCL";
  ptPlant: string;
  itemDescription: string;
  packages: number;
  packageKind: string;
  cbm: number | null;
  forwarder: string;
}

export interface FclLogisticsRow {
  transportMode: "FCL";
  fclSubType: FclSubType;
  ptPlant: string;
  itemDescription: string;
  containerCount: number;
  containerSpec: string;
  forwarder: string;
}

export interface BulkLogisticsRow {
  transportMode: "BULK";
  ptPlant: string;
  itemDescription: string;
  volumeMt: number | null;
  cbm: number | null;
  forwarder: string;
}

export type LogisticsDetailSourceRow =
  | AirLogisticsRow
  | LclLogisticsRow
  | FclLogisticsRow
  | BulkLogisticsRow;

/** Grouped row for rendering / CSV (single line per PT–Plant + item). */
export type GroupedAirRow = {
  ptPlant: string;
  itemDescription: string;
  shipmentCount: number;
  forwarder: string;
};

export type GroupedLclRow = {
  ptPlant: string;
  itemDescription: string;
  packageDisplay: string;
  cbmDisplay: string;
  forwarder: string;
};

export type GroupedFclRow = {
  ptPlant: string;
  itemDescription: string;
  containerDisplay: string;
  forwarder: string;
};

export type GroupedBulkRow = {
  ptPlant: string;
  itemDescription: string;
  volumeWeightDisplay: string;
  forwarder: string;
};
