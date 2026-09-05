# Configuration

Every backend variable uses the `SETOUT_` prefix. Copy `.env.example` to `.env`
and adjust. Local development defaults to `./data`.

## The application

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
| `SETOUT_MAP_TILE_URL` | OpenStreetMap | Tile template for the map on a plot of land |
| `SETOUT_MAP_ATTRIBUTION` | `© OpenStreetMap contributors` | Credit shown on the map |
| `SETOUT_GEOCODER_URL` | Nominatim | Turns a pin into an address. Empty turns the check off |
| `SETOUT_GEOCODER_EMAIL` | empty | Contact address, which Nominatim asks for beyond light use |

Two of these decide whether the install is safe to expose. `SETOUT_SECRET_KEY`
signs session cookies, so anyone who knows it can forge a session; the app warns
on startup while it is still the default. `SETOUT_COOKIE_SECURE` should be on
anywhere that is not localhost.

### The map

A plot of land can carry coordinates and a boundary, drawn on a map. The map is
[Leaflet](https://leafletjs.com), bundled with the app rather than fetched from a
CDN, and it needs no account and no API key.

The tiles behind it are a different matter. `SETOUT_MAP_TILE_URL` defaults to
OpenStreetMap's own servers, which is what makes the map work the moment you
install. Their [tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
asks that applications not send them bulk or heavy traffic, so if you are running
Setout for more than a household, point this at your own tile server:

```bash
SETOUT_MAP_TILE_URL=http://tiles.example.lan/{z}/{x}/{y}.png
SETOUT_MAP_ATTRIBUTION="Tiles by me, data © OpenStreetMap contributors"
```

The template takes `{z}`, `{x}` and `{y}`. Whatever you point it at, keep the
attribution honest about where the data came from.

### Checking a pin against its address

Setting a pin asks the geocoder what it calls that spot, so a plot recorded in one
town with a pin dropped in another says so. `SETOUT_GEOCODER_URL` defaults to
Nominatim, which is OpenStreetMap's own and needs no key. Their
[usage policy](https://operations.osmfoundation.org/policies/nominatim/) is a
request a second and no bulk, so Setout asks through the API rather than from the
browser: it sends a User-Agent of its own, holds to that rate, and remembers an
answer so the same pin is never looked up twice.

```bash
SETOUT_GEOCODER_URL=https://nominatim.example.lan
SETOUT_GEOCODER_EMAIL=you@example.com
SETOUT_GEOCODER_URL=          # empty turns the check off entirely
```

Nothing about this blocks saving. A geocoder that is off, slow or unreachable
means the check quietly does not happen.

Tiles and the geocoder are the only things Setout fetches from another host, and
only on a land page. When they cannot be reached the pin and the boundary still draw on a plain
background, so a site with no signal still shows you the shape of the plot.

## The compose stack

These are read by `docker/docker-compose.yml`, not by the application. Put them
in a `.env` file beside the compose file.

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

## Where attachments live

Attached files are named after the hash of their contents, so the same receipt
attached twice is stored once. By default they go on the disk under
`SETOUT_DATA_DIR`, which the backup archive already carries.

Point `SETOUT_STORAGE_BACKEND` at `s3` and they go to any S3 compatible bucket
instead: Amazon, MinIO, R2, B2, Spaces and the rest all speak it. A bucket is
outside the backup archive, so back the bucket up where it lives.

## The frontend

The web app reads `apiBaseUrl` from its environment files. It defaults to a
relative path in production, so the single container works with no
configuration.
