# Security policy

## Supported versions

Setout is developed on `master`, and fixes land there. There are no long-lived
release branches, so please reproduce on the latest `master` or the most recent
image before reporting.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Use GitHub's private vulnerability reporting on this repository: the **Security**
tab, then **Report a vulnerability**. That keeps the report private until a fix
is out, and keeps the discussion attached to the code.

Useful things to include:

- What an attacker can do, and what they need in order to do it
- Steps to reproduce, or a proof of concept
- How you deployed: Docker or bare metal, SQLite or Postgres, local files or S3
- Whether the instance was reachable from the internet
- Anything you already know about a fix

You should get an acknowledgement within a week. Please give a reasonable window
for a fix before disclosing publicly; you will be credited in the advisory unless
you would rather not be.

## Things that are configuration, not vulnerabilities

Setout ships defaults that exist so the stack comes up on one command. They are
not safe to expose, and the documentation says so in several places:

- `SETOUT_SECRET_KEY` defaults to `change-me`. It signs session cookies, so
  anyone who knows it can forge a session. The app warns on startup while it is
  unset, and [docs/deployment.md](docs/deployment.md) lists it first.
- The compose stack's Postgres and MinIO credentials are defaults
  (`setout` / `setout-secret`).
- `SETOUT_COOKIE_SECURE` defaults to `false`, which is right for localhost and
  wrong for anything else.

An install left in that state is a deployment that skipped
[the hardening list](docs/deployment.md), and a report about it will be closed
with a pointer there. A way to bypass those protections when they *are* set is
very much a vulnerability, and we would like to hear about it.

## Scope

In scope: authentication and session handling, the record export and restore,
attachment upload and retrieval including S3 links, anything that lets one
install read another's data, and dependency vulnerabilities that Setout actually
reaches.

Out of scope: findings that require an attacker to already hold the passphrase
or the secret key, denial of service by volume against a single-tenant
self-hosted app, and reports from automated scanners with no demonstrated impact.
