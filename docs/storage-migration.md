# MinIO to RustFS Storage Migration

Starting with Setout 2.4.0, the default S3 object storage provider shifted from MinIO to [RustFS](https://github.com/rustfs/rustfs). Setout includes an automated migration engine that automatically verifies and transfers all database-tracked assets (attachments and land documents) to RustFS on boot with SHA-256 integrity validation.

This guide provides:
1. The `docker-compose.yml` to use **during** the migration.
2. The clean `docker-compose.yml` to use **after** migration succeeds.
3. Troubleshooting solutions for common migration issues.

---

## Migration Overview

The migration process:
1. Boots the database, the new `s3` (RustFS) service, and a temporary `minio` service.
2. The `setout` service connects to the running MinIO service via its S3 API (`SETOUT_LEGACY_S3_ENDPOINT_URL`).
3. For every attachment and land document in the database, Setout fetches the object from MinIO, verifies its SHA-256 hash against the database record, writes it into RustFS, and confirms it exists in RustFS.
4. When 100% of assets are verified, Setout writes a completion marker (`.storage_migration_complete`) and logs:
   ```text
   [Storage Migration] 100% of assets verified (X/X, Y newly migrated). Legacy MinIO storage can now be safely removed.
   ```
5. Once confirmed, you remove the `minio` service and legacy volume.

---

## 1. Docker Compose During Migration

Use this configuration when upgrading an existing MinIO installation. It runs the temporary `minio` service alongside `s3` (RustFS) without publishing MinIO's ports to the host (avoiding port 9000 conflicts).

```yaml
name: setout

services:
  setout:
    image: ghcr.io/bolorundurovj/setout:${SETOUT_IMAGE_TAG:-latest}
    build:
      context: ..
      dockerfile: docker/Dockerfile
    ports:
      - "${SETOUT_PORT:-8474}:8474"
    environment:
      SETOUT_DATABASE_URL: postgres://${POSTGRES_USER:-setout}:${POSTGRES_PASSWORD:-setout}@db:5432/${POSTGRES_DB:-setout}
      SETOUT_SECRET_KEY: ${SETOUT_SECRET_KEY:-change-me}
      
      # Target Storage: RustFS
      SETOUT_STORAGE_BACKEND: s3
      SETOUT_S3_BUCKET: ${STORAGE_BUCKET:-${MINIO_BUCKET:-setout}}
      SETOUT_S3_ENDPOINT_URL: http://s3:9000
      SETOUT_S3_PUBLIC_URL: ${SETOUT_S3_PUBLIC_URL:-http://localhost:9000}
      SETOUT_S3_REGION: us-east-1
      SETOUT_S3_ACCESS_KEY_ID: ${STORAGE_ACCESS_KEY:-${MINIO_ROOT_USER:-setout}}
      SETOUT_S3_SECRET_ACCESS_KEY: ${STORAGE_SECRET_KEY:-${MINIO_ROOT_PASSWORD:-setout-secret}}
      SETOUT_S3_USE_PATH_STYLE: "true"
      SETOUT_S3_AUTO_CREATE_BUCKET: "true"

      # Legacy Migration Source: MinIO S3 API
      SETOUT_LEGACY_S3_ENDPOINT_URL: http://minio:9000
      SETOUT_LEGACY_S3_ACCESS_KEY_ID: ${MINIO_ROOT_USER:-setout}
      SETOUT_LEGACY_S3_SECRET_ACCESS_KEY: ${MINIO_ROOT_PASSWORD:-setout-secret}
    volumes:
      - setout-data:/var/lib/setout
    depends_on:
      db:
        condition: service_healthy
      s3:
        condition: service_started
      minio:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:17.11
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-setout}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-setout}
      POSTGRES_DB: ${POSTGRES_DB:-setout}
    ports:
      - "${POSTGRES_PORT:-5433}:5432"
    volumes:
      - setout-postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-setout} -d ${POSTGRES_DB:-setout}"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped

  s3:
    image: rustfs/rustfs:${RUSTFS_IMAGE_TAG:-latest}
    environment:
      RUSTFS_ACCESS_KEY: ${STORAGE_ACCESS_KEY:-${MINIO_ROOT_USER:-setout}}
      RUSTFS_SECRET_KEY: ${STORAGE_SECRET_KEY:-${MINIO_ROOT_PASSWORD:-setout-secret}}
      RUSTFS_ADDRESS: ":9000"
      RUSTFS_CONSOLE_ADDRESS: ":9001"
      RUSTFS_CONSOLE_ENABLE: "true"
    ports:
      - "${STORAGE_PORT:-9000}:9000"
      - "${STORAGE_CONSOLE_PORT:-9001}:9001"
    volumes:
      - setout-storage:/data
    restart: unless-stopped

  # Temporary MinIO container to serve legacy files over S3
  minio:
    image: minio/minio:RELEASE.2025-09-07T16-13-09Z
    command: server /data
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-setout}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-setout-secret}
    volumes:
      - setout-minio:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 5s
      retries: 20
    restart: unless-stopped

volumes:
  setout-data:
  setout-postgres:
  setout-storage:
  setout-minio:
```

### Environment File (`.env`)

Save this as `.env` beside your compose file (or copy from [`docker/.env.example`](../docker/.env.example)):

```dotenv
# Setout Application
SETOUT_IMAGE_TAG=latest
SETOUT_PORT=8474
SETOUT_SECRET_KEY=change-me
SETOUT_S3_PUBLIC_URL=http://localhost:9000

# PostgreSQL Database
POSTGRES_USER=setout
POSTGRES_PASSWORD=setout
POSTGRES_DB=setout
POSTGRES_PORT=5433

# RustFS (Target Storage)
STORAGE_ACCESS_KEY=setout
STORAGE_SECRET_KEY=setout-secret
STORAGE_BUCKET=setout
STORAGE_PORT=9000
STORAGE_CONSOLE_PORT=9001
RUSTFS_IMAGE_TAG=latest

# Legacy MinIO Source (Used during migration)
MINIO_ROOT_USER=setout
MINIO_ROOT_PASSWORD=setout-secret
MINIO_BUCKET=setout
```

### Running the Migration

1. Start the services:
   ```bash
   docker compose up -d
   ```
2. Follow the logs:
   ```bash
   docker compose logs -f setout
   ```
3. Look for the completion message:
   ```text
   INFO:setout.storage.migrate:[Storage Migration] Checking for legacy assets to migrate...
   INFO:setout.storage.migrate:[Storage Migration] 100% of assets verified (X/X, Y newly migrated). Legacy MinIO storage can now be safely removed.
   ```

---

## 2. Docker Compose After Migration (Clean State)

Once the migration confirms 100% verification, you can clean up your compose stack and remove the old MinIO volume.

### Clean `docker-compose.yml`

```yaml
name: setout

services:
  setout:
    image: ghcr.io/bolorundurovj/setout:${SETOUT_IMAGE_TAG:-latest}
    build:
      context: ..
      dockerfile: docker/Dockerfile
    ports:
      - "${SETOUT_PORT:-8474}:8474"
    environment:
      SETOUT_DATABASE_URL: postgres://${POSTGRES_USER:-setout}:${POSTGRES_PASSWORD:-setout}@db:5432/${POSTGRES_DB:-setout}
      SETOUT_SECRET_KEY: ${SETOUT_SECRET_KEY:-change-me}
      SETOUT_STORAGE_BACKEND: s3
      SETOUT_S3_BUCKET: ${STORAGE_BUCKET:-${MINIO_BUCKET:-setout}}
      SETOUT_S3_ENDPOINT_URL: http://s3:9000
      SETOUT_S3_PUBLIC_URL: ${SETOUT_S3_PUBLIC_URL:-http://localhost:9000}
      SETOUT_S3_REGION: us-east-1
      SETOUT_S3_ACCESS_KEY_ID: ${STORAGE_ACCESS_KEY:-${MINIO_ROOT_USER:-setout}}
      SETOUT_S3_SECRET_ACCESS_KEY: ${STORAGE_SECRET_KEY:-${MINIO_ROOT_PASSWORD:-setout-secret}}
      SETOUT_S3_USE_PATH_STYLE: "true"
      SETOUT_S3_AUTO_CREATE_BUCKET: "true"
    volumes:
      - setout-data:/var/lib/setout
    depends_on:
      db:
        condition: service_healthy
      s3:
        condition: service_started
    restart: unless-stopped

  db:
    image: postgres:17.11
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-setout}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-setout}
      POSTGRES_DB: ${POSTGRES_DB:-setout}
    ports:
      - "${POSTGRES_PORT:-5433}:5432"
    volumes:
      - setout-postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-setout} -d ${POSTGRES_DB:-setout}"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped

  s3:
    image: rustfs/rustfs:${RUSTFS_IMAGE_TAG:-latest}
    environment:
      RUSTFS_ACCESS_KEY: ${STORAGE_ACCESS_KEY:-${MINIO_ROOT_USER:-setout}}
      RUSTFS_SECRET_KEY: ${STORAGE_SECRET_KEY:-${MINIO_ROOT_PASSWORD:-setout-secret}}
      RUSTFS_ADDRESS: ":9000"
      RUSTFS_CONSOLE_ADDRESS: ":9001"
      RUSTFS_CONSOLE_ENABLE: "true"
    ports:
      - "${STORAGE_PORT:-9000}:9000"
      - "${STORAGE_CONSOLE_PORT:-9001}:9001"
    volumes:
      - setout-storage:/data
    restart: unless-stopped

volumes:
  setout-data:
  setout-postgres:
  setout-storage:
```

### Deleting the Legacy Volume

After applying the clean configuration (`docker compose up -d`), safely delete the legacy MinIO volume:

```bash
docker volume rm setout_setout-minio
```
*(or `docker volume rm setout-minio`, depending on your compose project naming)*.

---

## 3. Troubleshooting & Common Failures

### Issue 1: No migration logs appear at all on startup

* **Symptoms**: Setout starts up, but you never see `[Storage Migration] Checking for legacy assets...` in the logs.
* **Cause**: On its very first run, if Setout detects neither `SETOUT_LEGACY_S3_ENDPOINT_URL` nor an existing `SETOUT_LEGACY_STORAGE_DIR`, it assumes a fresh installation and writes `no-legacy-source` to `/var/lib/setout/.storage_migration_complete`. Once this marker file exists, Setout skips migration permanently on subsequent boots.
* **Remedy**:
  1. Remove the marker file from the running container:
     ```bash
     docker compose exec setout rm -f /var/lib/setout/.storage_migration_complete
     ```
  2. Verify that `SETOUT_LEGACY_S3_ENDPOINT_URL: http://minio:9000` is defined in `services.setout.environment`.
  3. Restart Setout:
     ```bash
     docker compose restart setout
     ```

---

### Issue 2: `[Storage Migration] Missing legacy asset for key ...` (Incomplete migration)

* **Symptoms**: Setout logs:
  ```text
  WARNING: [Storage Migration] Missing legacy asset for key <hash>.<ext>
  WARNING: [Storage Migration] Incomplete migration: 0 verified, 13 failed out of 13 total. Leaving legacy source intact for retry on next boot.
  ```
* **Cause**: This happens when trying to mount `setout-minio` directly into the `setout` container (using raw filesystem access `SETOUT_LEGACY_STORAGE_DIR`). Modern MinIO versions (`RELEASE.2022+` / `RELEASE.2025+`) use the `xlMetaV2` erasure-coded format:
  - Files $\le 128$ KiB are inlined directly within binary `xl.meta` files (no separate file exists on disk).
  - Files $> 128$ KiB are stored under versioned UUID directories (`<key>/<uuid>/part.1`), not directly at `<key>/part.1`.
* **Remedy**: Do not attempt direct volume inspection. Run the `minio` container service alongside RustFS and configure `SETOUT_LEGACY_S3_ENDPOINT_URL: http://minio:9000` so that MinIO reads its own `xl.meta` and serves the files over S3.

---

### Issue 3: Using `env_file: - .env` without explicit `environment:` mappings

* **Symptoms**: Legacy credentials like `MINIO_ROOT_USER` or `MINIO_BUCKET` exist in `.env`, but Setout still cannot connect to MinIO.
* **Cause**: Setout requires variables prefixed with `SETOUT_` (e.g. `SETOUT_LEGACY_S3_ACCESS_KEY_ID`). Without the `environment:` section in `docker-compose.yml` to map your `.env` variables to `SETOUT_*`, Setout receives empty strings.
* **Remedy**: Ensure the `environment:` block under `setout` explicitly maps `SETOUT_LEGACY_S3_ACCESS_KEY_ID: ${MINIO_ROOT_USER:-setout}`, etc., as shown in the migration template above.

---

### Issue 4: Port 9000 conflict on host

* **Symptoms**: `docker compose up` errors with `bind: address already in use` on port `9000`.
* **Cause**: Both MinIO and RustFS default to port `9000`.
* **Remedy**: Omit the `ports:` block from the temporary `minio` service. Setout reaches MinIO directly over Docker's internal network at `http://minio:9000`, so MinIO does not need to publish port 9000 to the host.
