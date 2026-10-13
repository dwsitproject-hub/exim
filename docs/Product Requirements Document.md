# Product Requirements Document

**Product name:** EXIM Operation System (EOS)

| | |
|---|---|
| Product Manager | Stevanus Kurniawan |
| Original date | 11 March 2026 |
| Last updated | 28 August 2026 |
| Basis | As-built on `main` (`f7d8bcb`) |

This document is the living product spec. It keeps the original Phase 1 structure and updates every section to match what is implemented on `main`, including deviations, completed work, and deferred scope.

---

## Revision history

| Date | Change |
|------|--------|
| 11 Mar 2026 | Original PRD: import-transaction monitoring, 10-step timeline, Phase 1 import only. |
| 28 Aug 2026 | Rewritten against `main`: PO intake + shipment domain, dashboards, documents, RBAC, SSO, CSV/PDF intake, PIB OCR, notifications. |

---

## 1. Product Overview

### Vision / Goal

Build a centralized EXIM Operation System (EOS) that lets EXIM teams and stakeholders track, manage, and monitor **import** work from purchase-order detection through goods receipt at warehouse.

The system replaces spreadsheet and email tracking by providing:

- Real-time shipment monitoring with an enforced milestone timeline
- Centralized document management (local / Synology-backed storage)
- Forwarder bidding (when the buyer arranges transport)
- Import duty tracking (BM, PPN, PPH, PDRI)
- Operational dashboards (pipeline KPIs, logistics mix, financials, post-arrival lead)
- In-app notifications (new work, mentions, ETA reminders)

**Phase 1 (this document, as-built on `main`)** is Import Operations.

**Phase 2** will expand the system to Export Operations. Export is **not** on `main`.

### Target users

| Audience | How they use EOS today |
|----------|------------------------|
| **Primary — Import / EXIM officers** | Claim POs, group POs into shipments, update status, upload documents, record bidding and duties |
| **Secondary — Viewers** | Read PO and shipment lists/detail; limited write (CSV/PDF intake is allowed for testing until SaaS is the only intake path) |
| **Secondary — Docs role** | Read-only PO and shipment visibility |
| **Admin** | User management, permission overrides, PO PDF AI usage, full operational access |
| **Management / Finance / Warehouse / Purchasing** | Consumed as **viewers** of the same shipment and dashboard surfaces. They are not separate application roles in Phase 1 |

Purchasing remains the owner of the PO in the external SaaS. EOS does not replace the purchasing system.

---

## 2. Problem Statement

Import operations were tracked with spreadsheets and email. That created:

1. **Limited shipment visibility** — stakeholders could not see progress in one place.
2. **Document fragmentation** — BL, invoice, COO, PIB and related files lived in different locations.
3. **Complex shipment structure** — one shipment can contain multiple purchase orders.
4. **No standardized milestone tracking** — status was informal and inconsistent.
5. **Difficult management reporting** — no centralized dashboard of import activity.

A digital system is required to centralize import monitoring and improve operational transparency.

**As-built correction to the original model:** EOS does not create the purchase order. Purchasing creates the PO in an external SaaS. EOS **ingests** the PO (poller, CSV, PDF parse, or manual create for testing), an Import officer **claims** it, then **groups one or more POs into a shipment**. The **shipment** is the operational entity (timeline, documents, notes, duties). The original “one import transaction = one PO” model was retired.

---

## 3. Success Metrics

| KPI | Target | As-built support |
|-----|--------|------------------|
| Shipment tracking coverage | 100% of import shipments recorded in EOS | Shipments are first-class records with unique shipment numbers; POs must be coupled before pickup |
| Document completeness | 95% of shipments have required documents before customs clearance | Status transitions **block** until required documents and fields for the current (and skipped) statuses are present |
| Operational efficiency | Reduce manual spreadsheet tracking by 50% | PO list, shipment list, dashboard KPIs, CSV/PDF intake, activity logs, and filters replace ad-hoc tracking |

These remain operational targets, not automated product analytics. Dashboard counts (new POs, awaiting allocation, active / in-customs / delivered shipments) and shipment-performance cards (on-time vs late) are the in-product proxies.

---

## 4. Scope

### Phase 1 — Import (in scope and shipped on `main`)

| Area | What is in product |
|------|--------------------|
| Authentication | Email/password login, email verification, forgot/reset password, optional DWS Hub OIDC SSO |
| Access control | Roles `ADMIN`, `IMPORT_OFFICER` (legacy alias `EXIM_OFFICER`), `VIEWER`, `DOCS`; per-user permission overrides |
| PO intake | List, detail, claim / re-claim, edit, activity log; ingest via SaaS poller, CSV, PO PDF AI parse, or manual create |
| Shipment operations | Create, list, detail, update, soft-delete, close; couple / decouple POs; delivered qty per PO line |
| Forwarder bidding | Record bids, quotation upload, select forwarder — required only for EXW / FCA / FOB |
| Document management | Typed uploads, download, delete; PIB draft vs final; local OCR check on PIB draft |
| Import duties | Line-level BM% / PPN% / PPH%; shipment BM / PPN / PPH / PDRI; BC 2.3 treated as zero in-app |
| Shipment timeline | 8 operational statuses with incoterm-aware chain and gate rules |
| Dashboard and reporting | Pipeline KPIs, analytics (plant, classification, logistics, financials, post-arrival lead), recent shipments, USD rate bar |
| Bulk import | Combined PO+shipment CSV template/import; PO CSV; import history |
| Collaboration | Shipment notes with @mentions, in-app notification bell, ETA H-3 / H-2 / H-1 reminders |
| Administration | User CRUD and CSV import; PO PDF AI usage (admin) |
| Platform | Next.js UI, Node.js API, PostgreSQL, Docker Compose, Synology/local file storage, scheduled DB backups |

### Out of scope (unchanged, still future)

| Item | Status on `main` |
|------|------------------|
| Export shipment management | Not shipped. Feature branches exist (`feature/export-bulking`, `feature/jetty-integration`) and are **not** merged to `main` |
| Supplier portal | Not shipped |
| Customs API integration | Not shipped. PIB OCR is **local PDF parse**, not a live customs system |
| Automated financial payment processing | Not shipped. Duties are recorded and displayed only |

### Deferred / partial vs original spec

| Original intent | Reality on `main` |
|-----------------|-------------------|
| EOS creates an “import transaction” to start monitoring | POs are ingested; EXIM claims and groups them into shipments |
| 10-step timeline including Delivery, Goods Received, Import Completed | **8 statuses**; warehouse GR and “import completed” are collapsed into **Delivered** (user supplies delivered date) |
| Distinct Finance / Warehouse / Purchasing app roles | Single operational product with RBAC; those teams use Viewer or shared Import Officer access |
| SaaS PO polling as the only create path | Poller exists (flag + `SAAS_PO_API_BASE_URL`); CSV, PDF AI, and manual create remain so operations can run without a live SaaS |

---

## 5. Business or User Flow

### Import monitoring workflow (as-built)

1. Purchasing creates the overseas PO in the external SaaS (or an operator imports/creates it in EOS for testing).
2. EOS detects the PO (poller every 5 minutes when enabled, or CSV / PDF / manual create) and stores an **imported PO intake** with status **New PO detected**.
3. Import officer opens the PO, **claims** it (status **Claimed**). Re-claim is allowed when the previous claimer is inactive or the PO has no active shipment.
4. Officer **creates a shipment** from the PO or **couples** the PO onto an existing shipment. One shipment may hold multiple POs. Intake moves to **Allocation in progress** (and later **Partially shipped** / **Shipped** / **Fulfilled** from shipment facts).
5. Officer reviews **incoterm**. If EXW / FCA / FOB, **Bidding Transporter** is on the timeline and at least one bid is required. Other incoterms skip bidding.
6. Officer records shipment facts (ports, ETD/ETA, ship via/by, forwarder, PIB type, classification, surveyor, depo, container/package units, freight).
7. Supplier prepares cargo; officer advances status as milestones are met. The system **blocks** skip-ahead unless all required fields and documents for every skipped status are present.
8. Cargo is picked up (ATD, linked PO, delivered qty on at least one line). Cargo is on shipment (BL/AWB, PIB doc no, PPJK/EMKL).
9. Customs clearance (ATA, Nopen, Nopen date, currency rate, line duty %, PIB/BC and SPPB documents). Optional PIB draft OCR compares extracted values to EOS.
10. Officer marks **Delivered** (delivered date required). Duties and financial totals are visible on the shipment and on the dashboard.

### PO intake status (layer 1)

| Status | Meaning |
|--------|---------|
| New PO detected | Ingested, not yet claimed |
| Claimed | An Import officer has taken ownership; not yet (or no longer) grouped to an active shipment |
| Allocation in progress | Linked to a shipment that has not finished shipping the PO |
| Partially shipped | Some — not all — PO qty has been delivered across linked shipments |
| Shipped | PO qty allocated/shipped; not yet fulfilled |
| Fulfilled | Delivered qty covers PO qty (overshipped is flagged when delivered exceeds PO qty) |

Legacy labels `NOTIFIED`, `TAKEN_BY_EXIM`, `GROUPED_TO_SHIPMENT` may still appear in old data and map to Claimed / Allocation in progress.

### Shipment status (layer 2)

See Section 7.

---

## 6. User Stories

Original stories are kept. Status reflects `main`. New stories cover work that shipped beyond the original list.

| No | Function / page | User story | Acceptance criteria | Status |
|----|-----------------|------------|---------------------|--------|
| 1 | Create / ingest PO | As an Import officer, I want POs in EOS so monitoring can begin | PO can be ingested (poller / CSV / PDF / manual) with header and line items | **Done** (manual create remains for E2E; SaaS poller is optional) |
| 2 | Upload shipment documents | As an Import officer, I want to upload shipment documents so files are stored centrally | Typed upload of BL, invoice, COO, insurance, packing list, plus PIB/BC, SPPB, VO, quotations, and other operational types | **Done** (type set is wider than original) |
| 3 | Forwarder bidding | As an Import officer, I want to record bidding so transporter selection is documented | Bids, quotations, and selected forwarder are stored on the shipment | **Done** (required only for EXW/FCA/FOB) |
| 4 | Shipment monitoring | As a stakeholder, I want to monitor shipment progress | List + detail with filters, linked POs, PIC, ETA, status | **Done** |
| 5 | Import duty monitoring | As finance staff, I want import taxes recorded | BM, PPN, PPH, PDRI at shipment; BM%/PPN%/PPH% per delivered line | **Done** (BC 2.3 amounts treated as zero in-app) |
| 6 | Shipment status timeline | As a stakeholder, I want a visual timeline | Completed / current / pending steps with dates | **Done** (8 steps, not 10) |
| 7 | Claim PO | As an Import officer, I want to claim a detected PO | Take ownership; re-claim when eligible | **Done** |
| 8 | Group POs into shipment | As an Import officer, I want several POs on one shipment | Couple / decouple with audit; delivered qty per line | **Done** |
| 9 | Dashboard | As management, I want import KPIs and mix | Pipeline cards, analytics, logistics, financials, post-arrival lead | **Done** (richer than original) |
| 10 | Sign in | As a user, I want secure access | Password + optional DWS Hub SSO; RBAC | **Done** |
| 11 | User management | As an admin, I want to provision users | Create/edit users, CSV import, permission overrides | **Done** |
| 12 | Notifications | As an Import officer, I want alerts for ETA and mentions | Bell, mark read, ETA H-3/H-2/H-1, note @mentions | **Done** |
| 13 | PIB check | As an Import officer, I want PIB draft checked against EOS | Upload PIB draft → local OCR → mismatch warnings; recheck | **Done** (not a customs API) |
| 14 | Bulk import | As an operator, I want to load historical/monitoring data | Combined CSV template + import history | **Done** |

---

## 7. Shipment Status Timeline Feature

### Purpose

Provide a visual milestone tracker on **Shipment detail** so users can see completed steps, the current status, upcoming steps, and the date of each change.

### Timeline status flow (as-built)

Eight operational statuses (not the original ten):

| Step | Status | Description |
|------|--------|-------------|
| 1 | Initiate Shipping Document | Shipment created; PO, commercial invoice, packing list required before leaving this step |
| 2 | Bidding Transporter | **Only EXW / FCA / FOB.** At least one forwarder bid required. Skipped for CFR / CIF / CPT / CIP / DAP / DPU / DDP |
| 3 | Transport Confirmed | Forwarder / liner, freight charges, and ship via (Air / Sea) required. For Sea, ship by (Bulk / LCL / FCL) is required when leaving this step |
| 4 | Ready Pickup | VO required when Surveyor = Yes |
| 5 | Picked Up | ATD, at least one linked PO, and delivered qty &gt; 0 on at least one PO line. FCL: each selected unit type must have container count ≥ 1 |
| 6 | On Shipment | BL/AWB, PIB Doc No, PPJK/EMKL; Bill of Lading document |
| 7 | Customs Clearance | ATA, Nopen, Nopen date, currency rate on grouped POs, BM%/PPN%/PPH% on each delivered line; PIB/BC Final + SPPB (and Billing/BPN for BC 2.0). Consignment Note uses a lighter customs-doc set |
| 8 | Delivered | User enters delivered date. Documents cannot be uploaded or deleted after this status |

**Removed vs original PRD:** separate **Delivery**, **Goods Received**, and **Import Completed** steps. Warehouse confirmation is the **Delivered** action.

### Timeline visual logic

| Indicator | Meaning |
|-----------|---------|
| Green / completed | Status already passed |
| Current (accent) | Shipment `current_status` |
| Grey / pending | Future status on the applicable chain |

Bidding Transporter is omitted from the chain when the incoterm skips it.

### Timeline update behavior

- Status moves **forward only** (single step or multi-skip).
- Before a move, the system enforces **fields and documents for every status from current through target**.
- Timeline, status summary, and activity log are all keyed by `shipment_id`.

### Event → status (original mapping, updated)

| Event | Status update |
|-------|----------------|
| Shipment created | Initiate Shipping Document |
| Forwarder selected (EXW/FCA/FOB after bids) | Transport Confirmed (after Bidding Transporter) |
| Pickup / ATD + delivered qty | Picked Up |
| ETD/on-voyage facts + BL | On Shipment |
| PIB submitted (Nopen + customs docs) | Customs Clearance |
| Delivered date entered | Delivered |

Pickup date alone is not enough; delivered qty on a grouped PO line is required to leave Picked Up’s predecessor.

---

## 8. Data (PO + Shipment)

The original “Import Transaction” blob is split.

### Purchase order (intake)

| Group | Fields |
|-------|--------|
| Identity | PO number, external id (SaaS), PT (legal entity), plant |
| Vendor | Supplier name, delivery location, incoterm location, kawasan berikat, currency |
| Ownership | Intake status, claimed by, claimed at |
| Lines | Description, qty, unit, unit value, kurs, net/gross weight (MT), received qty, remaining qty |

PT options include the group companies (Energi Unggul Persada, Energi Oleo Persada, Priscolin, and others). Plant is constrained per PT (e.g. Batam, Tanjung Pura).

### Shipment — basic / logistics

| Group | Fields |
|-------|--------|
| Identity | Shipment number, PIC (from PO claimers), vendor snapshot |
| Routing | Incoterm, ship via (Sea / Air), ship by (Bulk / LCL / FCL when Sea), origin and destination port name/country, kawasan berikat |
| Parties | Forwarder / liner, warehouse, PPJK/EMKL, surveyor (Yes/No) |
| Dates | Pickup (implied via ATD), ETD, ETA, ATD, ATA, delivered at (`closed_at`) |
| Units | 20′, 40′, 40′ HC, 20′ ISO tank, 20′ FR, 40′ FR, package; counts required for selected FCL types |
| Cargo | CBM, net weight MT, gross weight MT, product classification (Chemical / Packaging / Spare Parts) |
| Depo | Depo yes/no, depo location |

### Shipment — customs

| Field | Notes |
|-------|--------|
| PIB type | BC 2.3, BC 2.0, or Consignment Note (legacy labels PIB 2.3 / Consignee Note still accepted) |
| PIB Doc No | `no_request_pib` |
| Nopen / Nopen date | Required at Customs Clearance |
| BL/AWB | Required at On Shipment |
| COO | Optional document + field |
| Insurance number / insurance amount | Amount compared to PIB draft OCR |
| Invoice number | On linked PO mapping, compared in OCR |

### Import duties

| Field | Notes |
|-------|--------|
| Line BM% / PPN% / PPH% | Required on each delivered line before Customs Clearance |
| Shipment BM / PPN / PPH | User-entered IDR totals |
| PDRI | System sum BM + PPN + PPH |
| BC 2.3 | In-app BM / PPN / PPH / PDRI treated as zero |
| Freight charges | Amount + USD/IDR |
| Total items amount | Σ(qty × price) in IDR using group currency rate when needed |

### Documents (shipment-scoped)

Allowed types: PO (per linked intake), Invoice, BL, COO, Insurance, Packing List, PIB/BC (Draft / Final), SPPB, Forwarder Quotation, LS, VO, SPPBMCP, MSDS, B3, DG, Billing, BPN, Inbound Charge, Bukti Bayar, Other.

PIB/BC **Draft** is stored for local OCR verify; **Final** is the filing copy (Synology path when configured). Uploads and deletes are blocked when status is Delivered.

---

## 9. UX / Design

### Information architecture (as-built)

| Route | Purpose | Who sees it |
|-------|---------|-------------|
| `/login` | Password login; **Sign in with DWS Hub** when OIDC is configured | Public |
| `/register`, `/verify-email`, `/forgot-password`, `/reset-password` | Account lifecycle | Public (registration gated by `ALLOW_ANY_EMAIL`) |
| `/dashboard` | Pipeline KPIs, analytics, recent shipments | Authenticated |
| `/dashboard/po` | Purchase Order list (filters, claim, create) | `VIEW_PO_INTAKE` |
| `/dashboard/po/new`, `/dashboard/po/[id]`, edit | Create / detail / edit PO | Officers |
| `/dashboard/shipments` | Shipment list (column filters, ETA date range, clear-all filters, expand PO lines) | `VIEW_SHIPMENTS` |
| `/dashboard/shipments/[id]` | Shipment detail: general, POs, logistics, documents, bidding, duties, timeline, notes, activity log | `VIEW_SHIPMENTS` |
| `/dashboard/monitoring-data` | Import Data (CSV combined import) | `IMPORT_PO_CSV` |
| `/dashboard/users` | User management | `MANAGE_USERS` |
| `/admin/po-pdf-ai` | PO PDF AI usage | `VIEW_PO_PDF_AI_USAGE` |
| `/import`, `/import/dashboard` | Aliases of the main dashboard | Authenticated |
| `/dashboard/analytics`, `/dashboard/management` | Redirect to `/dashboard` | — |

### Shipment detail layout (original wireframe, updated)

```
Shipment detail
--------------------------------
General information (number, PIC, vendor, status, classification)
--------------------------------
Linked purchase orders (couple/decouple, invoice, rate, delivered qty, duty %)
--------------------------------
Shipment / logistics (incoterm, ports, dates, units, weights, depo, surveyor)
--------------------------------
Forwarder bidding (EXW/FCA/FOB)
--------------------------------
Documents
--------------------------------
Shipment status timeline + status change
--------------------------------
Import duties & taxes
--------------------------------
Notes (@mention) + activity log
--------------------------------
```

### Cross-cutting UX (shipped, not in original PRD)

- Design tokens as the color/type source of truth
- Collapsible sidebar, mobile drawer, command palette, in-page guide tour
- Table column picker, multi-select column filters, date-range filters, “Clear all filters”
- Notification bell
- USD/IDR toggle on dashboard financials

---

## 10. Dependencies / Risks

| No | Dependency / risk | Raised | Mitigation | PIC | Status |
|----|-------------------|--------|------------|-----|--------|
| 1 | PO data from ERP / SaaS | Original | Manual create, CSV, and PDF AI until poller + `SAAS_PO_API_BASE_URL` are live in each environment | IT / EXIM | **Open** — poller is built; production wiring is operational |
| 2 | Document completeness | Original | Status-gate required documents; checklist in status-update UX | EXIM | **Mitigated in product** — still depends on users attaching files |
| 3 | Shipment status updates | Original | Enforced forward-only chain + SOP | EXIM | **Mitigated in product** — SOP still needed for when to click Delivered vs warehouse GR |
| 4 | File storage durability | Implementation | Synology mount (`STORAGE_SYNOLOGY_ROOT` + deployment + slug) or explicit `STORAGE_LOCAL_PATH`; S3 adapter exists | IT | **Open** per environment |
| 5 | SSO / cookie across origins | Implementation | OIDC PKCE via DWS Hub; same-origin proxy recommended; `COOKIE_SECURE` on HTTPS | IT | **Open** until Hub client is registered per env |
| 6 | PIB OCR accuracy | Implementation | Draft-only local parse; warnings are advisory; recheck action | EXIM | **Accepted** — not a customs source of truth |
| 7 | Open registration | Implementation | `ALLOW_ANY_EMAIL=false` in production | Admin | **Open** — go-live checklist |

Go-live operational items (CORS, secrets, TLS, backups, SMTP) live in `docs/GO-LIVE-CHECKLIST.md`.

---

## 11. What was actually built

This section is the product inventory of `main`. It is not a technical design (see TSD / ERD / API spec).

### Domain

- **PO intake** (`imported_po_intake` + items) is the procurement reference.
- **Shipment** is the operational monitoring entity.
- **shipment_po_mapping** is many POs to one shipment, with couple/decouple audit and per-line delivered qty.
- Legacy `import_transactions` tables were dropped after the cutover.

### Intake channels

1. **SaaS poller** — optional, ~5 minutes, dedupes on `external_id`.
2. **CSV** — PO-only template and combined PO+shipment template, with import history.
3. **PO PDF AI parse** — rate-limited; usage visible to admin.
4. **Manual create** — `POST /po/test-create` for E2E and gap filling.

### Shipment operations beyond the original spec

- Soft delete; close with reason
- Incoterm-aware status chain
- Per-status required fields and documents (backend and frontend kept in sync)
- Activity log (field-level update log + status history)
- List filter options endpoint; ETA from/to; performance “late vs ETA”; dormant remaining-qty deep links
- PIB draft OCR vs EOS values (ports, BL, freight, insurance, weights, invoice, kurs, duties)

### Dashboard (shipped)

- KPI cards: New POs detected, Awaiting allocation (Claimed), Active shipments, In customs, Delivered — each deep-links to a filtered list
- Date / PT / plant / vendor / classification / ship-via filters
- Mix by plant and product classification, with line-level drill
- Logistics: Air vs Sea; Sea split Bulk (methanol), FCL (by container type + mixed combos), LCL (packages + CBM)
- Financial summary: import value, BM, PPH, PPN, freight (IDR, displayable as USD)
- Post-arrival lead by plant
- Shipment performance (on-time / delayed)
- Recent shipments (last 7 days by PO date)

### Platform / security (shipped)

- JWT access + server-side refresh tokens; HttpOnly cookies; RBAC from DB on each request
- Auth rate limits; CORS allowlist outside development
- Helmet, parameterized SQL on reviewed paths
- Health endpoint; Docker Compose (dev / staging / production); daily Postgres backup job (production profile)

### Intentionally not built on `main`

- Export module, jetty/export bulking UI
- Supplier portal
- Live customs or payment APIs
- Distinct Finance / Warehouse / Purchasing roles
- Separate Goods Received / Import Completed statuses

---

## 12. Original spec vs `main` (coverage)

| Original requirement | Result |
|----------------------|--------|
| Centralized import monitoring | **Covered** — shipment-centric |
| Real-time status / timeline | **Covered** — 8 steps, gated |
| Document management | **Covered** — expanded type set + Synology |
| Forwarder bidding | **Covered** — incoterm-conditional |
| Import duty tracking | **Covered** — line % + shipment totals |
| Dashboard and reporting | **Covered** — exceeded original cards |
| Create import transaction as primary write | **Deviated** — ingest PO, then create shipment |
| 10-step timeline | **Deviated** — 8 steps; GR folded into Delivered |
| Phase 2 export in a later phase | **Deferred** — not on `main` |

---

## 13. Future work

Keep these out of Phase 1 commitments unless a new PRD revision says otherwise:

1. **Export operations** — shipments, jetty, bulking (work exists on feature branches; merge is a separate product decision).
2. **SaaS as sole PO source** — turn off manual/CSV/PDF create in production once polling is trusted.
3. **Customs API** — replace or supplement local PIB OCR.
4. **Warehouse goods-receipt handshake** — if operations need a status distinct from Delivered.
5. **Supplier portal** and **automated duty payment**.
6. **Role split** for Finance / Warehouse / Purchasing if those teams need different screens or field-level rights.
7. **Success-metric instrumentation** — automated coverage and document-completeness reports against the targets in Section 3.
