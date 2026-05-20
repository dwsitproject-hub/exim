export interface ShipperRow {
  id: string;
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

export interface CreateShipperDto {
  name: string;
}

export interface UpdateShipperDto {
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
