# Helpers shared by backup.sh and restore.sh. Source this file; do not run it.

# Export SETOUT_* settings from the repository .env, the file the app reads.
# Variables already set in the environment take precedence, as they do for the app.
load_env() {
	local file="$1/.env" line key value
	[ -f "$file" ] || return 0
	while IFS= read -r line || [ -n "$line" ]; do
		line="${line%$'\r'}"
		case "$line" in
		SETOUT_*=*) ;;
		*) continue ;;
		esac
		key="${line%%=*}"
		value="${line#*=}"
		case "$value" in
		\"*\") value="${value#\"}" value="${value%\"}" ;;
		\'*\') value="${value#\'}" value="${value%\'}" ;;
		esac
		if [ -z "${!key+set}" ]; then
			export "$key=$value"
		fi
	done <"$file"
}

# A path the native tools understand. Windows Python cannot open /c/... paths.
native_path() {
	if command -v cygpath >/dev/null 2>&1; then
		cygpath -w "$1"
	else
		printf '%s\n' "$1"
	fi
}

# Copy a SQLite database with its write-ahead log, which a plain file copy misses.
snapshot_sqlite() {
	local source="$1" target="$2" python
	if command -v sqlite3 >/dev/null 2>&1; then
		# Runs in the target directory because native sqlite3 on Windows cannot handle a
		# directory in the output filename.
		(cd "$(dirname "$target")" && sqlite3 "$source" ".backup '$(basename "$target")'")
		return
	fi
	python="$(command -v python3 || command -v python || true)"
	if [ -z "$python" ]; then
		echo "Error: neither sqlite3 nor Python is installed, so a consistent copy of the"
		echo "       database cannot be made. Install one of them, or download a backup"
		echo "       from the app's Settings page."
		exit 1
	fi
	"$python" -c '
import sqlite3, sys
source = sqlite3.connect(sys.argv[1])
target = sqlite3.connect(sys.argv[2])
source.backup(target)
target.close()
source.close()
' "$(native_path "$source")" "$(native_path "$target")"
}
