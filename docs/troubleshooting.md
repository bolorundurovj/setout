# Troubleshooting

## The Makefile stops with a node_modules error

The same checkout has been used from both Windows and WSL. Linux yarn installs native binaries that Windows tools cannot load, and the reverse is also true. The Makefile detects this and stops early rather than failing with a less obvious error later.

Delete `node_modules` at the repository root and in `apps/web`, then run `make
setup` again from the platform you intend to use, and use only that one.

## make sdk cannot find ng-openapi-gen

Yarn workspaces link binaries into the root `node_modules/.bin`, and installing
from inside a workspace member re-links it. Run `yarn install` at the repository
root.

## The startup log says the database is behind

Migrations are applied on startup, so this usually resolves itself. If it persists, run `make migrate` and read the error. A failed migration leaves the database on the last successful step.

The test suite builds its schema from the models rather than the migrations, so passing tests do not prove a migration applies. Run `make migrate` against a fresh database to verify.

## Restore refuses my archive

```
the archive and the running configuration disagree about the engine
```

A Postgres dump cannot be loaded into SQLite, or the reverse. Use the data export from Settings → Backup, which carries rows rather than a database file and works across engines. See [Backup and restore](backup-and-restore.md).

## The port is already taken

The API defaults to 8474; set `SETOUT_PORT` to move it. The compose stack publishes Postgres on 5433 rather than 5432 to avoid clashing with an existing Postgres, and MinIO on 9000 with its console on 9001. All three are
configurable in the same place.

## Sessions do not stick, or sign-in fails over the network

If you reach Setout over anything but localhost, the session cookie needs
`SETOUT_COOKIE_SECURE=true` and HTTPS in front. Check that `SETOUT_CORS_ORIGINS` lists the origin you serve from.

## The startup log warns about the secret key

`SETOUT_SECRET_KEY` is still `change-me`. It signs session cookies, so anyone who knows it can forge a session. Set a long random value and restart. Every device signs in again.

## Time zone errors on Windows or in a slim container

```
ZoneInfoNotFoundError: 'No time zone found with key UTC'
```

The system has no time zone database. The `tzdata` package is pinned for this reason. If you see this error, dependencies were not installed from the lockfile. Run `make setup`.

## I forgot the admin passphrase

Reset the admin passphrase without editing the database directly.

### Method 1: Recovery text file (recommended for Docker and headless servers)

Create a file named `reset-passphrase.txt` in the repository root or data directory (`/var/lib/setout/` in Docker):

```bash
echo "your-new-secure-passphrase" > reset-passphrase.txt
```

You can optionally specify a username: `Admin:your-new-secure-passphrase`.

Then either restart the server (which detects and consumes it on startup) or run:

```bash
make reset-passphrase
```

In Docker:

```bash
docker compose -f docker/docker-compose.yml exec setout uv run python -m setout.cli reset-passphrase
```

The recovery file is consumed, the passphrase is reset, any failed login lockout is cleared, and **the file is automatically deleted** so plaintext credentials do not linger on disk.

### Method 2: Interactive prompt (local development)

If no `reset-passphrase.txt` file exists, running `make reset-passphrase` prompts securely in your terminal:

```bash
make reset-passphrase
```

You can also pass a custom file path with `file=`:

```bash
make reset-passphrase file=/path/to/my-secret.txt
```

