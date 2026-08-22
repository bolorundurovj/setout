#!/usr/bin/env bash
# Regenerate the TypeScript SDK from the backend OpenAPI schema.
#
# Steps: import the FastAPI app and write openapi.json, generate the client with
# ng-openapi-gen, which needs no Java runtime, then format the output.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/apps/api"
SDK_DIR="$ROOT_DIR/packages/api-client"
OPENAPI_JSON="$SDK_DIR/openapi.json"



echo "Writing OpenAPI schema to $OPENAPI_JSON"
if command -v uv >/dev/null 2>&1; then
  UV_CMD="uv"
elif command -v uv.exe >/dev/null 2>&1; then
  UV_CMD="uv.exe"
else
  # Fallback to Powershell invoking uv if all else fails
  UV_CMD="powershell.exe -Command uv"
fi

( cd "$API_DIR" && $UV_CMD run python -m setout.openapi_tools dump "$OPENAPI_JSON" )

# Workspace dependencies install once at the root. Installing from inside a
# workspace member re-links the shared node_modules/.bin and breaks it.
# Skip the install when the toolchain is already there: make watch-sdk runs
# this on every save, and each install rewrites node_modules/.bin.
if [ -d "$ROOT_DIR/node_modules/ng-openapi-gen" ]; then
  echo "SDK toolchain already installed"
else
  echo "Installing SDK toolchain"
  ( cd "$ROOT_DIR" && ( yarn install --frozen-lockfile || yarn install ) )
fi

echo "Generating TypeScript client"
( cd "$SDK_DIR" && yarn ng-openapi-gen --config ng-openapi-gen.json )

# The generator writes CRLF on Windows, which leaves the committed client
# looking modified. Prettier rewrites it with LF, so the output is the same
# on every platform.
echo "Formatting the generated client"
( cd "$SDK_DIR" && yarn prettier --write "src/**/*.ts" >/dev/null )

echo "SDK generated at $SDK_DIR/src"
