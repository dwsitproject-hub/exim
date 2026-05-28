# Synology integration (EOS)

This guide walks through connecting EOS to a **Synology NAS** shared folder so uploaded documents are stored on the NAS while PostgreSQL keeps only metadata (`storage_key` and related fields).

**What you get**

- Files live on the Synology share (not duplicated as a second full copy inside the app server when the mount is bound into Docker correctly).
- The API resolves the storage root from environment variables (**Option B** recommended):  
  `{STORAGE_SYNOLOGY_ROOT}/{STORAGE_DEPLOYMENT}/{STORAGE_PROJECT_SLUG}`  
  Example: `/mnt/synology/eos/dev/EOS` for development integration.

For general EOS setup (Node, DB, migrations), see [SETUP.md](./SETUP.md).

---

## 1. Prerequisites

| Item | Notes |
|------|--------|
| Network | App server can reach Synology on the LAN (or VPN if the server is in the cloud). **SMB TCP 445** allowed. |
| Synology | DSM access; permission to create or use a shared folder and SMB user. |
| Ubuntu server | CIFS client; Docker used if the backend runs in containers (e.g. staging). |
| Information to collect | NAS host/IP, share name (e.g. `APPs`), SMB username/password, desired folder layout under the share. |

---

## 2. Synology (DSM) configuration

1. **Control Panel → File Services**  
   - Enable **SMB**.  
   - Prefer SMB 2.1 or 3.x; disable SMB1 if policy allows.

2. **Shared folder**  
   - Use or create a folder (example name: `APPs`).  
   - EOS will use subfolders such as `dev/EOS` or `prod/EOS` under that share—see section 4.

3. **User for the application**  
   - Create a dedicated user (e.g. `eos_app`) or use LDAP/AD per IT policy.  
   - Grant **Read/Write** on the shared folder used by EOS (inheritance usually covers subfolders).

4. **Record for the Linux mount**  
   - UNC-style path: `//<NAS_HOST_OR_IP>/<ShareName>`  
   - Example: `//172.30.1.94/APPs`

---

## 3. Ubuntu: mount the share (CIFS)

### 3.1 Install CIFS utilities

```bash
sudo apt update && sudo apt install -y cifs-utils
```

### 3.2 Create a mount point

```bash
sudo mkdir -p /mnt/synology/eos
```

(You can use another host path; keep it consistent with `STORAGE_SYNOLOGY_ROOT` in EOS.)

### 3.3 Credentials file (root-only)

```bash
sudo nano /etc/smb-eos.creds
```

Example contents:

```ini
username=YOUR_SMB_USER
password=YOUR_SMB_PASSWORD
domain=
```

If the NAS is joined to a domain, set `domain=` as provided by IT.

```bash
sudo chmod 600 /etc/smb-eos.creds
sudo chown root:root /etc/smb-eos.creds
```

### 3.4 Test mount (one line)

Replace host and share name:

```bash
sudo mount -t cifs //172.30.1.94/APPs /mnt/synology/eos -o credentials=/etc/smb-eos.creds,vers=3.0,uid=$(id -u),gid=$(id -g),iocharset=utf8
```

There must be a **space** between `//host/share` and `/mnt/synology/eos`. If mount fails, try `vers=2.1` or `vers=3.1.1` per DSM/IT.

### 3.5 Persistent mount (`/etc/fstab`)

Use the UID/GID of the user that runs the Node process (or match Docker volume ownership later).

Example line:

```fstab
//172.30.1.94/APPs /mnt/synology/eos cifs credentials=/etc/smb-eos.creds,uid=1000,gid=1000,vers=3.0,iocharset=utf8,_netdev,nofail 0 0
```

Then:

```bash
sudo mount -a
```

### 3.6 Verify read/write

```bash
ls -la /mnt/synology/eos
touch /mnt/synology/eos/.eos-write-test && rm /mnt/synology/eos/.eos-write-test
```

---

## 4. Folder layout on the share (recommended)

Keep environments and projects separated on the same share:

```text
APPs/
  dev/
    EOS/          ← development integration (this app)
  prod/
    EOS/          ← example production tree
```

EOS **Option B** maps this to:

| Variable | Example (dev) |
|----------|----------------|
| `STORAGE_SYNOLOGY_ROOT` | `/mnt/synology/eos` |
| `STORAGE_DEPLOYMENT` | `dev` |
| `STORAGE_PROJECT_SLUG` | `EOS` |

Resolved base path: **`/mnt/synology/eos/dev/EOS`**

Create the folders on the NAS (File Station) or after first mount:

```bash
sudo mkdir -p /mnt/synology/eos/dev/EOS
```

Another application later can use e.g. `dev/OTHER_APP/` with its own `STORAGE_PROJECT_SLUG`.

---

## 5. EOS backend configuration

### 5.1 Option B (recommended)

In **`backend/.env`** (or project root `.env` when running Node without Docker—see [config loading](../backend/src/config/index.ts)):

```env
STORAGE_TYPE=local
STORAGE_SYNOLOGY_ROOT=/mnt/synology/eos
STORAGE_DEPLOYMENT=dev
STORAGE_PROJECT_SLUG=EOS
```

Do **not** set `STORAGE_LOCAL_PATH` when using Option B unless you intend to override the composed path.

**Local development without a NAS:** comment out the three variables above and set:

```env
STORAGE_LOCAL_PATH=./uploads
```

### 5.2 Option A — explicit path

If you prefer a single variable:

```env
STORAGE_LOCAL_PATH=/mnt/synology/eos/dev/EOS
```

If `STORAGE_LOCAL_PATH` is set, it **wins** over Option B.

Full reference: **`backend/.env.example`**.

---

## 6. Docker (staging / production backend)

The backend container must see the **same** files as the host mount. Otherwise `/mnt/synology/eos/...` inside the container is only local disk, not the NAS.

### 6.1 Bind mount

In **`docker-compose.staging.backend.yml`** and **`docker-compose.production.backend.yml`** the host path is bound into the container:

```yaml
volumes:
  - ${STORAGE_HOST_MOUNT:-/mnt/synology/eos}:/mnt/synology/eos
```

- Set **`STORAGE_HOST_MOUNT`** in the project **`.env`** (Compose substitutes variables) if the host uses a path other than `/mnt/synology/eos`.

### 6.2 Env file for Compose

`docker-compose.staging.backend.yml` and `docker-compose.production.backend.yml` load **`./backend/.env`**. Ensure it contains:

- Database and JWT settings, and  
- **Option B** storage variables (or `STORAGE_LOCAL_PATH`), matching the path under `/mnt/synology/eos/...`.

Copy from **`backend/.env.example`** and adjust secrets.

### 6.3 Recreate the backend after changes

```bash
docker compose -f docker-compose.staging.backend.yml up -d --force-recreate backend
```

```bash
docker compose -f docker-compose.production.backend.yml up -d --force-recreate backend
```

### 6.4 Verify inside the container

```bash
docker exec eos-backend-staging ls -la /mnt/synology/eos/dev/EOS
```

This should match **`ls`** on the host for the same path.

---

## 7. End-to-end verification

1. **API running** with correct env (see logs for config errors).  
2. **Upload** a shipment document from the UI or API.  
3. **Host:**  
   `ls -R /mnt/synology/eos/dev/EOS`  
4. **Synology File Station:** browse `APPs → dev → EOS → …` (filing subfolders are created by the app).  
5. **Download** the same document in the app.

---

## 8. Troubleshooting

| Symptom | What to check |
|---------|----------------|
| Mount fails | Firewall **TCP 445**; correct share name; `vers=`; credentials file permissions (`600`). |
| `mount error (16) Device or resource busy` | Share already mounted; `umount` or use another mount point; see `mount \| grep cifs`. |
| Files in `docker exec` but not in File Station | Missing **bind mount**; container was writing to its own filesystem. Fix compose volumes and recreate. |
| Explorer shows empty folder | Wrong subfolder (e.g. `Exim` vs `EOS`); confirm `STORAGE_*` and actual path under `APPs`. |
| Wrong file type on DSM for PDFs | Resolved in app: stored name uses **`name_<uuid>.pdf`** (UUID before extension). Old `name.pdf_<uuid>` files may look odd in DSM until renamed or re-uploaded. |
| Cloud server cannot reach NAS | Use site-to-site VPN or private network; do not expose SMB on the public internet. |

---

## 9. Security notes

- Restrict the SMB user to the minimum folders required.  
- Keep `/etc/smb-eos.creds` mode `600`.  
- Rotate passwords if leaked.  
- Prefer backup/snapshots on the Synology per IT policy.

---

## 10. Related files

| File | Purpose |
|------|---------|
| `backend/.env.example` | Storage variables (Option B, A, C) |
| Root `.env.example` | `STORAGE_HOST_MOUNT` / `STORAGE_HOST_BIND` for Compose |
| `docker-compose.staging.backend.yml` | Staging backend + NAS bind |
| `docker-compose.production.backend.yml` | Production backend + Postgres + NAS bind |
| `docker-compose.production.frontend.yml` | Production frontend-only stack (for separate frontend host) |
| `docs/TSD.md` | Broader document storage strategy |
