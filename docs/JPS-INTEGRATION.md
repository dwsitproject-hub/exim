# Jetty Planning System (JPS) — EOS integration

EOS submits import Shipping Instructions to JPS. Partner contract: [INBOUND-SHIPPING-INSTRUCTION-PARTNER-API.md](./INBOUND-SHIPPING-INSTRUCTION-PARTNER-API.md) (v3.6+).

## Behaviour (MVP Phase A)

Jetty is **not** for every import Sea shipment. Eligibility is destination-driven:

1. Ops pick **unload / destination port** from master plant unload ports only (Admin → Shippers → Plants). No free-text discharge port.
2. If method is **Sea** and that unload port has a Jetty link (`jps_port_id`), the Jetty panel appears (vessel, agent, commodity, Review & send).
3. If the unload port has no Jetty link (or method is not Sea), Jetty UI/sync is hidden.
4. `jps_port_id` on the shipment is **derived** from the selected unload port — there is no separate Jetty port picker.
5. **Review & send to Jetty** opens a preview, then explicit `POST` (first send).
6. Later edits to mapped fields while status is **Pending** auto-`PATCH`.
7. Poller (≥5 min) refreshes status until `Rejected` or `Allocated`.
8. `purpose` is always `Unloading`. Cargo is one line: selected `jps_cargo_type` + `net_weight_mt` as `MT`.

`destination_port_name` is filled from the master unload port for customs/ops displays; JPS `port_id` comes from the unload port’s Jetty link.

## Environment

| Variable | Purpose |
|----------|---------|
| `JPS_SYNC_ENABLED` | Master switch (`true` to enable sync + poller + master APIs) |
| `JPS_API_BASE_URL` | e.g. `http://172.28.92.56:3080/api/v1/integrations` |
| `JPS_API_KEY` | Partner key (server-side only) |
| `JPS_POLL_INTERVAL_MS` | Min 300000 (5 minutes) |
| `JPS_REQUEST_TIMEOUT_MS` | Outbound timeout (default 30000) |
| `JPS_MASTER_CACHE_TTL_MS` | Ports/commodities cache TTL (default 15 min) |

## EOS API (for UI)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/shippers/unload-ports` | All master unload ports (destination picker) |
| `GET` | `/api/v1/shipments/jps/ports` | Cached JPS ports (`?refresh=1` to force) |
| `GET` | `/api/v1/shipments/jps/commodities` | Cached JPS commodities |
| `GET` | `/api/v1/shipments/:id/jps/preview` | Payload preview for confirm modal |
| `POST` | `/api/v1/shipments/:id/jps/sync` | Explicit send / Pending update |

Shipment fields: `destination_unload_port_id`, derived `jps_port_id`, `jps_cargo_type` (plus vessel/voyage/agent/sync bookkeeping).

## Admin: unload ports (destination master → optional Jetty)

1. **Admin → Shippers** → expand entity → **Plants & unload ports**.
2. Under each plant, register unload / discharge ports (this is the import destination master).
3. Optionally connect an unload port to a **Jetty port** (`GET /ports`).
4. Import shipment destination picker shows `name · shipper/plant` and marks Jetty-linked options with `· Jetty`.

| Storage | Column |
|---------|--------|
| `shipper_plant_unload_ports` | Master unload ports per plant |
| `shipper_plant_unload_ports.jps_port_id` | Optional JPS partner port id |
| `shipments.destination_unload_port_id` | FK to chosen unload port |
| API list for picker | `GET /api/v1/shippers/unload-ports` |

### Commodities (Admin → Commodity)

1. Open **Admin → Commodity**.
2. For each EOS commodity, choose **Jetty commodity** from the live JPS list (`GET /commodities`).
3. Linked commodities appear first on import shipment **Cargo for Jetty** picker as  
   `EOS short · name → JPS short — name (type)`.
4. Clear the Jetty dropdown to disconnect (also editable in the Add/Edit modal).

| Storage | Column |
|---------|--------|
| `master_commodities.jps_short_name` | JPS partner commodity `short_name` |
| API list for picker | `GET /api/v1/commodities/jps-mapped` |

## Later phases

1. Auto-suggest unload port from PO plant.
2. Optionally require Jetty commodity from mapped-only list on first send.

## Code map

| Area | Path |
|------|------|
| Client / mapper / sync / cache | `backend/src/integration/jps/` |
| Status poller | `backend/src/integration/jobs/jps-status-poller-job.ts` |
| Migrations | `108`–`113` (shipment JPS, commodity map, plant unload ports, destination FK) |
| Controllers | `backend/src/modules/shipments/controllers/shipment-jps.controller.ts` |
| Commodity mapping | `backend/src/modules/commodities/` |
| Unload ports | `shipper_plant_unload_ports` via `backend/src/modules/shippers/` |
| UI | `frontEnd/app/import/shipments/[id]/ShipmentDetail.tsx`, Admin Shippers / Commodities |
