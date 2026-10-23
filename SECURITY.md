# Security policy

## Supported versions

Setout is developed on `master`, and fixes are committed there. There are no long-lived
release branches, so reproduce the problem on the latest `master` or the most recent
image before reporting it.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Use GitHub's private vulnerability reporting on this repository: the **Security**
tab, then **Report a vulnerability**. That keeps the report private until a fix
is out, and keeps the discussion attached to the code.

Include:

- What an attacker can do, and what they need in order to do it
- Steps to reproduce, or a proof of concept
- How you deployed: Docker or bare metal, SQLite or Postgres, local files or S3
- Whether the instance was reachable from the internet
- Any known fix or mitigation

Reports are acknowledged within a week. Allow a reasonable period for a fix
before disclosing publicly. You are credited in the advisory unless you ask not
to be.

## Things that are configuration, not vulnerabilities

Setout ships defaults that exist so that the stack starts with one command. They are
not safe to expose, and the documentation states this in several places:

- `SETOUT_SECRET_KEY` defaults to `change-me`. It signs session cookies, so
  anyone who knows it can forge a session. The app warns on startup while it is
  still the default, and [docs/deployment.md](docs/deployment.md) lists it first.
- The compose stack's Postgres and S3 credentials are defaults
  (Postgres `setout` / `setout`, S3/RustFS `setout` / `setout-secret`).
- `SETOUT_COOKIE_SECURE` defaults to `false`, which is correct for localhost and
  incorrect for any other host.

An installation left in that state has not followed
[the hardening list](docs/deployment.md), and a report about it is closed
with a link to that list. A way to bypass those protections when they *are* set is
a vulnerability, and should be reported.

## Scope

In scope: authentication and session handling, backup export and restore,
attachment upload and retrieval including S3 links, anything that lets one
installation read another's data, and dependency vulnerabilities in code that
Setout calls.

Out of scope: findings that require an attacker to already hold the passphrase
or the secret key, denial of service by volume against a single-tenant
self-hosted app, and reports from automated scanners with no demonstrated impact.
