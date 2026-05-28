export type TransportTab = "AIR" | "LCL" | "FCL" | "BULK";

/** FCL sub-filter (container family). */
export type FclSubType = "20" | "40" | "ISO";

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
