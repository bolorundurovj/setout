# Troubleshooting

## The Makefile stops complaining about node_modules

You have driven the same checkout from both Windows and WSL. Linux yarn installs
native binaries that Windows tools cannot load, and the reverse is equally true.
The Makefile detects this and stops rather than letting you debug a stranger
error further along.

Delete `node_modules` at the repository root and in `apps/web`, then run `make
setup` again from the platform you intend to use, and use only that one.

## make sdk cannot find ng-openapi-gen

Yarn workspaces link binaries into the root `node_modules/.bin`, and installing
from inside a workspace member re-links it. Run `yarn install` at the repository
root.

## make check fails on SDK drift

```
Error: the committed SDK is stale. Run make sdk and commit the result.
```

The committed client no longer matches the schema the API produces. That is the
check doing its job: run `make sdk` and commit what changes. If nothing changes,
you have edited `packages/api-client/src` by hand; that directory is generated
output.

## The startup log says the database is behind

Migrations are applied on start, so this resolves itself in the normal case. If
it persists, run `make migrate` and read the error: a migration that fails leaves
the database on the last good step.

Remember that the test suite builds its schema from the models rather than the
migrations, so green tests do not prove a migration applies. `make migrate`
against a fresh database is the check that does.

## Restore refuses my archive

```
the archive and the running configuration disagree about the engine
```

A Postgres dump cannot be poured into SQLite, or the reverse. Use the record
export from Settings → Backup, which carries rows rather than a database file
and works across engines. See [Backup and restore](backup-and-restore.md).

## The port is already taken

The API defaults to 8474; set `SETOUT_PORT` to move it. The compose stack
publishes Postgres on 5433 rather than 5432 so it does not fight a Postgres
already installed, and MinIO on 9000 with its console on 9001. All three are
configurable in the same place.

## Sessions do not stick, or sign-in fails over the network

If you reach Setout over anything but localhost, the session cookie needs
`SETOUT_COOKIE_SECURE=true` and HTTPS in front. Check `SETOUT_CORS_ORIGINS`
lists the origin you actually serve from.

## The startup log warns about the secret key

`SETOUT_SECRET_KEY` is still `change-me`. It signs session cookies, so anyone who
knows it can forge a session. Set a long random value and restart; everyone signs
in again.

## Time zone errors on Windows or in a slim container

```
ZoneInfoNotFoundError: 'No time zone found with key UTC'
```

The system has no zone database. The `tzdata` package is pinned for exactly this
reason. If you see it, dependencies were not installed from the lockfile. Run
`make setup`.
