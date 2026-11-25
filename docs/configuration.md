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
| `SETOUT_STATIC_DIR` | unset (set in the container image) | Directory of the built web app for the API to serve |
| `SETOUT_CORS_ORIGINS` | `http://localhost:4200` | Comma-separated origins allowed to call the API |
| `SETOUT_COOKIE_SECURE` | `false` | Send the session cookie over HTTPS only; turn on when not on localhost |
| `SETOUT_SESSION_DAYS` | `30` | How long a session lasts. The window slides while it is in use |
| `SETOUT_SIGN_IN_FREE_ATTEMPTS` | `3` | Wrong passphrases answered without delay |
| `SETOUT_SIGN_IN_DELAY_SECONDS` | `1.0` | The first delay, doubled for each later failure |
| `SETOUT_SIGN_IN_DELAY_CAP_SECONDS` | `8.0` | Maximum delay |
| `SETOUT_SIGN_IN_MAX_ATTEMPTS` | `7` | After this many failures, attempts are refused |
| `SETOUT_SIGN_IN_RETRY_AFTER_SECONDS` | `30` | Value of `Retry-After`, and how long a failure is counted |
| `SETOUT_STORAGE_BACKEND` | `local` | Where attached files live: `local` or `s3` |
| `SETOUT_S3_BUCKET` | empty | Bucket name when the backend is `s3` |
| `SETOUT_S3_ENDPOINT_URL` | empty | Leave unset for Amazon; set it for RustFS, R2, B2, Spaces |
| `SETOUT_S3_PUBLIC_URL` | empty | Address browsers use to reach the bucket; defaults to the endpoint URL |
| `SETOUT_S3_REGION` | empty | Region, where the provider wants one |
| `SETOUT_S3_ACCESS_KEY_ID` | empty | Access key |
| `SETOUT_S3_SECRET_ACCESS_KEY` | empty | Secret key |
| `SETOUT_S3_PREFIX` | `attachments` | Folder inside the bucket |
| `SETOUT_S3_USE_PATH_STYLE` | `false` | Turn on for RustFS and other providers that require path-style addressing |
| `SETOUT_S3_AUTO_CREATE_BUCKET` | `true` | Automatically create the target S3 bucket on boot if it does not exist |
| `SETOUT_S3_LINK_SECONDS` | `300` | Expiry of presigned bucket URLs, in seconds |
| `SETOUT_MAX_ATTACHMENT_BYTES` | `25000000` | Largest file that can be attached |
| `SETOUT_MAX_IMPORT_BYTES` | `25000000` | Largest workbook that can be imported; the file is read into memory |
| `SETOUT_MAP_TILE_URL` | OpenStreetMap | Tile template for the map on a land record |
| `SETOUT_MAP_ATTRIBUTION` | `© OpenStreetMap` | Credit shown on the map |
| `SETOUT_GEOCODER_URL` | Nominatim | Looks up the address of a pin. Empty disables the check |
| `SETOUT_GEOCODER_EMAIL` | empty | Contact address, requested by Nominatim beyond light use |

The sign-in settings were named `SETOUT_LOGIN_*` in earlier releases (for example
`SETOUT_LOGIN_MAX_ATTEMPTS`). The old names are still read, so existing deployments keep working.

Repeated wrong passphrases are delayed and then refused. The delay doubles from
`SETOUT_SIGN_IN_DELAY_SECONDS`, and after `SETOUT_SIGN_IN_MAX_ATTEMPTS` failures the response is
`429` with a `Retry-After` header instead of a delayed response. There is no lockout: Setout has
one account, so a lockout would let anyone block the owner by failing on purpose. A correct
passphrase resets the count, and failures older than `SETOUT_SIGN_IN_RETRY_AFTER_SECONDS` are
no longer counted.

Two of these determine whether the installation is safe to expose. `SETOUT_SECRET_KEY` signs session cookies, so anyone who knows it can forge a session. The app warns on startup while it is still the default. `SETOUT_COOKIE_SECURE` should be enabled anywhere other than localhost.

### The map

A land record can carry a location pin and a boundary, drawn on a map. The map is [Leaflet](https://leafletjs.com), bundled with the app rather than fetched from a CDN. It needs no account and no API key.

The map tiles are separate. `SETOUT_MAP_TILE_URL` defaults to OpenStreetMap's servers, so the map works immediately after installation. Their [tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
asks that applications avoid bulk or heavy traffic, so for anything beyond personal use, set this to your own tile server:

```bash
SETOUT_MAP_TILE_URL=http://tiles.example.lan/{z}/{x}/{y}.png
SETOUT_MAP_ATTRIBUTION="Tiles by me, data © OpenStreetMap contributors"
```

The template takes `{z}`, `{x}` and `{y}`. Set the attribution to credit the data source.

### Checking a location pin against its address

Setting a location pin asks the geocoder for the address at that point, so a land record entered for one town with a pin in another town is flagged. `SETOUT_GEOCODER_URL` defaults to Nominatim, which is run by OpenStreetMap and needs no key. Their
[usage policy](https://operations.osmfoundation.org/policies/nominatim/) allows one request a second and no bulk traffic, so Setout queries through the API rather than the browser. It sends its own User-Agent, stays within that rate, and caches each result so the same pin is never looked up twice.

```bash
SETOUT_GEOCODER_URL=https://nominatim.example.lan
SETOUT_GEOCODER_EMAIL=you@example.com
SETOUT_GEOCODER_URL=          # empty disables the check
```

This never blocks saving. If the geocoder is disabled, slow or unreachable, the check is skipped.

Tiles and the geocoder are the only things Setout fetches from another host, and
only on a land page. When they cannot be reached, the pin and the boundary are still drawn on a plain
background, so the shape of the land is shown without a connection.

## The compose stack

`docker/docker-compose.yml` uses three isolated per-service environment files: copy
`docker/.env.setout.example`, `docker/.env.db.example`, and `docker/.env.s3.example` to
`docker/.env.setout`, `docker/.env.db`, and `docker/.env.s3` and adjust them. Host port
mappings and image tags can also be overridden from the shell or a `.env` file beside the
compose file.

| Variable | File | Default | Meaning |
| --- | --- | --- | --- |
| `SETOUT_PORT` | shell / `.env` | `8474` | Host port the app is published on. The container always listens on 8474 |
| `SETOUT_IMAGE_TAG` | shell / `.env` | `latest` | Setout container image tag |
| `SETOUT_FORWARDED_ALLOW_IPS` | `.env.setout` | `127.0.0.1` | Comma-separated addresses of reverse proxies whose `X-Forwarded-*` headers are trusted |
| `SETOUT_SECRET_KEY` | `.env.setout` | `change-me` | Session signing key |
| `SETOUT_DB_HOST` / `SETOUT_DB_PORT` / `SETOUT_DB_USER` / `SETOUT_DB_PASSWORD` / `SETOUT_DB_NAME` | `.env.setout` | `db` / `5432` / `setout` | Database connection parts used by the app |
| `SETOUT_S3_ACCESS_KEY_ID` / `SETOUT_S3_SECRET_ACCESS_KEY` / `SETOUT_S3_BUCKET` | `.env.setout` | `setout` / `setout-secret` / `setout` | S3 credentials and bucket used by the app |
| `SETOUT_S3_ENDPOINT_URL` / `SETOUT_S3_PUBLIC_URL` / `SETOUT_S3_REGION` | `.env.setout` | `http://s3:9000` / `http://localhost:9000` / `us-east-1` | Internal and browser-facing S3 URLs and region |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `.env.db` | `setout` | Postgres database credentials (match `SETOUT_DB_*`) |
| `POSTGRES_PORT` | shell / `.env` | `5433` | Host port for Postgres, bound to `127.0.0.1` and kept off 5432 to avoid conflicts |
| `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY` | `.env.s3` | `setout` / `setout-secret` | RustFS object storage credentials (match `SETOUT_S3_*`) |
| `RUSTFS_ADDRESS` / `RUSTFS_CONSOLE_ADDRESS` / `RUSTFS_CONSOLE_ENABLE` | `.env.s3` | `:9000` / `:9001` / `true` | RustFS S3 API and console listener settings |
| `STORAGE_PORT` / `STORAGE_CONSOLE_PORT` | shell / `.env` | `9000` / `9001` | Published S3 API and RustFS console host ports (bound to `127.0.0.1`) |

## Where attachments live

Attached files are named after the hash of their contents, so the same receipt
attached twice is stored once. By default they go on the disk under
`SETOUT_DATA_DIR`, which the server backup already includes.

Point `SETOUT_STORAGE_BACKEND` at `s3` and they go to any S3-compatible bucket:
Amazon, RustFS, R2, B2, Spaces and others. A bucket is
not included in the server backup, so back up the bucket separately.

## The frontend

The web app reads `apiBaseUrl` from its environment files. It defaults to a
relative path in production, so the single container works with no
configuration.
