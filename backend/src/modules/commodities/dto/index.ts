export const COMMODITY_TYPES = ["Liquid", "Solid"] as const;

export type CommodityType = (typeof COMMODITY_TYPES)[number];

export interface CommodityRow {
  id: string;
  short_name: string;
  name: string;
  commodity_type: CommodityType;
  created_at: string;
  updated_at: string;
}

export interface CreateCommodityDto {
  short_name: string;
  name: string;
  commodity_type: CommodityType;
}

export interface UpdateCommodityDto {
  short_name: string;
  name: string;
  commodity_type: CommodityType;
}

export interface ListCommoditiesQuery {
  search?: string;
}
