<p align="center">
  <img src="assets/setout-icon.png" alt="Setout app icon" width="96" />
</p>

<h1 align="center">Setout</h1>

<p align="center">Know what the build has cost you. Today, not next month.</p>

<p align="center">
  <a href="https://github.com/bolorundurovj/setout/actions/workflows/ci.yml"><img src="https://github.com/bolorundurovj/setout/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/bolorundurovj/setout/releases"><img src="https://img.shields.io/github/v/release/bolorundurovj/setout?label=release" alt="Release" /></a>
  <a href="https://github.com/bolorundurovj/setout/pkgs/container/setout"><img src="https://img.shields.io/badge/ghcr.io-setout-blue" alt="Container image" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licence-AGPL--3.0-blue.svg" alt="Licence: AGPL v3" /></a>
</p>

<p align="center">
  <img src="assets/setout-banner.png" alt="Setout overview" width="1080" />
</p>

Setout is a self-hosted web app for tracking construction spend on personal
building projects. It replaces a spreadsheet whose budget numbers were typed in
after the money was spent. In Setout a budget belongs to a scope and is set
deliberately; an expense records spend and can never write a budget value.

- Backend: Python, FastAPI, Tortoise ORM (with its built-in migration CLI).
- Frontend: Angular, consuming a TypeScript SDK generated from the OpenAPI schema.
- Database: SQLite by default, Postgres optional.
- Deployment: one container, one port, SQLite by default.

See the product in action in the [full showcase](docs/showcase.md).

## Quick start

With Docker:

```bash
docker compose -f docker/docker-compose.yml pull
docker compose -f docker/docker-compose.yml up -d
```

That pulls the published image, `ghcr.io/bolorundurovj/setout` for amd64 and
arm64, and brings up the app on 8474 with Postgres for the record and MinIO for
the attachments. From a checkout instead:

```bash
make setup    # install backend and frontend
make dev      # run the API and the web app together
```

Open the web app. The first run guides you through setting up the local admin
account with a passphrase. There are no roles and no email is required: one
person, one passphrase, and a session cookie on your device.

Windows works from cmd.exe, Cmder and Git Bash, with one constraint about WSL
covered in [installation](docs/installation.md).

Before putting Setout anywhere other people can reach, read
[deployment](docs/deployment.md). The defaults exist so the stack comes up on one
command, not because they are safe.

## Recording spend

Open a project and pick **Add expense**. Three fields are required: what it was,
what it cost, and when. The screen is built to be used one handed on a phone at
the merchant's counter, so everything else sits behind **More details**.

- Give a **quantity** and a **rate each** and the total is calculated for you,
  the way a receipt reads: 600 nine inch blocks at 250 each. Fill in only one of
  them and you type the total yourself; what you entered is still kept.
- A **scope** is optional. Spend that has not been filed anywhere is still real
  spend, it counts towards the project total, and it is listed as unfiled so you
  can file it later. Recording a purchase is never blocked by a missing budget.
- A scope with children holds no spend of its own. File against the child.
- Amounts are stored as whole numbers in the currency's minor units, so nothing
  is lost to rounding. NGN 11,000.00 is stored as 1100000.
- Removing an expense is a soft delete. The row is kept and can be restored.

Behind **More details** an expense can also record what was bought, who it was
bought from, and who handed over the money. All three are optional.

## Items, vendors and people

These three belong to the installation, not to a project, because the same
supplier and the same bag of cement serve every house you build. Their money is
always reported per project, and figures from two currencies are never added
together.

- An **item** is something you buy more than once. It holds no prices of its
  own: every purchase filed against it with a rate builds its price history, so
  first paid, last paid, lowest, highest and the change between them are always
  read back from the expenses. Pick an item on the expense form and it shows
  what you last paid, in that project's currency, and offers it as the rate.
- A **vendor** is who you buy from. You can add one straight from the expense
  form with just a name, then fill in the trade and phone number later.
  Archiving a vendor keeps every expense filed against them; they simply stop
  coming up on the form.
- A **person** is someone who spends your money for you. Recording who paid is
  what makes it possible to work out what you owe them.

## Documentation

| Guide                                            | What it covers                                      |
| ------------------------------------------------ | --------------------------------------------------- |
| [Installation](docs/installation.md)             | Docker, bare metal, the first run                   |
| [Configuration](docs/configuration.md)           | Every environment variable, app and compose         |
| [Deployment](docs/deployment.md)                 | Postgres, S3 or MinIO, HTTPS, upgrades              |
| [Backup and restore](docs/backup-and-restore.md) | The two kinds of copy, and when each applies        |
| [Troubleshooting](docs/troubleshooting.md)       | The failures that come up more than once            |
| [Architecture](docs/architecture.md)             | How a request travels, and why the SDK is generated |
| [Development](docs/development.md)               | The Makefile, the test layers, migrations, the SDK  |
| [Roadmap](docs/roadmap.md)                       | What is designed but not built                      |
| [Changelog](CHANGELOG.md)                        | What changed in each release                        |

## Repository layout

```
apps/api             FastAPI service (uv, pyproject.toml)
apps/web             Angular application
packages/api-client  generated TypeScript SDK
scripts              SDK generation, seed, backup, restore
docker               Dockerfile and the compose stack
docs                 documentation
```

## The Makefile is the interface

`make setup`, `make dev`, `make check`. That last one is the gate: lint, types,
the whole test suite against a coverage floor, and a check that the committed
SDK still matches the schema. The full list of targets is in
[development](docs/development.md), or run `make help`.

## Contributing

Issues and pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) covers
setup, the rules that matter, and what the checklist is asking for. The project
follows the [Contributor Covenant](CODE_OF_CONDUCT.md).

Found a security problem? Please report it privately: see
[SECURITY.md](SECURITY.md).

## Licence

[GNU Affero General Public License v3.0 or later](LICENSE). You may run, study,
change and share it. If you offer a modified version to other people over a
network, you must publish your source too.
