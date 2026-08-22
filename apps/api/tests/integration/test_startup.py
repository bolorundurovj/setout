"""Integration test for application startup.

Runs the real lifespan against a real SQLite file so migrations are applied on
start, then confirms a second start reports the database is up to date.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from setout import db as db_module
from setout.config import get_settings
from setout.main import create_app, lifespan

pytestmark = pytest.mark.integration


async def test_lifespan_applies_migrations_then_reports_up_to_date(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db_file = tmp_path / "startup.sqlite3"
    monkeypatch.setenv("SETOUT_DATABASE_URL", f"sqlite://{db_file.as_posix()}")
    get_settings.cache_clear()
    monkeypatch.setattr(db_module, "TORTOISE_ORM", db_module.build_tortoise_config())

    app = create_app()

    async with lifespan(app):
        assert await db_module.db_status() == "ok"

    first_plan_empty = await _is_up_to_date()
    assert first_plan_empty

    get_settings.cache_clear()


async def _is_up_to_date() -> bool:
    from tortoise import Tortoise
    from tortoise.migrations.api import plan as migration_plan

    try:
        pending = await migration_plan(config=db_module.TORTOISE_ORM)
    finally:
        # The migration API opens its own connection; close it or the aiosqlite
        # background thread keeps the process alive and pytest hangs at exit.
        await Tortoise.close_connections()
    # plan output lists a header line plus one line per step.
    steps = [line for line in pending if line.startswith(("+", "-"))]
    return steps == []
