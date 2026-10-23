#!/usr/bin/env bash
# Write the database and the uploaded files into one dated server backup file.
#
# Usage: backup.sh [out-dir]
#
# Supports SQLite and Postgres. SQLite is copied from the data directory;
# Postgres is dumped with pg_dump.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${SETOUT_DATA_DIR:-$ROOT_DIR/apps/api/data}"
OUT_DIR="${1:-$ROOT_DIR/backups}"
DB_URL="${SETOUT_DATABASE_URL:-}"

if [ -z "$DB_URL" ]; then
	DB_URL="sqlite://$DATA_DIR/setout.sqlite3"
fi

case "$DB_URL" in
postgres://* | postgresql://*) ENGINE="postgres" ;;
sqlite://*) ENGINE="sqlite" ;;
*)
	echo "Error: unrecognised SETOUT_DATABASE_URL: ${DB_URL%%:*}://..."
	echo "Setout supports sqlite:// and postgres:// only."
	exit 1
	;;
esac

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

if [ "$ENGINE" = "sqlite" ]; then
	DB_PATH="${DB_URL#sqlite://}"
	if [ ! -f "$DB_PATH" ]; then
		echo "Error: database not found: $DB_PATH"
		echo "Run the app or 'make seed' first so there is something to back up."
		exit 1
	fi
	DB_PATH="$(cd "$(dirname "$DB_PATH")" && pwd)/$(basename "$DB_PATH")"
	# .backup includes the write-ahead log, which a plain copy of a running database
	# does not. It runs in the staging directory because native sqlite3 on Windows
	# cannot read a path in the output name.
	if command -v sqlite3 >/dev/null 2>&1; then
		(cd "$STAGE" && sqlite3 "$DB_PATH" ".backup 'database.sqlite3'")
	else
		echo "Note: sqlite3 not found, copying the file directly."
		echo "      Stop the app first, or the copy may contain a partially written page."
		cp "$DB_PATH" "$STAGE/database.sqlite3"
	fi
else
	if ! command -v pg_dump >/dev/null 2>&1; then
		echo "Error: pg_dump not found, and SETOUT_DATABASE_URL points at Postgres."
		echo "Install the Postgres client tools, or download a backup from the app's"
		echo "Settings page."
		exit 1
	fi
	pg_dump --format=custom --file="$STAGE/database.dump" "$DB_URL"
fi

mkdir -p "$STAGE/files"
if [ -d "$DATA_DIR" ]; then
	tar -cf - -C "$DATA_DIR" \
		--exclude='./setout.sqlite3' \
		--exclude='./setout.sqlite3-wal' \
		--exclude='./setout.sqlite3-shm' \
		. | tar -xf - -C "$STAGE/files"
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
printf 'format=2\nengine=%s\ncreated=%s\n' "$ENGINE" "$STAMP" >"$STAGE/manifest.txt"

mkdir -p "$OUT_DIR"
BACKUP_FILE="$OUT_DIR/setout-backup-$ENGINE-$STAMP.tar.gz"
tar -czf "$BACKUP_FILE" -C "$STAGE" .

echo "Server backup written: $BACKUP_FILE"
echo "Engine: $ENGINE"
