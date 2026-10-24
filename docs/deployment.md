# Deployment

Setout ships as one image: the API serves the built frontend, applies migrations on startup, runs as a non-root user, and persists `SETOUT_DATA_DIR` on a volume.

## Before you expose it

| Do this | Why |
| --- | --- |
| Set `SETOUT_SECRET_KEY` to a long random value | It signs session cookies, so anyone who knows it can forge a session. The app warns on startup while it is the default |
| Set `SETOUT_COOKIE_SECURE=true` | Otherwise the session cookie is sent over plain HTTP |
| Change `STORAGE_SECRET_KEY` (or `MINIO_ROOT_PASSWORD`) and the Postgres password | The compose defaults exist so that the stack starts with one command. They are not suitable for production |
| Put it behind HTTPS | See below |
| Set `SETOUT_CORS_ORIGINS` to the origin you serve from | It defaults to the local dev server |
| No action needed for passphrase guessing | Repeated wrong passphrases are already delayed and then refused with `429`. There is no account lockout, and the settings that control the delay are in [configuration](configuration.md). If you lose the passphrase, reset it with the recovery command in [troubleshooting](troubleshooting.md#i-forgot-the-admin-passphrase) |

## Behind a reverse proxy

Terminate TLS at your proxy and pass through to the app's port, forwarding
`Host` and `X-Forwarded-*`. Nothing in Setout needs to know its own public URL:
the frontend calls the API on a relative path, so a single origin works with no
configuration.

Set `SETOUT_COOKIE_SECURE=true` once TLS is in front, and keep
`SETOUT_CORS_ORIGINS` to the origin you serve.

## Postgres

Point `SETOUT_DATABASE_URL` at `postgres://user:password@host:5432/setout`. The
compose stack publishes Postgres on host port 5433 by default, kept off 5432 to avoid clashing with an existing Postgres on the machine.

Moving an existing SQLite installation to Postgres is a data migration, not a file copy. Use the in-app backup described in [Backup and restore](backup-and-restore.md). A server backup restore rejects a mismatched engine by design.

## Attachments in a bucket

Set `SETOUT_STORAGE_BACKEND=s3` with the bucket, credentials and, for anything
that is not Amazon, `SETOUT_S3_ENDPOINT_URL`. RustFS also wants
`SETOUT_S3_USE_PATH_STYLE=true`.

When the API reaches RustFS on an internal address that browsers cannot resolve,
set `SETOUT_S3_PUBLIC_URL` to the address they can reach. In the compose stack
this is `http://<host>:9000` by default; change it when Setout is accessed from
another machine.

A bucket is not included in the server backup. Back it up separately.

## Upgrades

Pull the new image and restart. Migrations run on startup and the log reports when the database was behind. Take a backup first: use a server backup rather than the in-app backup, because only a server backup restores the installation exactly as it was.

### Upgrading from MinIO to RustFS

If your deployment previously used MinIO in the compose stack, upgrading requires **no manual intervention**:
1. When you run `docker compose up -d`, Setout automatically starts the new `s3` (RustFS) service and mounts your legacy `setout-minio` volume read-only.
2. On boot, Setout verifies all existing attachments against the database, copies them to RustFS, and validates their SHA-256 checksums.
3. Check the startup log for:
   `[Storage Migration] 100% of assets verified (X/X, Y newly migrated). Legacy MinIO storage can now be safely removed.`
4. Once verified, you can safely clean up the old volume: `docker volume rm setout-minio`.

If your legacy MinIO deployment used inline erasure storage or logs report missing assets, see the dedicated [MinIO to RustFS Migration Guide](storage-migration.md) for compose templates before and after migration as well as troubleshooting tips.

Pin a version rather than tracking `latest`, so that upgrades are deliberate:

```bash
SETOUT_IMAGE_TAG=1.2.3 docker compose -f docker/docker-compose.yml up -d
```

Read [the release notes](https://github.com/bolorundurovj/setout/releases) before upgrading. Every image carries
`org.opencontainers.image.version` and `.revision` labels, so `docker inspect` reports exactly which commit is running:

```bash
docker inspect ghcr.io/bolorundurovj/setout:1.2.3 \
  --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'
```

`edge` exists for testing a fix before it is released. It is the latest commit on `master` and is not suitable for production.

Every tag goes to Docker Hub as `bolorundurovj/setout` as well, pushed as the
same manifest, so a digest pinned against one registry matches the other.

Each GHCR image also carries a signed build provenance attestation: which workflow
built it, from which repository and at which commit. It distinguishes an image built from this source from one pushed with a stolen token:

```bash
gh attestation verify oci://ghcr.io/bolorundurovj/setout:1.2.3 \
  --repo bolorundurovj/setout
```

The attestation is attached to the image in GHCR rather than stored inside it, so it
is not copied to Docker Hub. Verification runs against GHCR, and the
digests are identical, so the result also applies to the Docker Hub image.

## Health checks

`/healthz` returns the version and the database status. Point your monitoring at it.
