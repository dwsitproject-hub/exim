# Synology integration — shared server apps

How another application on the **same app server** stores files on the shared Synology NAS.

**Already done (do not repeat):** NAS share, SMB, host mount, and folder layout under the share are provisioned by IT/infra. You only configure **your app** so uploads go into **your** project folder.

---

## Shared layout (reference only)

On the server, the share is already mounted. Apps share one root and isolate by deployment + project slug:

```text
APPs/                    ← Synology shared folder (File Station)
  dev/
    EOS/                 ← EOS development
    YOUR_APP/            ← your app development
  prod/
    EOS/
    YOUR_APP/
```

| Fixed (same for every app on this server) | Per app (you choose / are given) |
|-------------------------------------------|----------------------------------|
| Host mount, e.g. `/mnt/synology/eos` | `STORAGE_PROJECT_SLUG` (e.g. `EOS`, `YOUR_APP`) |
| `dev` / `prod` folders under that mount | `STORAGE_DEPLOYMENT` = `dev` or `prod` |
| File Station: `APPs → {deployment} → {slug}` | Bind mount path **inside** your container (must match env) |

Resolved upload root:

```text
{STORAGE_SYNOLOGY_ROOT}/{STORAGE_DEPLOYMENT}/{STORAGE_PROJECT_SLUG}
```

Example for EOS on this server: `/mnt/synology/eos/dev/EOS`.

---

## What your app must do

### 1. Set storage env vars

Use the Option B pattern (recommended). Values below match the **EOS** integration; replace the slug for your app.

```env
STORAGE_TYPE=local
STORAGE_SYNOLOGY_ROOT=/mnt/synology/eos
STORAGE_DEPLOYMENT=dev
STORAGE_PROJECT_SLUG=YOUR_APP
```

Resolved base path: **`/mnt/synology/eos/dev/YOUR_APP`**

Rules:

- Do **not** set `STORAGE_LOCAL_PATH` when using Option B (it overrides the composed path).
- Use `STORAGE_DEPLOYMENT=prod` only for production (or staging that must mirror prod), with the prod slug/path your team confirms.
- Confirm your project folder exists under `APPs/{deployment}/` (or that the app may create subfolders under an agreed slug). Ask infra only if the **folder for your slug** is missing — not for mounting the NAS.

**Option A** — if you are given one full path instead:

```env
STORAGE_LOCAL_PATH=/mnt/synology/eos/dev/YOUR_APP
```

### 2. Align Docker bind mounts (if the API runs in a container)

`STORAGE_SYNOLOGY_ROOT` (or `STORAGE_LOCAL_PATH`) must be a path **inside the container**. Bind the host mount into that path.

EOS reference (staging / production):

- `docker-compose.staging.backend.yml`
- `docker-compose.production.backend.yml`
- Root `.env` / `.env.example`: `STORAGE_HOST_MOUNT` if the host path differs from the compose default

After changing storage env or volumes, recreate the backend container so the bind takes effect.

### 3. Verify

1. App starts with no storage config errors.
2. Upload a file through your app.
3. Confirm it on the host (or `docker exec … ls` on the resolved path).
4. Optionally check File Station: `APPs → {deployment} → {YOUR_APP}`.
5. Download the same file through the app.

---

## Laptop / local without NAS

Machines without the Synology mount should **not** use Option B. Use a local folder only:

```env
STORAGE_LOCAL_PATH=./uploads
```

Those files stay on the laptop; they are not on the NAS.

---

## Path resolution (EOS backend reference)

See `backend/src/config/index.ts`. Order:

1. **`STORAGE_LOCAL_PATH`** if set → used as-is.
2. Else if `STORAGE_SYNOLOGY_ROOT` + `STORAGE_DEPLOYMENT` + `STORAGE_PROJECT_SLUG` are all set → `{root}/{deployment}/{project}/`.
3. Else → `./uploads`.

**PIB draft exception:** `PIB_BC` documents with status `DRAFT` are stored under `STORAGE_DRAFT_LOCAL_PATH` (default `./uploads-draft`), not under the Synology filing tree. Keys are prefixed `_drafts/`. `PIB_BC` `FINAL` uses the normal Import filing path on Synology.

---

## Troubleshooting (app config only)

| Symptom | Check |
|---------|--------|
| Upload works but File Station empty / wrong folder | Wrong `STORAGE_DEPLOYMENT` or `STORAGE_PROJECT_SLUG` |
| Files visible in container but not on NAS | Bind mount missing or host/container paths disagree — fix compose and recreate |
| Works on server, not on laptop | Expected without NAS; use `STORAGE_LOCAL_PATH=./uploads` locally |

Mount, firewall, and DSM issues are infra — escalate only after your slug/path and bind mount match the table above.

---

## Related files (EOS)

| File | Purpose |
|------|---------|
| `backend/.env.example` | Storage variables (Option B / A / local) |
| Root `.env.example` | `STORAGE_HOST_MOUNT` for Compose |
| `docker-compose.staging.backend.yml` | Staging NAS bind example (Postgres is ApsaraDB; local PG overlay optional) |
| `docker-compose.production.backend.yml` | Production NAS bind example (Postgres is ApsaraDB after cutover) |
| `backend/src/config/index.ts` | Path resolution |
| `docs/TSD.md` | Broader document storage strategy |
| `docs/SETUP.md` | General EOS setup (Node, DB, migrations) |
