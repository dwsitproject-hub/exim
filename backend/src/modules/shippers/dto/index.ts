export interface ShipperRow {
  id: string;
  entity_name: string;
  short_name: string;
  /** Legacy column; kept in sync with short_name. */
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ShipperPlantRow {
  id: string;
  shipper_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ShipperLoadportRow {
  id: string;
  shipper_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ShipperMasterRow extends ShipperRow {
  plants: string[];
  loadports: string[];
}

export interface CreateShipperDto {
  entity_name: string;
  short_name: string;
}

export interface UpdateShipperDto {
  entity_name: string;
  short_name: string;
}

export interface CreateShipperPlantDto {
  name: string;
}

export interface UpdateShipperPlantDto {
  name: string;
}

export interface CreateShipperLoadportDto {
  name: string;
}

export interface UpdateShipperLoadportDto {
  name: string;
}

export interface ListShippersQuery {
  search?: string;
}
