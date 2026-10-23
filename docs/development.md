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
make migration    tortoise makemigrations, accepting an optional name=<name>
make migrate      tortoise migrate
make downgrade    roll back one migration
make seed         load the sample data
make backup       write the database and uploaded files into one dated server backup file
make restore      restore a server backup after confirmation (file=<backup>)
make reset-passphrase  reset the admin passphrase (prompts or reads reset-passphrase.txt)
make check        lint, typecheck, all tests, coverage floor, SDK drift
make check-parallel  the same gate, with the backend suite spread across the cores
make build        production build of both apps
make docker-build build the single deployment image
make kill         stop anything left holding the dev ports
make clean        remove build artefacts and caches
```

`make check` is the required check. It runs lint and type checking, the whole test suite
against a coverage floor of 80%, the frontend unit tests, and then regenerates
the SDK and fails if the committed client differs from the schema. CI runs the same checks, so a local pass means a CI pass.

`make check-parallel` runs the same checks with the backend suite spread across every
core. Most of the run time is spent building a fresh app and schema for each test, which can run concurrently: about two and a half minutes instead of six.
Tests are distributed one file at a time, so the contract test starts its server once instead of once per test.

`make check` runs in one process. It is the slower of the two, and the one to use when a failure needs a traceback that is not interleaved with other output. Both run exactly the same lint, tests, coverage floor and SDK check.

The worker count is configurable, and `make test-int` accepts it as well:

```bash
PYTEST_WORKERS=8 make check-parallel
PYTEST_WORKERS=1 make test-int
```

### Line endings

The repository uses LF everywhere, which `.gitattributes` enforces on checkout
and commit. Prettier and ruff read the working tree, so a file saved with CRLF
by a Windows editor fails `make check` before it is committed.

`make lint` lists any file whose working copy uses CRLF and stops; `make format`
converts them. Both use git to find the files, so untracked files and files ruff skips are also checked.

## The three test layers

Write tests with the feature, not after it.

| Layer | Lives in | Runs against |
| --- | --- | --- |
| Unit | `apps/api/tests/unit` | Functions in isolation: balances, budgets, item prices, sheet readers |
| Integration | `apps/api/tests/integration` | The real ASGI app on a fresh in-memory SQLite database per test, nothing mocked |
| Contract | `apps/api/tests/contract` | The published schema: operation ids stay stable, and the API matches its documentation |

Frontend specs sit beside the code they cover and run on Vitest through the
Angular CLI.

## Changing the schema

```bash
make migration name=add_something   # create a migration
make migrate                        # apply it
make downgrade                      # roll back the last migration
```

Migrations live in `apps/api/src/setout/migrations`, one per feature, each
depending on the one before. The tests build their schema from the models rather than the migrations, so a migration is only verified by running `make migrate` against a fresh database. Do that before submitting the change.

## Changing the API surface

Every operation needs an explicit `operation_id`. It becomes the SDK method name, and a contract test fixes the set so that a rename fails the tests.

After changing routes or schemas, run `make sdk` and commit the regenerated
client. Never edit `packages/api-client/src` by hand. It is generated output, and `make check` overwrites it and then rejects the change.

## Cutting a release

Releases are managed by release-please. It reads commits on `master` and keeps a pull request open, titled `chore(master): release 0.2.0` or similar, holding the changelog entry and the version bump. Nothing is published until
that pull request is merged.

Merging it does four things: tags the commit, writes `CHANGELOG.md`, publishes a
GitHub release with a Contributors section listing everyone whose commits are in
it, and builds the image for amd64 and arm64 and pushes it to
`ghcr.io/bolorundurovj/setout`.

To release a specific version rather than the one the commits imply, set
`VERSION` to it and push. The workflow releases that version whenever `VERSION`
is higher than the last released version recorded in
`.release-please-manifest.json`. When the two match, the commit history decides
the bump. A `VERSION` lower than the last release, or one that is not a semantic version, fails the run instead of releasing an unexpected version.

It requests that version by adding an empty `chore: release X.Y.Z` commit carrying a `Release-As` footer, which is how release-please accepts an exact version when driven by a manifest. The footer applies to that release only, so nothing needs to be reset afterwards.

### The release token

The release workflow needs a `RELEASE_TOKEN` secret: a fine-grained token for
this repository with Contents and Pull requests set to read and write.

The built-in `GITHUB_TOKEN` cannot do this job. `master` is protected, and
`github-actions[bot]` cannot be added to a ruleset bypass list, so its pushes are
refused; it is separately barred from opening pull requests. A token belonging to
a repository admin inherits the admin bypass and can do both.

The token expires. When it does, the release workflow fails on its first step with a
message stating that, and nothing is released until it is replaced.

One version number lives in six files: `VERSION`, the three `package.json`
files, `apps/api/pyproject.toml` and `apps/api/src/setout/__init__.py`, which is
what `/healthz` reports. Never bump them by hand. `release-please-config.json`
lists them all and the release pull request rewrites them together.

Every push to `master` also publishes `ghcr.io/bolorundurovj/setout:edge`, so
the publishing workflow runs on every push instead of only at release time.

## Three things that look wrong but are intentional

**`tzdata` is a real dependency.** Tortoise with `use_tz=True` needs it on any
system without a zone database, which means Windows and slim containers. Without
it, startup fails with `ZoneInfoNotFoundError: 'No time zone found with key UTC'`.

**The contract test starts a real uvicorn.** Schemathesis does not run the ASGI
lifespan, and Tortoise binds connections to an event loop with per-task context,
so the test points schemathesis at a URL rather than at the app object. The app
enables Tortoise's cross-task global fallback so handlers see the connection
opened during startup.

**The schema documents 400 on every operation with a body.** FastAPI returns 400
for an unparseable JSON body but documents only 422. Declaring it keeps
schemathesis passing and makes the schema match the API's actual responses.

## Style

Ruff and mypy in strict mode on the backend, ESLint and Prettier on the
frontend, all run by `make lint`. Write a comment only to explain a non-obvious
constraint, edge case or platform limitation, in one line where possible. Name
things clearly instead of narrating the code.

Commit messages are short: a subject line is usually the whole message, with a
body only when the change cannot be understood without one.
