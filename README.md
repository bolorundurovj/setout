# Setout

Setout is a self-hosted web app for tracking construction spend on personal
building projects. It replaces a spreadsheet whose budget numbers were typed in
after the money was spent. In Setout a budget belongs to a scope and is set
deliberately; an expense records spend and can never write a budget value.

- Backend: Python, FastAPI, Tortoise ORM (with its built-in migration CLI).
- Frontend: Angular, consuming a TypeScript SDK generated from the OpenAPI schema.
- Database: SQLite by default, Postgres optional.
- Deployment: one container, one port, SQLite by default.

## Repository layout

```
apps/api           FastAPI service (uv, pyproject.toml)
apps/web           Angular application
packages/api-client  generated TypeScript SDK, committed to the repo
scripts            SDK generation, seed, backup, restore
docker             single-image Dockerfile and compose files
docs               feature list, testing spec, plan
```

## Requirements

- uv (Python dependency manager)
- Node 22.22.3 or later, or 24.15.0 or later (Angular 22 requires this)
- Yarn (via `corepack enable`)
- Docker (only for the container image)
- GNU Make

## Quick start

```bash
make setup    # install backend and frontend
make dev      # run the API and the web app together
```

On Windows these work from cmd.exe, Cmder and Git Bash. Git for Windows is
required: the Makefile runs its recipes through Git's bash, because the other
`bash` on the PATH, `C:\Windows\System32\bash.exe`, starts WSL. Do not drive the
same checkout from WSL as well. Its Linux yarn installs native binaries that
Windows tools cannot load, and the Makefile stops with an explanation if it
finds a `node_modules` built by the other platform.

Open the web app; on the first run you will be guided through setting up the local admin account with a secure passphrase. There are no roles or emails required: just one person and one passphrase. This will set a session cookie on your device.

## Recording spend

Open a project and pick **Add expense**. Three fields are required: what it was,
what it cost, and when. The screen is built to be used one handed on a phone at
the merchant's counter, so everything else sits behind **More details**.

- Give a **quantity** and a **rate each** and the total is calculated for you,
  the way a receipt reads: 600 nine inch blocks at 250 each. Fill in only one of
  them and you type the total yourself; what you entered is still kept.
- A **scope** is optional. Spend that has not been filed anywhere is still real
  spend, it counts towards the project total, and it is listed as unfiled so you
  can file it later. Recording a purchase is never blocked by a missing budget.
- A scope with children holds no spend of its own. File against the child.
- Amounts are stored as whole numbers in the currency's minor units, so nothing
  is lost to rounding. NGN 11,000.00 is stored as 1100000.
- Removing an expense is a soft delete. The row is kept and can be restored.

Behind **More details** an expense can also record what was bought, who it was
bought from, and who handed over the money. All three are optional.

## Items, vendors and people

These three belong to the installation, not to a project, because the same
supplier and the same bag of cement serve every house you build. Their money is
always reported per project, and figures from two currencies are never added
together.

- An **item** is something you buy more than once. It holds no prices of its
  own: every purchase filed against it with a rate builds its price history, so
  first paid, last paid, lowest, highest and the change between them are always
  read back from the expenses. Pick an item on the expense form and it shows
  what you last paid, in that project's currency, and offers it as the rate.
- A **vendor** is who you buy from. You can add one straight from the expense
  form with just a name, then fill in the trade and phone number later.
  Archiving a vendor keeps every expense filed against them; they simply stop
  coming up on the form.
- A **person** is someone who spends your money for you. Recording who paid is
  what makes it possible to work out what you owe them.

## The Makefile is the interface

```
make setup        install everything, backend and frontend
make dev          run API and web together with reload
make api          run the API alone
make web          run the web app alone
make lint         ruff, mypy, eslint, prettier, all in check mode
make format       write mode for the same tools
make test         all backend tests and the frontend unit tests
make test-unit    unit tests only, fast
make test-int     integration tests against a real database
make test-contract  schema and SDK contract tests
make sdk          regenerate the API client
make migration    tortoise makemigrations, accepting name=<name>
make migrate      tortoise migrate
make downgrade    roll back one migration
make seed         load the sample data
make backup       write the database and files into one dated archive
make restore      read a backup archive back (file=<archive>)
make check        lint, typecheck, all tests, coverage floor, SDK drift
make build        production build of both apps
make docker-build build the single deployment image
make clean        remove build artefacts and caches
```

## Configuration

Every backend variable uses the `SETOUT_` prefix. Copy `.env.example` to `.env`
and adjust. Local development defaults to `./data`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `SETOUT_PORT` | `8474` | Port the API listens on |
| `SETOUT_DATA_DIR` | `/var/lib/setout` (`./data` locally) | Database and uploaded files |
| `SETOUT_DATABASE_URL` | SQLite under the data dir | `sqlite://...` or `postgres://...` |
| `SETOUT_SECRET_KEY` | `change-me` | Session signing key; set a long random value |
| `SETOUT_LOG_LEVEL` | `info` | `debug`, `info`, `warning`, `error` |
| `SETOUT_CORS_ORIGINS` | `http://localhost:4200` | Comma separated origins allowed to call the API |
| `SETOUT_COOKIE_SECURE` | `false` | Send the session cookie over HTTPS only; turn on when not on localhost |
| `SETOUT_STORAGE_BACKEND` | `local` | Where attached files live: `local` or `s3` |
| `SETOUT_S3_BUCKET` | empty | Bucket name when the backend is `s3` |
| `SETOUT_S3_ENDPOINT_URL` | empty | Leave unset for Amazon; set it for MinIO, R2, B2, Spaces |
| `SETOUT_S3_REGION` | empty | Region, where the provider wants one |
| `SETOUT_S3_ACCESS_KEY_ID` | empty | Access key |
| `SETOUT_S3_SECRET_ACCESS_KEY` | empty | Secret key |
| `SETOUT_S3_PREFIX` | `attachments` | Folder inside the bucket |
| `SETOUT_S3_USE_PATH_STYLE` | `false` | Turn on for MinIO and anything else wanting the bucket in the path |
| `SETOUT_S3_LINK_SECONDS` | `300` | How long a link straight to the bucket stays good |
| `SETOUT_MAX_ATTACHMENT_BYTES` | `26214400` | Largest file that can be attached |

Attached files are named after the hash of their contents, so the same receipt
attached twice is stored once. They go on the disk under `SETOUT_DATA_DIR` by
default, which the backup archive already carries. Point
`SETOUT_STORAGE_BACKEND` at `s3` and they go to any S3 compatible bucket
instead: Amazon, MinIO, R2, B2, Spaces and the rest all speak it. A bucket is
outside the backup archive, so back the bucket up where it lives.

The frontend reads `apiBaseUrl` from its environment files. It defaults to a
relative path in production so the single container works with no configuration.

## Running with Docker

```bash
docker compose -f docker/docker-compose.yml up --build
```

One command brings up everything Setout needs: the app on 8474, Postgres for
the record, and MinIO for the attachments, with the bucket made before the app
starts. The MinIO console is on 9001.

| Variable | Default | Meaning |
| --- | --- | --- |
| `SETOUT_PORT` | `8474` | Port the app is published on |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `setout` | Database credentials |
| `MINIO_ROOT_USER` | `setout` | Bucket access key |
| `MINIO_ROOT_PASSWORD` | `setout-secret` | Bucket secret key |
| `MINIO_BUCKET` | `setout` | Bucket the attachments go in |
| `MINIO_PORT` / `MINIO_CONSOLE_PORT` | `9000` / `9001` | Published MinIO ports |
| `POSTGRES_PORT` | `5433` | Host port for Postgres, kept off 5432 so it does not fight a Postgres already installed |
| `SETOUT_SECRET_KEY` | `change-me` | Session signing key |

Put any of them in a `.env` file beside the compose file. **Change
`SETOUT_SECRET_KEY` and the MinIO password before putting this anywhere other
people can reach.** The defaults exist so the stack comes up on one command,
not because they are safe.

The image runs as a non-root user, persists `SETOUT_DATA_DIR` on a volume, and
applies migrations on start. The API answers `/healthz` with the version and
database status.

To run against SQLite and local files instead, unset `SETOUT_DATABASE_URL` and
set `SETOUT_STORAGE_BACKEND=local` on the `setout` service; the database and
the attachments then both live under `SETOUT_DATA_DIR`.

## Migrations

Setout uses the migration tool built into Tortoise ORM (not Aerich, not
Alembic). The config is resolved from `[tool.tortoise]` in
`apps/api/pyproject.toml`.

```bash
make migration name=add_projects   # create a migration
make migrate                        # apply pending migrations
make downgrade                      # roll back the last step
```

Migrations are also applied automatically when the app starts. The startup log
reports clearly when the database is behind.

## Backup and restore

There are two kinds of copy, and they are not interchangeable.

### The whole install, from the shell

```bash
make backup                                   # writes backups/setout-backup-<engine>-<stamp>.tar.gz
make restore file=backups/setout-backup-<engine>-<stamp>.tar.gz
```

The archive holds the database, everything else under `SETOUT_DATA_DIR`, and a
manifest naming the engine it came from. How the database is captured depends
on `SETOUT_DATABASE_URL`:

| Engine | Captured with | Needs |
| --- | --- | --- |
| SQLite | `sqlite3 .backup`, falling back to a file copy | `sqlite3` for a copy that is safe while running |
| Postgres | `pg_dump --format=custom` | `pg_dump` and `pg_restore` on the machine |

Stop the app before restoring. The restore asks before overwriting anything;
set `SETOUT_ASSUME_YES=1` for an unattended run, such as cron.

A restore refuses if the archive and the running configuration disagree about
the engine, because a Postgres dump cannot be poured into SQLite. To move
between engines, use the record export below, which carries rows rather than a
database file. Archives written before this split have no manifest and are read
as SQLite.

### The record, from the app

Settings → Backup writes a `.json` holding every row of the record, and takes
one back. It works against either engine and needs no shell access, but it is
rows only: no uploaded files, and no sessions, so everyone signs in again.

The restore inserts into whatever schema the server is running now, so it asks
you to confirm when the file came from a different version, and refuses a file
holding tables it does not know. It runs in one transaction: either every row
lands or the record is left exactly as it was. `GET /install/export` and
`POST /install/restore` are the same thing over the API.

Use the shell archive to protect the install, and the record export to move the
data somewhere else.

## The SDK

The frontend never handwrites an HTTP call. It imports a TypeScript SDK from
`packages/api-client` by path alias, and an ESLint rule forbids importing
`HttpClient` outside that layer. The SDK is generated from the backend OpenAPI
schema and committed to the repo. `make check` regenerates it and fails if the
committed output drifts.

See `docs/` for the feature list and the testing spec.
