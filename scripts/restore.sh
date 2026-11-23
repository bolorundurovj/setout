#!/usr/bin/env bash
# Restore a server backup over the current database and uploaded files.
#
# Usage: restore.sh <backup.tar.gz> [data-dir]
#
# Stop the app first. Set SETOUT_ASSUME_YES=1 to skip the confirmation.
# The current data directory is moved aside, not deleted, so a restore can be undone.
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/lib.sh
. "$ROOT_DIR/scripts/lib.sh"
load_env "$ROOT_DIR"
BACKUP_FILE="${1:-}"
DATA_DIR="${2:-${SETOUT_DATA_DIR:-$ROOT_DIR/apps/api/data}}"
DB_URL="${SETOUT_DATABASE_URL:-}"

if [ -z "$BACKUP_FILE" ]; then
	echo "Usage: restore.sh <backup.tar.gz> [data-dir]"
	exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
	echo "Error: server backup not found: $BACKUP_FILE"
	exit 1
fi

if [ -z "$DB_URL" ]; then
	DB_URL="sqlite://$DATA_DIR/setout.sqlite3"
fi

case "$DB_URL" in
postgres://* | postgresql://*) ENGINE="postgres" ;;
sqlite://*) ENGINE="sqlite" ;;
*)
	echo "Error: unrecognised SETOUT_DATABASE_URL: ${DB_URL%%:*}://..."
	exit 1
	;;
esac

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
tar -xzf "$BACKUP_FILE" -C "$STAGE"

if [ -f "$STAGE/manifest.txt" ]; then
	FROM="$(sed -n 's/^engine=//p' "$STAGE/manifest.txt")"
else
	# Server backups without a manifest predate Postgres support and are a plain tar
	# of the SQLite data directory.
	FROM="sqlite"
	LEGACY=1
	echo "Note: no manifest, reading this as an older SQLite server backup."
fi

if [ "$FROM" != "$ENGINE" ]; then
	echo "Error: this server backup holds a $FROM database, but Setout is configured"
	echo "       for $ENGINE. Restoring it here is not supported."
	echo ""
	echo "Point SETOUT_DATABASE_URL at $FROM, or move the data between engines"
	echo "with a Setout backup from the app's Settings page, which transfers rows"
	echo "rather than a database file."
	exit 1
fi

REPLACED_DIR="$ROOT_DIR/backups/replaced-$(date -u +%Y%m%dT%H%M%SZ)"

echo "About to overwrite the $ENGINE database and the files in $DATA_DIR."
echo "The current contents of $DATA_DIR will be moved to $REPLACED_DIR."
echo "Server backup: $BACKUP_FILE"
if [ "${SETOUT_ASSUME_YES:-}" != "1" ]; then
	read -r -p "This cannot be undone. Continue? [y/N] " reply
	case "$reply" in
	y | Y | yes | YES) ;;
	*)
		echo "Nothing was changed."
		exit 1
		;;
	esac
fi

if [ "$ENGINE" = "postgres" ] && ! command -v pg_restore >/dev/null 2>&1; then
	echo "Error: pg_restore not found. Install the Postgres client tools."
	echo "Nothing was changed."
	exit 1
fi

# Files deleted since the backup must not survive the restore, so the directory
# starts empty. Its old contents are kept in REPLACED_DIR.
mkdir -p "$DATA_DIR"
if [ -n "$(ls -A "$DATA_DIR")" ]; then
	mkdir -p "$REPLACED_DIR"
	find "$DATA_DIR" -mindepth 1 -maxdepth 1 -exec mv {} "$REPLACED_DIR"/ \;
fi

if [ "$ENGINE" = "sqlite" ]; then
	DB_PATH="${DB_URL#sqlite://}"
	# SQLite would replay a leftover write-ahead log over the restored file.
	rm -f "$DB_PATH-wal" "$DB_PATH-shm"
fi

if [ "${LEGACY:-}" = "1" ]; then
	tar -xzf "$BACKUP_FILE" -C "$DATA_DIR"
elif [ "$ENGINE" = "sqlite" ]; then
	mkdir -p "$(dirname "$DB_PATH")"
	cp "$STAGE/database.sqlite3" "$DB_PATH"
else
	pg_restore --clean --if-exists --no-owner --no-privileges \
		--single-transaction --exit-on-error \
		--dbname="$DB_URL" "$STAGE/database.dump"
fi

if [ -d "$STAGE/files" ]; then
	tar -cf - -C "$STAGE/files" . | tar -xf - -C "$DATA_DIR"
fi

echo "Restored $BACKUP_FILE"
echo "Engine: $ENGINE"
if [ -d "$REPLACED_DIR" ]; then
	echo "The previous data is in $REPLACED_DIR"
fi
