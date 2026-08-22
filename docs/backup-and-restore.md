# Backup and restore

There are two kinds of copy, and they are not interchangeable. Use the shell
archive to protect the install, and the record export to move the data somewhere
else.

## The whole install, from the shell

```bash
make backup                                   # writes backups/setout-backup-<engine>-<stamp>.tar.gz
make restore file=backups/setout-backup-<engine>-<stamp>.tar.gz
```

The archive holds the database, everything else under `SETOUT_DATA_DIR`, and a
manifest naming the engine it came from. How the database is captured depends on
`SETOUT_DATABASE_URL`:

| Engine | Captured with | Needs |
| --- | --- | --- |
| SQLite | `sqlite3 .backup`, falling back to a file copy | `sqlite3` for a copy that is safe while running |
| Postgres | `pg_dump --format=custom` | `pg_dump` and `pg_restore` on the machine |

Stop the app before restoring. The restore asks before overwriting anything; set
`SETOUT_ASSUME_YES=1` for an unattended run, such as cron.

A restore refuses if the archive and the running configuration disagree about
the engine, because a Postgres dump cannot be poured into SQLite. To move
between engines, use the record export below, which carries rows rather than a
database file. Archives written before this split have no manifest and are read
as SQLite.

Attachments kept in an S3 bucket are not in the archive. Back the bucket up
where it lives.

## The record, from the app

Settings → Backup writes a `.json` holding every row of the record, and takes
one back. It works against either engine and needs no shell access, but it is
rows only: no uploaded files, and no sessions, so everyone signs in again.

The restore inserts into whatever schema the server is running now, so it asks
you to confirm when the file came from a different version, and refuses a file
holding tables it does not know. It runs in one transaction: either every row
lands or the record is left exactly as it was.

`GET /install/export` and `POST /install/restore` are the same thing over the
API.

## Which to reach for

| You want to | Use |
| --- | --- |
| Protect this install against disk loss | The shell archive, on a schedule |
| Move from SQLite to Postgres, or back | The record export |
| Move the data to another machine or version | The record export |
| Keep the uploaded receipts too | The shell archive, plus the bucket if you use S3 |
