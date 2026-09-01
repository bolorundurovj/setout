"""Integration tests for serving the built web app.

The single image has the API serve the browser bundle, so the client-side
routes have to survive a refresh.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from setout.config import get_settings
from setout.main import create_app

pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def web(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[AsyncClient]:
    root = tmp_path / "web"
    root.mkdir()
    (root / "index.html").write_text("<app-root></app-root>", encoding="utf-8")
    (root / "favicon.svg").write_text("<svg></svg>", encoding="utf-8")
    monkeypatch.setenv("SETOUT_STATIC_DIR", str(root))
    get_settings.cache_clear()

    transport = ASGITransport(app=create_app())
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    get_settings.cache_clear()


async def test_the_root_serves_the_app(web: AsyncClient) -> None:
    response = await web.get("/")
    assert response.status_code == 200
    assert "<app-root>" in response.text


async def test_a_client_route_survives_a_refresh(web: AsyncClient) -> None:
    response = await web.get("/people/new")
    assert response.status_code == 200
    assert "<app-root>" in response.text


async def test_an_asset_is_served_as_itself(web: AsyncClient) -> None:
    response = await web.get("/favicon.svg")
    assert response.status_code == 200
    assert response.text == "<svg></svg>"


async def test_an_unknown_api_path_stays_a_json_404(web: AsyncClient) -> None:
    response = await web.get("/api/nope")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")
