# Installation

Setout runs as one container on one port, or from a checkout on your own machine. Both give you the same application. The container is quicker to start.

## With Docker

```bash
docker compose -f docker/docker-compose.yml pull
docker compose -f docker/docker-compose.yml up -d
```

That brings up the app on 8474, Postgres for the database, and MinIO for attachments, with the bucket created before the app starts. The MinIO console is on
9001.

The image is published to `ghcr.io/bolorundurovj/setout` for amd64 and arm64, so a Raspberry Pi or an ARM server pulls the same way any other machine does. It is
published to Docker Hub as `bolorundurovj/setout` at the same time, with the same
tags and the same digests, so either name pulls the identical image.

| Tag | What it is |
| --- | --- |
| `latest` | The most recent release |
| `1.2.3` | That exact release. Pin this in production |
| `1.2`, `1` | The newest patch or minor within that line |
| `edge` | Built from the newest commit on `master`, not part of a release |

Set `SETOUT_IMAGE_TAG` to pin one:

```bash
SETOUT_IMAGE_TAG=1.2.3 docker compose -f docker/docker-compose.yml up -d
```

The compose file also carries a `build:` block, so `docker compose build` builds your own image from the checkout.

Put any of the compose variables in a `.env` file beside the compose file. The defaults exist so the stack starts with one command. They are not production defaults: **change `SETOUT_SECRET_KEY` and the MinIO password before exposing this to anyone else.** See [Configuration](configuration.md) for the full
list, and [Deployment](deployment.md) before exposing it.

To run the container against SQLite and local files instead, unset
`SETOUT_DATABASE_URL` and set `SETOUT_STORAGE_BACKEND=local` on the `setout`
service. The database and attachments then both live under `SETOUT_DATA_DIR`, which is on a volume.

## From a checkout

You need:

- uv, the Python dependency manager
- Node 24.15.0 or later, as declared by the workspace. Angular 22 also accepts 22.22.3 or later
- Yarn, through `corepack enable`
- GNU Make
- Docker, only if you want to build the image

```bash
make setup    # install backend and frontend
make dev      # run the API and the web app together
```

`make dev` runs the API, the web app, and the SDK watcher together, and stops
all three on Ctrl-C.

On Windows these work from cmd.exe, Cmder and Git Bash. Git for Windows is
required: the Makefile runs its recipes through Git's bash, because the other
`bash` on the PATH, `C:\Windows\System32\bash.exe`, starts WSL. Do not drive the
same checkout from WSL as well; see [Troubleshooting](troubleshooting.md).

## The first run

Open the web app. The first run guides you through creating the local admin account with a passphrase. There are no roles and no email is required: one passphrase. Signing in sets a session cookie on your device.

If you are reaching Setout over anything other than localhost, set `SETOUT_COOKIE_SECURE=true` and put it behind HTTPS, or the session cookie is sent unencrypted.

## Checking it started

The API answers `/healthz` with the version and the database status. Migrations are applied on startup, and the startup log reports when the database was behind.
