#!/usr/bin/env bash
# Restore a server backup over the current database and uploaded files.
#
# Usage: restore.sh <backup.tar.gz> [data-dir]
#
# Stop the app first. Set SETOUT_ASSUME_YES=1 to skip the confirmation.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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

echo "About to overwrite the $ENGINE database and the files in $DATA_DIR."
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

mkdir -p "$DATA_DIR"

if [ "${LEGACY:-}" = "1" ]; then
	tar -xzf "$BACKUP_FILE" -C "$DATA_DIR"
elif [ "$ENGINE" = "sqlite" ]; then
	DB_PATH="${DB_URL#sqlite://}"
	mkdir -p "$(dirname "$DB_PATH")"
	# SQLite would replay a leftover write-ahead log over the restored file.
	rm -f "$DB_PATH-wal" "$DB_PATH-shm"
	cp "$STAGE/database.sqlite3" "$DB_PATH"
else
	if ! command -v pg_restore >/dev/null 2>&1; then
		echo "Error: pg_restore not found. Install the Postgres client tools."
		exit 1
	fi
	pg_restore --clean --if-exists --no-owner --dbname="$DB_URL" "$STAGE/database.dump"
fi

if [ -d "$STAGE/files" ]; then
	tar -cf - -C "$STAGE/files" . | tar -xf - -C "$DATA_DIR"
fi

echo "Restored $BACKUP_FILE"
echo "Engine: $ENGINE"
