# Architecture

Setout is a FastAPI backend and an Angular frontend in one repository, deployed
as a single container. The frontend contains no handwritten HTTP calls: it uses a
TypeScript SDK generated from the backend's OpenAPI schema.

## Layout

```
apps/api             FastAPI service (uv, pyproject.toml)
apps/web             Angular application
packages/api-client  OpenAPI schema (committed) and generated TypeScript SDK (gitignored)
scripts              SDK generation, seed, backup, restore
docker               Dockerfile and the compose stack
docs                 this documentation
```

## Request flow

```
routers/     the HTTP surface: paths, status codes, an explicit operation_id
controllers/ request handling logic, one module per resource
services/    auth, storage backends, spreadsheet reading and writing
utils/       calculations: balances, budgets, item prices, cascades
models/      Tortoise ORM models
schemas/     Pydantic request and response shapes
migrations/  the schema, one file per feature
```

A router only maps requests to controllers. The controller holds the behaviour, the utils hold the calculations, and the schemas define the request and response bodies. Every
operation has an explicit `operation_id`, because those become the SDK's
method names and a change there breaks callers, so a contract test fixes them.

## The generated SDK

`scripts/generate_sdk.sh` imports the FastAPI app, writes
`packages/api-client/openapi.json`, and runs `ng-openapi-gen` over it. The OpenAPI
schema (`packages/api-client/openapi.json`) is committed, while the generated TypeScript
files under `packages/api-client/src` are gitignored and regenerated on demand by `make sdk`.
`make sdk-check` regenerates the schema and fails if `packages/api-client/openapi.json` has drifted.

The generator is `ng-openapi-gen` because it needs no Java runtime, so it runs in
CI and in the Docker build, and because it generates a client that uses Angular's
`HttpClient`, so the SDK goes through Angular's HTTP pipeline, including
interceptors and testing utilities. An ESLint rule in `apps/web/eslint.config.js`
forbids importing `HttpClient` anywhere outside that layer:

> Do not use HttpClient directly. Import the generated SDK from
> `@setout/api-client`.

## Data model decisions

**Money is whole minor units.** An amount is an integer in the currency's
smallest unit, so nothing is lost to rounding. NGN 11,000.00 is stored as
`1100000`. A project's currency is chosen once, at creation, and never changes;
amounts in two currencies are never added together.

**A budget is set deliberately.** Budgets belong to a category. An expense records spending and cannot change a budget value. A category with subcategories has no expenses of its own.

**An expense never requires a category.** A category on an expense is optional. An uncategorised expense is still included in the project total and is listed as Uncategorised so
a category can be assigned later.

**Items, vendors and people belong to the installation, not a project**, because the same vendor and the same item are used across projects. Their amounts are always reported per project. An item holds no prices of its own; each expense assigned to it with a unit rate is added to its price history.

**Removal starts with archiving, and archived records can be permanently deleted.** Archiving a row sets `archived_at`, cascades to dependent rows, and hides the row by default so it can be restored. Every list that can contain archived rows accepts `include_archived`, and screens provide a **Show archived** toggle so an archived row can be restored after the undo toast is dismissed or the page is refreshed. Archiving uses `POST /api/{resource}/{id}/archive`, paired with `POST /api/{resource}/{id}/restore`. Once archived, records can be permanently deleted via `DELETE /api/{resource}/{id}` after explicit `DELETE` confirmation in the UI.

**IDs are short and readable.** Twelve characters from an alphabet that excludes `0`/`O` and `1`/`l`/`I`, so an ID is unambiguous when read aloud or copied (`utils/ids.py`).

## Storage

Attachments are stored through one interface with two implementations, local disk and
S3, chosen by `SETOUT_STORAGE_BACKEND`. Files are named after the hash of their
contents, so the same receipt attached twice is stored once. Any S3-compatible service works: Amazon, RustFS, R2, B2, Spaces.

## Migrations

The schema is managed by the migration CLI built into Tortoise ORM, not Aerich
and not Alembic, resolved from `[tool.tortoise]` in `apps/api/pyproject.toml`. The
migrations are split one per feature, numbered from
`0001_initial`, each depending on the one before. They are applied on startup, and the startup log reports when the database was behind.

The test suite builds its schema with `generate_schemas()` against
in-memory SQLite, so passing tests do not prove a migration applies. Run `make migrate` against a fresh database to verify.
