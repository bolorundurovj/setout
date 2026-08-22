"""Unit tests for the OpenAPI helpers."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI

from setout import openapi_tools
from setout.main import create_app
from setout.openapi_tools import find_missing_operation_ids, write_openapi

pytestmark = pytest.mark.unit


def test_every_route_has_an_operation_id() -> None:
    app = create_app()
    assert find_missing_operation_ids(app) == []


def test_find_missing_operation_ids_detects_a_missing_one() -> None:
    app = FastAPI()

    @app.get("/no-id")
    def no_id() -> dict[str, str]:
        return {}

    missing = find_missing_operation_ids(app)
    assert any("/no-id" in item for item in missing)


def test_write_openapi_writes_a_schema(tmp_path: Path) -> None:
    app = create_app()
    out = tmp_path / "openapi.json"
    write_openapi(app, out)
    text = out.read_text(encoding="utf-8")
    assert '"openapi"' in text
    assert "getHealth" in text


def test_main_check_passes_for_the_real_app(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(openapi_tools.sys, "argv", ["openapi_tools", "check"])
    assert openapi_tools._main() == 0


def test_main_dump_writes_a_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    out = tmp_path / "schema.json"
    monkeypatch.setattr(openapi_tools.sys, "argv", ["openapi_tools", "dump", str(out)])
    assert openapi_tools._main() == 0
    assert out.exists()


def test_main_without_arguments_prints_usage(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(openapi_tools.sys, "argv", ["openapi_tools"])
    assert openapi_tools._main() == 2
