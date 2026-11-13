"""Shared test fixtures.

Integration and contract tests use the real ASGI app and a fresh database per test.
SQLite is the default; TEST_DATABASE_URL enables isolated PostgreSQL databases.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import AsyncIterator
from pathlib import Path

import asyncpg
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from tortoise import Tortoise

from setout.config import Settings, get_settings
from setout.main import create_app
from setout.services.storage import LocalStorage, get_storage


@pytest.fixture(autouse=True)
def _ignore_local_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep a developer's own .env out of the suite.

    Settings reads the .env at the repository root so the app can be started
    from apps/api. A local .env must not change test results.
    """
    monkeypatch.setitem(Settings.model_config, "env_file", None)
    for name in list(os.environ):
        if name.startswith("SETOUT_"):
            monkeypatch.delenv(name, raising=False)
    get_settings.cache_clear()


@pytest_asyncio.fixture
async def client(tmp_path: Path) -> AsyncIterator[AsyncClient]:
    database_url = os.environ.get("TEST_DATABASE_URL", "sqlite://:memory:")
    admin = None
    database_name = f"setout_test_{uuid.uuid4().hex}"
    if database_url.startswith("postgres"):
        admin = await asyncpg.connect(database_url)
        await admin.execute(f'CREATE DATABASE "{database_name}"')
        database_url = database_url.rsplit("/", 1)[0] + "/" + database_name
    await Tortoise.init(
        db_url=database_url,
        modules={"models": ["setout.models"]},
    )
    await Tortoise.generate_schemas()
    app = create_app()
    # Real LocalStorage under tmp_path, so the production write path is exercised.
    app.dependency_overrides[get_storage] = lambda: LocalStorage(tmp_path / "attachments")
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            yield c
    finally:
        await Tortoise.close_connections()
        if admin is not None:
            await admin.execute(f'DROP DATABASE "{database_name}"')
            await admin.close()
