# Development

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

`make check` is the gate. It runs lint and type checking, the whole test suite
against a coverage floor of 80%, the frontend unit tests, and then regenerates
the SDK and fails if the committed client drifted. If it passes locally it will
pass in CI, which runs the same thing.

## The three test layers

Write the tests with the feature, not afterwards.

| Layer | Lives in | Runs against |
| --- | --- | --- |
| Unit | `apps/api/tests/unit` | Functions in isolation: balances, budgets, item prices, sheet readers |
| Integration | `apps/api/tests/integration` | The real ASGI app on a fresh in-memory SQLite database per test, nothing mocked |
| Contract | `apps/api/tests/contract` | The published schema: operation ids stay stable, and the API conforms to what it documents |

Frontend specs sit beside the code they cover and run on Vitest through the
Angular CLI.

## Changing the schema

```bash
make migration name=add_something   # create a migration
make migrate                        # apply it
make downgrade                      # roll the last step back
```

Migrations live in `apps/api/src/setout/migrations`, one per feature, each
depending on the one before. Because the tests build their schema from the
models rather than from the migrations, a migration is only proven by running
`make migrate` against a fresh database. Do that before sending the change.

## Changing the API surface

Every operation needs an explicit `operation_id`: it becomes the SDK method
name, and a contract test pins the set so a rename cannot pass unnoticed.

After changing routes or schemas, run `make sdk` and commit the regenerated
client. Never edit `packages/api-client/src` by hand; it is generated output,
and `make check` will overwrite and then reject your edit.

## Three things that look wrong and are not

**`tzdata` is a real dependency.** Tortoise with `use_tz=True` needs it on any
system without a zone database, which means Windows and slim containers. Remove
it and you get `ZoneInfoNotFoundError: 'No time zone found with key UTC'`.

**The contract test starts a real uvicorn.** Schemathesis does not run the ASGI
lifespan, and Tortoise binds connections to an event loop with per-task context,
so the test points schemathesis at a URL rather than at the app object. The app
enables Tortoise's cross-task global fallback so handlers see the connection
opened during startup.

**The schema documents 400 on every operation with a body.** FastAPI returns 400
for an unparseable JSON body but documents only 422. Declaring it keeps
schemathesis passing and keeps the schema honest about what the API does.

## Style

Ruff and mypy in strict mode on the backend, ESLint and Prettier on the
frontend, all wired into `make lint`. Comment only where the code cannot explain
a non-obvious constraint, and then in one line. Name things well instead.

Commit messages are short: a subject line is usually the whole message, with a
body only when the change cannot be understood without one.
