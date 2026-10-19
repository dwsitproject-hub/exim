# DHM (Data Hub Management) Integration

EOS consumes DHM master-data for **internal company** (PT), **site** (Plant dropdown),
**plant** (SAP code join for Syncera), and **exchange_rate** (read-only, synced by DHM from Coupa). The full client contract
is DHM's `Docs/CLIENT_INTEGRATION.md` (`GET {DHM_API}/openapi.json`); this document covers only
how EOS wires into it.

Company here means EOS's own internal legal entity (the PT on a PO). Vendor / supplier is a
separate external-party snapshot on `shipments` and is **not** backed by DHM company.

## Scope / pattern

| Entity | Pattern | Why |
|---|---|---|
| `company` | **A + C** — local replica (snapshot + incremental sync, kept warm by webhooks) **and** master owner (EOS may create a new company via `POST /v1/inbound/company`) | Source of PT dropdown options and Syncera PT filter |
| `site` | **C (read-only)** — local replica only | Source of the Plant dropdown (site name is snapshotted onto `import_purchase_order.plant`) |
| `plant` | **C (read-only)** — local replica only | SAP `plant_code` used to resolve Syncera plant codes to the parent site name |
| `exchange_rate` | **C (read-only)** — local replica only, no inbound create/update | DHM/Coupa is the sole writer; EOS only looks up the latest rate |

Deliberately **not** integrated yet: `port_master`, `incoterm`, `external_party`
(vendor/forwarder/agent/surveyor), `commodity`, `vessel`.

Transaction tables keep the existing snapshot pattern from `docs/ERD.md`:
`import_purchase_order.pt` and `.plant` stay free-text columns. Master data is lookup-only
(dropdown source + Syncera validation). No `company_id` / `plant_id` FK is stored on the PO.

## Identity

EOS mints its own surrogate `id` (UUID) on every master row. DHM's id/code are stored as
`dhm_id` / `dhm_code` and used only for sync, webhook apply, and inbound reconciliation.
Internal EOS joins (site → company, plant → site/company) use the EOS surrogate id.

DHM REFERENCE fields (`site.company_id`, `plant.site_id`) arrive as the **target row's DHM UUID**,
not its code. Upserts resolve that UUID against the parent's `dhm_id`. If the parent is missing
(out-of-order webhook), the child is skipped and self-heals on the next `company → site → plant`
sync pass.

## Backend layout

```
backend/src/integration/dhm/
  types.ts                   DHM wire types (sync envelope, inbound result, webhook payload, errors)
  dhm-client.ts               /v1 HTTP client: key-pair auth, retries (429/5xx), Idempotency-Key
  dhm-client-factory.ts       builds a DhmClient from config
  dhm-errors.ts                DhmApiError (branch on `code`, never on message — §11)
  dhm-mapper.ts                DHM record <-> local replica row <-> inbound payload
  dhm-sync.repository.ts      local replica persistence, sync cursor, webhook dedupe
  dhm-sync.service.ts          snapshot + incremental /v1/sync, applyRecord() shared by sync + webhook
  dhm-webhook.service.ts       X-DHM-Signature-256 verification + event handling
  dhm-webhook.controller.ts    HTTP handler (expects raw body — mounted with express.raw())
  dhm-webhook.routes.ts        POST / (no EOS auth — DHM authenticates via HMAC instead)
  dhm-inbound.service.ts       POST /v1/inbound/company (create) with idempotency + local upsert
  dhm-registry.ts              process-wide handle to the configured client/services (set at bootstrap)
  index.ts                     barrel

backend/src/integration/jobs/dhm-sync-job.ts   periodic reconciliation (webhooks are the fast path)

backend/src/modules/masters/                   HTTP surface consumed by the EOS frontend
  dto, validators, services, controllers, routes.ts  →  GET/POST /api/v1/masters/companies,
                                                          GET /api/v1/masters/catalog,
                                                          GET /api/v1/masters/pt-plant-tree,
                                                          GET /api/v1/masters/exchange-rates/latest,
                                                          POST /api/v1/masters/dhm/sync (ADMIN),
                                                          GET /api/v1/masters/dhm/health (ADMIN)
```

### Local replica tables

- Migration `094_dhm_integration.sql` — original `dhm_companies` / `dhm_exchange_rates` plus
  sync cursor, webhook dedupe, inbound audit.
- Migration `095_company_plant_master.sql` — reworks `dhm_companies` → `company_master`
  (EOS surrogate `id`, `dhm_id` / `dhm_code` as external refs) and adds `site_master` +
  `plant_master`. Also adds Syncera audit outcome `skipped_unknown_pt`.

Upserts are version-gated (`WHERE version <= EXCLUDED.version`) so an out-of-order webhook
cannot regress a newer sync.

`syncAll()` order is `company` → `site` → `plant` → `exchange_rate`.

### Syncera PT filter

The PO poller loads an in-memory snapshot of active `company_master` / `site_master` once per
cycle. A Syncera PO whose `pt_name` does not fold-match an active company is **not ingested**
(`skipped_unknown_pt`). If the company exists but `company_master.country` is not Indonesia
(`ID`, `IDN`, or `INDONESIA`), the PO is skipped as `skipped_non_id_country`. Known Syncera
text quirks still go through a small `PT_ALIAS` dictionary, then the live master.

Plant is resolved by Syncera `plant_code` (via `plant_master` → parent site) first, then
folded/contains match against `site_master.name`. The stored PO `pt` / `plant` values remain
text snapshots (company name / site name) at ingest time.

### Webhooks

Mounted at `POST /api/v1/integration/dhm/webhook`, registered with `express.raw()` **before** the
global `express.json()` in `app/index.ts` so the handler can verify the exact signed bytes. Flow:

1. Verify `X-DHM-Signature-256` (`t=<unix>,v1=<hmac>`), rejecting signatures older than
   `DHM_WEBHOOK_TOLERANCE_SECONDS` (replay protection).
2. Ack `200` immediately (DHM's timeout is 3s), then process asynchronously.
3. Dedupe on `X-DHM-Delivery-Id` via `dhm_webhook_deliveries`.
4. Apply `record.created` / `record.updated` / `record.deleted` for `company`, `site`, `plant`,
   and `exchange_rate` via the same `DhmSyncService.applyRecord()` used by the polling sync.

### Reconciliation job

`DHM_SYNC_INTERVAL_MS` (default 15 min) runs `DhmSyncService.syncAll()` as the safety net alongside
webhooks (CLIENT_INTEGRATION.md §13: "prefer both"). It resumes from the saved cursor, or
`updatedSince` on a cold start.

## Frontend

- `frontEnd/services/masters-service.ts` + `frontEnd/types/masters.ts` — thin client for the
  `/masters` endpoints above.
- `frontEnd/app/dashboard/masters/MasterDataPage.tsx` — browse EOS master data
  (company → site → plant, plus latest FX pairs). Admins can trigger a DHM sync from there.
- `frontEnd/hooks/use-pt-plant-tree.ts` — loads `GET /masters/pt-plant-tree` for Create/Edit PO
  and dashboard analytics filters. Options are sites: 0 sites = no plant field, 1 site = fixed value,
  2+ = dropdown. The selected site name is stored in `import_purchase_order.plant`.
- The shipment "Vendor / supplier" field is **free text**. Company master is not wired there
  (Company ≠ Vendor). `shipments.vendor_code` remains a historical snapshot column; EOS no longer
  writes it from the shipment update path.
- The shipment detail's "Currency rate" field (customs clearance step) gets a **"Use DHM rate"**
  button that looks up `GET /masters/exchange-rates/latest?from=<currency>&to=IDR&date=<nopen_date>`
  and fills the field; the officer can still override it manually.
- Dashboard **Financial visibility** (and analytics drill import lines) resolve **USD→IDR** live from
  `dhm_exchange_rates` **per delivered shipment**: latest rate on or before that shipment’s
  `closed_at` date (UTC calendar day). Amounts convert to USD per shipment, then sum
  (convert-then-sum). Missing rates fall back to `DASHBOARD_IDR_PER_USD`. Procurement plant report
  still uses a single rate as of the report month end.

## Configuration

See `backend/.env.example` (`DHM_*`). Nothing is required to run EOS without DHM — all of it is
gated behind `DHM_ENABLED=false` by default; `MastersService` returns `503` for create/sync calls
and the PT/Plant tree is empty until the first sync runs.

## Deliberate deviations from the generic client guide

- EOS does not implement the bearer-token auth mode (`POST /auth/token`); only the key-pair headers
  (§4A) are used, since all calls originate from the backend (never the browser).
- `exchange_rate` has no `/v1/inbound` usage by design — EOS never writes it.
- The Plant field in the UI lists DHM `site` names (not `plant` names). `plant` is still synced so
  Syncera `plant_code` can resolve to the parent site.
- Vendor / supplier is not a DHM `company` consumer.
