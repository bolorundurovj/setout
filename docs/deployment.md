# Deployment

Setout ships as one image: the API serves the built frontend, applies migrations
on start, runs as a non-root user, and persists `SETOUT_DATA_DIR` on a volume.

## Before you expose it

| Do this | Why |
| --- | --- |
| Set `SETOUT_SECRET_KEY` to a long random value | It signs session cookies; anyone who knows it can forge a session. The app warns on startup while it is the default |
| Set `SETOUT_COOKIE_SECURE=true` | Otherwise the session cookie travels over plain HTTP |
| Change `MINIO_ROOT_PASSWORD` and the Postgres password | The compose defaults exist so the stack comes up in one command, not because they are safe |
| Put it behind HTTPS | See below |
| Set `SETOUT_CORS_ORIGINS` to the origin you actually serve from | It defaults to the local dev server |

## Behind a reverse proxy

Terminate TLS at your proxy and pass through to the app's port, forwarding
`Host` and `X-Forwarded-*`. Nothing in Setout needs to know its own public URL:
the frontend calls the API on a relative path, so a single origin works with no
configuration.

Set `SETOUT_COOKIE_SECURE=true` once TLS is in front, and keep
`SETOUT_CORS_ORIGINS` to the origin you serve.

## Postgres

Point `SETOUT_DATABASE_URL` at `postgres://user:password@host:5432/setout`. The
compose stack publishes Postgres on host port 5433 by default, kept off 5432 so
it does not fight a Postgres already installed on the machine.

Moving an existing SQLite install to Postgres is a data move, not a file copy:
use the record export in [Backup and restore](backup-and-restore.md). A restore
refuses a mismatched engine on purpose.

## Attachments in a bucket

Set `SETOUT_STORAGE_BACKEND=s3` with the bucket, credentials and, for anything
that is not Amazon, `SETOUT_S3_ENDPOINT_URL`. MinIO also wants
`SETOUT_S3_USE_PATH_STYLE=true`.

A bucket is outside the backup archive. Back it up where it lives.

## Upgrades

Pull the new image and restart. Migrations run on start and the log reports when
the database was behind. Take a backup first: the shell archive, not the record
export, since that is the copy that can put the install back exactly as it was.

## Checking on it

`/healthz` answers with the version and the database status, which is the right
thing to point a monitor at.
