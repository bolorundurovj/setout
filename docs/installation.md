# Installation

Setout runs as one container on one port, or from a checkout on your own
machine. Both give you the same application; the container is the shorter road.

## With Docker

```bash
docker compose -f docker/docker-compose.yml pull
docker compose -f docker/docker-compose.yml up -d
```

That brings up the app on 8474, Postgres for the record, and MinIO for the
attachments, with the bucket made before the app starts. The MinIO console is on
9001.

The image is published to `ghcr.io/bolorundurovj/setout` for amd64 and arm64, so
a Raspberry Pi or an ARM server pulls the same way an ordinary one does.

| Tag | What it is |
| --- | --- |
| `latest` | The most recent release |
| `1.2.3` | That exact release, which is what to pin in anything you care about |
| `1.2`, `1` | The newest patch or minor within that line |
| `edge` | Built from the newest commit on `master`, untested by a release |

Set `SETOUT_IMAGE_TAG` to pin one:

```bash
SETOUT_IMAGE_TAG=1.2.3 docker compose -f docker/docker-compose.yml up -d
```

The compose file still carries a `build:` block, so `docker compose build` gives
you your own image from the checkout instead.

Put any of the compose variables in a `.env` file beside the compose file. The
defaults exist so the stack comes up on one command, not because they are safe:
**change `SETOUT_SECRET_KEY` and the MinIO password before putting this anywhere
other people can reach.** See [Configuration](configuration.md) for the full
list, and [Deployment](deployment.md) before exposing it.

To run the container against SQLite and local files instead, unset
`SETOUT_DATABASE_URL` and set `SETOUT_STORAGE_BACKEND=local` on the `setout`
service. The database and the attachments then both live under
`SETOUT_DATA_DIR`, which is on a volume.

## From a checkout

You need:

- uv, the Python dependency manager
- Node 24.15.0 or later, which is what the workspace declares; Angular 22 also
  accepts 22.22.3 or later
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

Open the web app. The first run walks you through setting up the local admin
account with a passphrase. There are no roles and no email is required: one
person, one passphrase. Signing in sets a session cookie on your device.

If you are reaching Setout over anything other than localhost, set
`SETOUT_COOKIE_SECURE=true` and put it behind HTTPS, or the session cookie
travels in the clear.

## Checking it came up

The API answers `/healthz` with the version and the database status. Migrations
are applied on start, and the startup log says so plainly when the database was
behind.
