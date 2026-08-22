"""Unit tests for settings. No I/O beyond a temp directory."""

from __future__ import annotations

from pathlib import Path

import pytest

from setout.config import Settings, get_settings

pytestmark = pytest.mark.unit


def test_explicit_database_url_is_used() -> None:
    settings = Settings(database_url="postgres://u:p@h:5432/db")
    assert settings.resolved_database_url() == "postgres://u:p@h:5432/db"


def test_default_database_url_is_sqlite_under_data_dir(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path, database_url="")
    url = settings.resolved_database_url()
    assert url.startswith("sqlite://")
    assert url.endswith("setout.sqlite3")
    assert tmp_path.is_dir()


def test_get_settings_is_cached() -> None:
    assert get_settings() is get_settings()
