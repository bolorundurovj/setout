# Contributing to Setout

Thanks for looking. Setout is a self-hosted tracker for construction spend on
personal building projects, and it is opinionated about one thing above all: a
budget is set deliberately, and an expense can never write one. Changes are
weighed against that.

## Before you write code

Open an issue first for anything beyond a fix. It is cheaper to disagree about
an approach in a paragraph than in a branch. For bugs, the
[bug report form](.github/ISSUE_TEMPLATE/bug_report.yml) asks for the things
that are always needed anyway: how you deployed, which database, which storage.

The [roadmap](docs/roadmap.md) lists work that is designed but not started. If
you want to pick one up, say so on an issue so two people do not build it twice.

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
runs the same thing, so if it passes locally it passes there.

**The Makefile is the interface.** Add a target rather than documenting a long
command.

**Never edit `packages/api-client/src` by hand.** It is generated from the
OpenAPI schema. Change the API, run `make sdk`, commit the result.

**Every operation needs an explicit `operation_id`.** It becomes the SDK method
name, and a contract test pins the set so a rename cannot slip through.

**Changed a model? Add a migration**, with `make migration name=...`, and prove
it with `make migrate` against a fresh database. The tests build their schema
from the models, not the migrations, so green tests do not prove a migration
applies.

**Write the tests with the feature.** Unit for the arithmetic, integration
against the real app, contract for the schema.

## Style

Ruff and mypy in strict mode on the backend, ESLint and Prettier on the
frontend, all through `make lint` and `make format`.

Comment only where the code cannot explain a non-obvious constraint, and then in
one line. Name things well instead of narrating them.

Commit messages are short: a subject line is usually the whole message, with a
body of a line or two only when the change cannot be understood without it.
Please do not add AI tooling attribution to commits or code.

## Sending the change

Push a branch and open a pull request against `master`. The
[template](.github/PULL_REQUEST_TEMPLATE.md) has a short checklist. Tell us what
changed and why; the diff already says how.

By contributing you agree that your work is licensed under the
[GNU AGPL v3](LICENSE), the same terms as the rest of the project.
