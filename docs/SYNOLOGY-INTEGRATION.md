# Synology integration (EOS)

This guide is for **developers integrating EOS with the shared Synology storage**. The NAS, SMB share, and server mount are already configured by IT/infra — you only need to set the correct **environment variables** in this project so uploads land in the right folder.

**What you get**

- Uploaded documents are stored on the Synology share; PostgreSQL keeps metadata only (`storage_key` and related fields).
- The API resolves the storage root from environment variables (**Option B** recommended):  
  `{STORAGE_SYNOLOGY_ROOT}/{STORAGE_DEPLOYMENT}/{STORAGE_PROJECT_SLUG}`  
  Example: `/mnt/synology/eos/dev/EOS` for the EOS development integration.

For general EOS setup (Node, DB, migrations), see [SETUP.md](./SETUP.md).

---

## 1. Before you start

Ask your team lead or infra contact for the values that apply to your environment. You typically need:

| What to confirm | Example |
|-----------------|--------|
| Mount path on the app server (and the same path **inside Docker**, if used) | `/mnt/synology/eos` |
| Deployment folder under the share | `dev` or `prod` |
| Project slug for this app | `EOS` |
| Synology File Station path (for manual checks) | `APPs → dev → EOS` |

If any of these are wrong, uploads may succeed locally but files will not appear where the team expects on the NAS.

---

## 2. How paths are resolved

The backend builds the upload root in this order (see `backend/src/config/index.ts`):

1. **`STORAGE_LOCAL_PATH`** — if set, this path is used as-is (overrides everything else).
2. **Option B** — if `STORAGE_SYNOLOGY_ROOT`, `STORAGE_DEPLOYMENT`, and `STORAGE_PROJECT_SLUG` are all set:  
   `{root}/{deployment}/{project}/`
3. **Default** — `./uploads` (local folder in the backend working directory).

Recommended layout on the share (already provisioned on the server):

```text
APPs/                    ← Synology shared folder (name may differ)
  dev/
    EOS/                 ← this app (development)
  prod/
    EOS/                 ← this app (production)
```

Another application on the same share uses its own slug, e.g. `dev/OTHER_APP/`, via a different `STORAGE_PROJECT_SLUG`.

---

## 3. Configure `backend/.env`

Copy from **`backend/.env.example`** if you do not have a local file yet.

### Option B (recommended for Synology)

```env
STORAGE_TYPE=local
STORAGE_SYNOLOGY_ROOT=/mnt/synology/eos
STORAGE_DEPLOYMENT=dev
STORAGE_PROJECT_SLUG=EOS
```

Resolved base path: **`/mnt/synology/eos/dev/EOS`**

Do **not** set `STORAGE_LOCAL_PATH` when using Option B unless you intentionally want to override the composed path.

Use `STORAGE_DEPLOYMENT=prod` and the production values provided by your team for production/staging that mirrors prod.

### Local development without NAS

On a laptop or machine without the Synology mount, comment out the three Option B variables and use a local folder:

```env
STORAGE_LOCAL_PATH=./uploads
```

Documents stay on your machine; they are not synced to the NAS.

### Option A — explicit path

If your team gives you a single full path instead of Option B:

```env
STORAGE_LOCAL_PATH=/mnt/synology/eos/dev/EOS
```

If `STORAGE_LOCAL_PATH` is set, it **wins** over Option B.

Full variable reference: **`backend/.env.example`**.

---

## 4. Docker (staging / production)

When the backend runs in Docker, **`STORAGE_SYNOLOGY_ROOT` must match the path inside the container**, not only on the host. Compose bind-mounts the host NAS path into the container — see:

- `docker-compose.staging.backend.yml`
- `docker-compose.production.backend.yml`

### Root `.env` (Compose)

If the host mount path differs from the default, set **`STORAGE_HOST_MOUNT`** in the project root **`.env`** (see root **`.env.example`**). Compose substitutes this into the volume bind.

### `backend/.env` for Compose stacks

Staging and production backend compose files load **`./backend/.env`**. Ensure it contains database/JWT settings **and** the storage variables from section 3, aligned with the bind mount in the compose file.

After changing storage env vars or bind mounts, recreate the backend:

```bash
docker compose -f docker-compose.staging.backend.yml up -d --force-recreate backend
```

```bash
docker compose -f docker-compose.production.backend.yml up -d --force-recreate backend
```

### Quick check inside the container

Replace the path with your resolved base path (e.g. `.../dev/EOS`):

```bash
docker exec eos-backend-staging ls -la /mnt/synology/eos/dev/EOS
```

You should see the same content as on the host for that path. If the container directory is empty but uploads “work”, the bind mount or `STORAGE_*` values likely do not match — ask infra or compare with the compose `volumes` section.

---

## 5. Verify your integration

1. Start the API with the updated **`backend/.env`** (no config errors in logs).
2. **Upload** a document from the UI or API (e.g. shipment document).
3. Confirm the file under your resolved path, e.g. `.../dev/EOS/...` (on the server host or via `docker exec`).
4. Optionally open **Synology File Station** and browse to the folder your team gave you (e.g. `APPs → dev → EOS`); subfolders are created by the app.
5. **Download** the same document in the app to confirm read access.

---

## 6. Troubleshooting (configuration)

| Symptom | What to check |
|---------|----------------|
| Upload succeeds but File Station is empty | Wrong `STORAGE_DEPLOYMENT` or `STORAGE_PROJECT_SLUG`; typo in slug (e.g. `Exim` vs `EOS`). |
| Files in `docker exec` but not on NAS | Container writing to its own disk — bind mount missing or wrong; fix compose + recreate backend. |
| Works on server, not on laptop | Expected if NAS is not mounted locally; use `STORAGE_LOCAL_PATH=./uploads` for local dev. |
| Wrong file type on DSM for PDFs | App stores names as **`name_<uuid>.pdf`** (UUID before extension). Older `name.pdf_<uuid>` files may look odd until re-uploaded. |

Server-side mount, firewall, or DSM issues are handled by IT/infra — escalate with the host path and share name you were given.

---

## 7. Related files

| File | Purpose |
|------|---------|
| `backend/.env.example` | Storage variables (Option B, A, local dev) |
| Root `.env.example` | `STORAGE_HOST_MOUNT` for Compose bind mounts |
| `docker-compose.staging.backend.yml` | Staging backend + NAS bind |
| `docker-compose.production.backend.yml` | Production backend + NAS bind |
| `backend/src/config/index.ts` | How `STORAGE_LOCAL_PATH` is resolved |
| `docs/TSD.md` | Broader document storage strategy |
