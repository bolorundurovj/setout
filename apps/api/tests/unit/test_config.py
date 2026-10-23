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


def test_sign_in_settings_are_read_under_their_name(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SETOUT_SIGN_IN_MAX_ATTEMPTS", "12")
    assert Settings().sign_in_max_attempts == 12


def test_sign_in_settings_are_still_read_under_the_login_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SETOUT_LOGIN_MAX_ATTEMPTS", "11")
    monkeypatch.setenv("SETOUT_LOGIN_DELAY_SECONDS", "0")
    settings = Settings()
    assert settings.sign_in_max_attempts == 11
    assert settings.sign_in_delay_seconds == 0


def test_the_sign_in_name_wins_over_the_login_name(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SETOUT_SIGN_IN_FREE_ATTEMPTS", "5")
    monkeypatch.setenv("SETOUT_LOGIN_FREE_ATTEMPTS", "9")
    assert Settings().sign_in_free_attempts == 5


def test_sign_in_settings_can_be_passed_by_name() -> None:
    assert Settings(sign_in_retry_after_seconds=5).sign_in_retry_after_seconds == 5
