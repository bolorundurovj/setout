"""Shared test fixtures.

Integration and contract tests run against a fresh in-memory SQLite database
per test, through the real ASGI app, with nothing mocked.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from pathlib import Path

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
    from apps/api. Tests must not answer differently on a machine that has one.
    """
    monkeypatch.setitem(Settings.model_config, "env_file", None)
    for name in list(os.environ):
        if name.startswith("SETOUT_"):
            monkeypatch.delenv(name, raising=False)
    get_settings.cache_clear()


@pytest_asyncio.fixture
async def client(tmp_path: Path) -> AsyncIterator[AsyncClient]:
    await Tortoise.init(
        db_url="sqlite://:memory:",
        modules={"models": ["setout.models"]},
    )
    await Tortoise.generate_schemas()
    app = create_app()
    # Files go to a scratch directory for the length of one test. The real
    # local backend does the writing, so the path that ships is the one tested.
    app.dependency_overrides[get_storage] = lambda: LocalStorage(tmp_path / "attachments")
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            yield c
    finally:
        await Tortoise.close_connections()
