# Backup and restore

There are two kinds of backup and they are not interchangeable. Use the server backup to protect the installation, and the in-app backup to move your data elsewhere.

## Server backup, from the shell

```bash
make backup                                   # writes backups/setout-backup-<engine>-<stamp>.tar.gz
make restore file=backups/setout-backup-<engine>-<stamp>.tar.gz
```

A server backup holds the database, everything under `SETOUT_DATA_DIR`, and a manifest naming the engine it came from. How the database is captured depends on
`SETOUT_DATABASE_URL`:

| Engine | Captured with | Needs |
| --- | --- | --- |
| SQLite | `sqlite3 .backup`, falling back to a file copy | `sqlite3` for a backup that is safe while running |
| Postgres | `pg_dump --format=custom` | `pg_dump` and `pg_restore` on the machine |

Stop the app before restoring. The restore asks for confirmation before overwriting anything. Set `SETOUT_ASSUME_YES=1` for an unattended run, such as cron.

A restore refuses if the server backup and the running configuration disagree about
the engine, because a Postgres dump cannot be loaded into SQLite. To move between engines, use the in-app backup below, which contains rows rather than a database file. Server backups created before the manifest was added have no manifest and are read
as SQLite.

Attachments stored in an S3 bucket are not in the server backup. Back the bucket up separately.

## In-app backup

In Settings, under **Server and Backup**, **Download Backup** writes a `.json` file containing every row of your data, and **Restore from Backup** reads one back. It works with either engine and needs no shell access, but it contains rows only: no uploaded files and no sessions, so every device must sign in again after a restore.

After you select a file, **Restore Backup** replaces all data on the server with the data in the backup. The rows are inserted into the schema the server is running now. It asks you to confirm when the backup was created by a different version, and rejects a backup containing tables it does not recognise. It runs in one transaction: either every row is written or nothing changes. A backup written by an earlier version, with the field names used before the terminology renames, is still accepted.

`GET /api/install/export` (`exportBackup`) and `POST /api/install/restore` (`restoreBackup`)
provide the same operations through the API.

## Which to use

| You want to | Use |
| --- | --- |
| Protect this installation against disk loss | The server backup, on a schedule |
| Move from SQLite to Postgres, or back | The in-app backup |
| Move your data to another machine or version | The in-app backup |
| Include uploaded attachments | The server backup, plus the bucket if you use S3 |
