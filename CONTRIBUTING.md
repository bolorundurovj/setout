# Contributing to Setout

Setout is a self-hosted tracker for construction expenses on personal building
projects. Its central rule is that a budget is set deliberately, and an expense
cannot change one. Changes are reviewed against that rule.

## Before you write code

Open an issue first for anything other than a bug fix, so that the approach is
agreed before the code is written. For bugs, the
[bug report form](.github/ISSUE_TEMPLATE/bug_report.yml) asks for the details
every report needs: how you deployed, which database, which storage.

The [roadmap](docs/roadmap.md) lists work that is designed but not started. If
you want to work on one, say so on an issue so that the work is not duplicated.

## Getting set up

```bash
make setup    # install backend and frontend
make dev      # run the API and the web app together
```

You need uv, Node 24.15.0 or later, Yarn through `corepack enable`, and GNU
Make. [docs/development.md](docs/development.md) covers the rest.

## The rules that matter

**`make check` must pass.** It runs lint, type checking, the whole test suite
against a coverage floor of 80%, the frontend tests, and an SDK drift check. CI
runs the same checks, so a local pass means a CI pass.

**The Makefile is the interface.** Add a target instead of documenting a long
command.

**Never edit `packages/api-client/src` by hand.** It is generated from the
OpenAPI schema. Change the API, run `make sdk`, and commit the result.

**Every operation needs an explicit `operation_id`.** It becomes the SDK method
name, and a contract test fixes the set so that a rename fails the tests.

**Changed a model? Add a migration**, with `make migration name=...`, and verify
it with `make migrate` against a fresh database. The tests build their schema
from the models, not the migrations, so passing tests do not prove a migration
applies.

**Write the tests with the feature.** Unit for the arithmetic, integration
against the real app, contract for the schema.

## Style

Ruff and mypy in strict mode on the backend, ESLint and Prettier on the
frontend, all through `make lint` and `make format`.

Comments:

- Write a comment only to explain a non-obvious constraint, edge case, or
  platform limitation. Never write one that narrates what the code does; name
  things well instead.
- Use literal, precise technical vocabulary and state the exact operation or
  constraint: "Matches the retry backoff used in the worker pool", not "Treated
  the same as the worker".
- No colloquialisms, metaphors or idioms ("plays nice with", "under the hood").
- No filler such as "Note that", "Remember to" or "Basically".
- Keep a comment to one line wherever possible.

Interface text follows the same plain register. Use standard software and
finance terms, say exactly what an action does, and keep to the vocabulary
already in use: archive is the reversible removal and delete is the permanent
one, a backup is the JSON file Setout writes, a server backup is the `.tar.gz`
from `make backup`, and your data is what a backup holds.

Commit messages are short: a subject line is usually the whole message, with a
body of a line or two only when the change cannot be understood without it.
Please do not add AI tooling attribution to commits or code.

## Commit messages decide the version

Releases are created from the commit history, so the prefix on a subject line is
required. It sets the next version number and the changelog section your change
is listed under.

| Prefix | Changelog section | Version effect |
| --- | --- | --- |
| `feat:` | Features | Minor bump |
| `fix:` | Bug Fixes | Patch bump |
| `perf:` | Performance | Patch bump |
| `refactor:`, `docs:`, `build:` | Their own sections | Patch bump |
| `chore:`, `test:` | Hidden | None on their own |

A scope goes in brackets: `feat(expenses): ...`. A breaking change takes a `!`
before the colon, or a `BREAKING CHANGE:` footer in the body, and moves the
major version.

Merging the release pull request publishes the release. See
[docs/development.md](docs/development.md) for the full process.

## Sending the change

Push a branch and open a pull request against `master`. The
[template](.github/PULL_REQUEST_TEMPLATE.md) has a short checklist. Describe what
changed and why; the diff shows how.

By contributing you agree that your work is licensed under the
[GNU AGPL v3](LICENSE), the same terms as the rest of the project.
