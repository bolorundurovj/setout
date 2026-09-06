# Backup and restore

There are two kinds of backup and they are not interchangeable. Use the shell archive to protect the installation, and the data export to move data elsewhere.

## Full installation, from the shell

```bash
make backup                                   # writes backups/setout-backup-<engine>-<stamp>.tar.gz
make restore file=backups/setout-backup-<engine>-<stamp>.tar.gz
```

The archive holds the database, everything under `SETOUT_DATA_DIR`, and a manifest naming the engine it came from. How the database is captured depends on
`SETOUT_DATABASE_URL`:

| Engine | Captured with | Needs |
| --- | --- | --- |
| SQLite | `sqlite3 .backup`, falling back to a file copy | `sqlite3` for a backup that is safe while running |
| Postgres | `pg_dump --format=custom` | `pg_dump` and `pg_restore` on the machine |

Stop the app before restoring. The restore asks before overwriting anything. Set `SETOUT_ASSUME_YES=1` for an unattended run, such as cron.

A restore refuses if the archive and the running configuration disagree about
the engine, because a Postgres dump cannot be loaded into SQLite. To move between engines, use the data export below, which carries rows rather than a database file. Archives written before this split have no manifest and are read
as SQLite.

Attachments stored in an S3 bucket are not in the archive. Back the bucket up separately.

## Data export, from the app

Settings → Backup writes a `.json` file holding every row, and reads one back. It works with either engine and needs no shell access, but it holds rows only: no uploaded files and no sessions, so every device signs in again.

The restore inserts into the schema the server is running now. It asks you to confirm when the file came from a different version, and refuses a file holding tables it does not recognise. It runs in one transaction: either every row is written or nothing changes.

`GET /install/export` and `POST /install/restore` are the same thing over the
API.

## Which to use

| You want to | Use |
| --- | --- |
| Protect this installation against disk loss | The shell archive, on a schedule |
| Move from SQLite to Postgres, or back | The data export |
| Move the data to another machine or version | The data export |
| Include uploaded receipts | The shell archive, plus the bucket if you use S3 |
