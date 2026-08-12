# Jetty Planning System (JPS) — EOS integration

EOS submits import Shipping Instructions to JPS when Sea shipment minimum fields are present, then polls partner status.

Partner contract: [INBOUND-SHIPPING-INSTRUCTION-PARTNER-API.md](./INBOUND-SHIPPING-INSTRUCTION-PARTNER-API.md).

## Behaviour (Phase 1)

1. On shipment create/update, if `shipment_method` is Sea and `vessel_name`, `agent_name`, `eta`, and `net_weight_mt` (> 0) are set, EOS POSTs to JPS.
2. `purpose` is always `Unloading`. Cargo is one line: env `JPS_DEFAULT_CARGO_TYPE` + `net_weight_mt` as `MT`.
3. `port_id` is interim env `JPS_PORT_ID` (staging `1`).
4. After first submit, further mapped-field edits set `jps_sync_dirty`. Partner API v1 has **no update endpoint** — dirty stays until JPS ships PUT/PATCH and `JPS_UPDATE_API_ENABLED=true`.
5. Poller (≥5 min) refreshes `Pending` / `Approved` rows until `Rejected` or `Allocated`.

## Environment

| Variable | Purpose |
|----------|---------|
| `JPS_SYNC_ENABLED` | Master switch (`true` to enable sync + poller) |
| `JPS_API_BASE_URL` | e.g. `http://172.28.92.56:3080/api/v1/integrations` |
| `JPS_API_KEY` | Partner key (server-side only) |
| `JPS_PORT_ID` | Interim port id (staging `1`) |
| `JPS_DEFAULT_CARGO_TYPE` | Interim commodity short name (e.g. `CPO`) |
| `JPS_POLL_INTERVAL_MS` | Min 300000 (5 minutes) |
| `JPS_UPDATE_API_ENABLED` | Enable when JPS publishes SI update API |

## Open dependencies on JPS team

Track with JPS before production go-live:

1. **Update Shipping Instruction API** (`PUT`/`PATCH`) — required so dirty field updates can sync without a new `external_reference`.
2. **Master Port list API** — replace hard-coded `JPS_PORT_ID` with destination-port → `port_id` mapping.
3. **Master Commodity list API** — replace `JPS_DEFAULT_CARGO_TYPE` with real EOS commodity mapping.

## Code map

| Area | Path |
|------|------|
| Client / mapper / sync | `backend/src/integration/jps/` |
| Status poller | `backend/src/integration/jobs/jps-status-poller-job.ts` |
| Migration | `backend/src/db/migrations/090_shipment_jps_integration.sql` |
| Hook | `ShipmentService.update` / `create` → `getJpsSyncService().syncAfterShipmentSave` |
