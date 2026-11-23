#!/usr/bin/env bash
# Write the database and the uploaded files into one dated server backup file.
#
# Usage: backup.sh [out-dir]
#
# Supports SQLite and Postgres. SQLite is copied from the data directory;
# Postgres is dumped with pg_dump. Settings come from the environment, then the
# repository .env, as they do for the app.
set -euo pipefail
# Backups hold the passphrase hash and every record, so only the owner may read them.
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/lib.sh
. "$ROOT_DIR/scripts/lib.sh"
load_env "$ROOT_DIR"
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
	snapshot_sqlite "$DB_PATH" "$STAGE/database.sqlite3"
	DB_NAME="$(basename "$DB_PATH")"
	EXCLUDES=(--exclude="./$DB_NAME" --exclude="./$DB_NAME-wal" --exclude="./$DB_NAME-shm")
else
	if ! command -v pg_dump >/dev/null 2>&1; then
		echo "Error: pg_dump not found, and SETOUT_DATABASE_URL points at Postgres."
		echo "Install the Postgres client tools, or download a backup from the app's"
		echo "Settings page."
		exit 1
	fi
	pg_dump --format=custom --file="$STAGE/database.dump" "$DB_URL"
	EXCLUDES=()
fi

mkdir -p "$STAGE/files"
if [ -d "$DATA_DIR" ]; then
	tar -cf - -C "$DATA_DIR" "${EXCLUDES[@]}" . | tar -xf - -C "$STAGE/files"
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
printf 'format=2\nengine=%s\ncreated=%s\n' "$ENGINE" "$STAMP" >"$STAGE/manifest.txt"

mkdir -p "$OUT_DIR"
BACKUP_FILE="$OUT_DIR/setout-backup-$ENGINE-$STAMP.tar.gz"
tar -czf "$BACKUP_FILE" -C "$STAGE" .

echo "Server backup written: $BACKUP_FILE"
echo "Engine: $ENGINE"
