"""Unit tests for database lifecycle helpers."""

from __future__ import annotations

import pytest

from setout.config import get_settings
from setout.db import build_tortoise_config, db_status

pytestmark = pytest.mark.unit


async def test_db_status_reports_error_without_a_connection() -> None:
    # With no active connection, the status check must not raise; it reports
    # "error" so the health endpoint can degrade gracefully.
    assert await db_status() == "error"


def test_build_tortoise_config_registers_the_models_app() -> None:
    get_settings.cache_clear()
    config = build_tortoise_config()
    apps = config["apps"]
    assert "models" in apps  # type: ignore[operator]
    assert apps["models"]["migrations"] == "setout.migrations"  # type: ignore[index]
