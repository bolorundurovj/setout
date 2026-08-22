#!/usr/bin/env bash
# Read a backup archive back over the current database and uploaded files.
#
# Usage: restore.sh <archive.tar.gz> [data-dir]
#
# Stop the app first. Set SETOUT_ASSUME_YES=1 to skip the confirmation.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCHIVE="${1:-}"
DATA_DIR="${2:-${SETOUT_DATA_DIR:-$ROOT_DIR/apps/api/data}}"
DB_URL="${SETOUT_DATABASE_URL:-}"

if [ -z "$ARCHIVE" ]; then
	echo "Usage: restore.sh <archive.tar.gz> [data-dir]"
	exit 1
fi

if [ ! -f "$ARCHIVE" ]; then
	echo "Error: archive not found: $ARCHIVE"
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
tar -xzf "$ARCHIVE" -C "$STAGE"

if [ -f "$STAGE/manifest.txt" ]; then
	FROM="$(sed -n 's/^engine=//p' "$STAGE/manifest.txt")"
else
	# Archives written before the engine split were a plain tar of the data
	# directory, which only ever held SQLite.
	FROM="sqlite"
	LEGACY=1
	echo "Note: no manifest, reading this as an older SQLite archive."
fi

if [ "$FROM" != "$ENGINE" ]; then
	echo "Error: this archive holds a $FROM database, but Setout is configured"
	echo "       for $ENGINE. Restoring it here would leave the two out of step."
	echo ""
	echo "Point SETOUT_DATABASE_URL at $FROM, or move the data between engines"
	echo "with the app's own export and restore, which carries rows rather than"
	echo "a database file."
	exit 1
fi

echo "About to overwrite the $ENGINE database and the files in $DATA_DIR."
echo "Archive: $ARCHIVE"
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
	tar -xzf "$ARCHIVE" -C "$DATA_DIR"
elif [ "$ENGINE" = "sqlite" ]; then
	DB_PATH="${DB_URL#sqlite://}"
	mkdir -p "$(dirname "$DB_PATH")"
	# The old write-ahead log describes the old database. Left in place, SQLite
	# would replay it over the file just restored.
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

echo "Restored $ARCHIVE"
echo "Engine: $ENGINE"
