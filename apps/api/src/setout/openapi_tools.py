"""OpenAPI helpers.

Generated SDK method names come from each route's operation_id, so every route
must set one explicitly. This module enforces that and can dump the schema.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.routing import APIRoute


def find_missing_operation_ids(app: FastAPI) -> list[str]:
    missing: list[str] = []
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        if not route.operation_id:
            methods = ",".join(sorted(route.methods or []))
            missing.append(f"{methods} {route.path}")
    return missing


def write_openapi(app: FastAPI, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # newline="\n" stops Windows from writing CRLF, which would leave the
    # committed schema looking modified after every make sdk.
    path.write_text(json.dumps(app.openapi(), indent=2) + "\n", encoding="utf-8", newline="\n")


def _main() -> int:
    from setout.main import create_app

    app = create_app()

    if len(sys.argv) > 1 and sys.argv[1] == "check":
        missing = find_missing_operation_ids(app)
        if missing:
            print("Routes missing an explicit operation_id:")
            for item in missing:
                print(f"  {item}")
            return 1
        print("All routes have an explicit operation_id.")
        return 0

    if len(sys.argv) > 2 and sys.argv[1] == "dump":
        write_openapi(app, Path(sys.argv[2]))
        print(f"Wrote OpenAPI schema to {sys.argv[2]}")
        return 0

    print("Usage: python -m setout.openapi_tools [check | dump <path>]")
    return 2


if __name__ == "__main__":
    raise SystemExit(_main())
