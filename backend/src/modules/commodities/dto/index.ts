export const COMMODITY_TYPES = ["Liquid", "Solid"] as const;

export type CommodityType = (typeof COMMODITY_TYPES)[number];

export interface CommodityRow {
  id: string;
  short_name: string;
  name: string;
  commodity_type: CommodityType;
  /** JPS partner short_name when linked for Jetty SI. */
  jps_short_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommodityJpsMappedRow {
  id: string;
  short_name: string;
  name: string;
  commodity_type: CommodityType;
  jps_short_name: string;
}

export interface CreateCommodityDto {
  short_name: string;
  name: string;
  commodity_type: CommodityType;
  jps_short_name?: string | null;
}

export interface UpdateCommodityDto {
  short_name?: string;
  name?: string;
  commodity_type?: CommodityType;
  /** Set to connect this EOS commodity to a JPS short_name; null clears the link. */
  jps_short_name?: string | null;
}

export interface ListCommoditiesQuery {
  search?: string;
}
