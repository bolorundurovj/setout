# Setout documentation

The guides below cover running and developing Setout.

## Running it

- [Showcase](showcase.md): screenshots and tour of the app.
- [Installation](installation.md): Docker, bare metal, first run.
- [Configuration](configuration.md): every environment variable, for the app and for the compose stack.
- [Deployment](deployment.md): Postgres, S3 or RustFS, HTTPS, upgrades.
- [MinIO to RustFS Migration](storage-migration.md): upgrading object storage to 2.4.0+.
- [Backup and restore](backup-and-restore.md): the two kinds of backup, and when each applies.
- [Troubleshooting](troubleshooting.md): common failures and their fixes.

## Working on it

- [Architecture](architecture.md): request flow, and why the SDK is generated.
- [Diagrams](diagrams/README.md): architecture, dataflow, lifecycle, and workflow diagrams.
- [Development](development.md): the Makefile, the three test layers, migrations, the SDK.
- [Roadmap](roadmap.md): designed but not yet built.

## Elsewhere in the repository

- [README](../README.md): what Setout is and how to start it.
- [Contributing](../CONTRIBUTING.md): how to submit a change.
- [Security](../SECURITY.md): how to report a vulnerability.
