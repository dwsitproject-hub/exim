export interface ShipperRow {
  id: string;
  entity_name: string;
  short_name: string;
  /** Legacy column; kept in sync with short_name. */
  name: string;
  has_document_header: boolean;
  document_header_file_name: string | null;
  document_header_mime_type: string | null;
  npwp: string | null;
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

export interface ShipperPlantUnloadPortRow {
  id: string;
  plant_id: string;
  name: string;
  /** JPS partner port id when linked for Jetty SI. */
  jps_port_id: number | null;
  created_at: string;
  updated_at: string;
}

/** Flattened plant unload port with shipper/plant context (destination master / Jetty). */
export interface ShipperPlantUnloadPortListRow {
  id: string;
  plant_id: string;
  plant_name: string;
  shipper_id: string;
  shipper_short_name: string;
  name: string;
  jps_port_id: number | null;
}

/** Jetty-linked subset of unload ports. */
export interface ShipperPlantUnloadPortJpsMappedRow {
  id: string;
  plant_id: string;
  plant_name: string;
  shipper_id: string;
  shipper_short_name: string;
  name: string;
  jps_port_id: number;
}

export interface ShipperLoadportRow {
  id: string;
  shipper_id: string;
  name: string;
  /** JPS partner port id when linked for Jetty SI. */
  jps_port_id: number | null;
  created_at: string;
  updated_at: string;
}

/** Flattened EOS load port with shipper context for Jetty port picker (legacy). */
export interface ShipperLoadportJpsMappedRow {
  id: string;
  shipper_id: string;
  shipper_short_name: string;
  name: string;
  jps_port_id: number;
}

export interface ShipperMasterRow extends ShipperRow {
  plants: string[];
  loadports: string[];
}

export interface CreateShipperDto {
  entity_name: string;
  short_name: string;
  npwp?: string | null;
}

export interface UpdateShipperDto {
  entity_name: string;
  short_name: string;
  npwp?: string | null;
}

export interface CreateShipperPlantDto {
  name: string;
}

export interface UpdateShipperPlantDto {
  name: string;
}

export interface CreateShipperPlantUnloadPortDto {
  name: string;
  jps_port_id?: number | null;
}

export interface UpdateShipperPlantUnloadPortDto {
  name?: string;
  /** Set to connect this unload port to a JPS port; null clears the link. */
  jps_port_id?: number | null;
}

export interface CreateShipperLoadportDto {
  name: string;
}

export interface UpdateShipperLoadportDto {
  name?: string;
  /** Set to connect this EOS port to a JPS port; null clears the link. */
  jps_port_id?: number | null;
}

export interface ListShippersQuery {
  search?: string;
}
