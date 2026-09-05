"""Integration tests for where the map gets its tiles."""

import pytest
from httpx import AsyncClient

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def _setup(client: AsyncClient) -> None:
    await client.post("/api/auth/setup", json={"name": "Admin", "password": "password123"})


async def test_the_map_settings_require_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/map")).status_code == 401


async def test_the_tiles_come_from_openstreetmap_unless_told_otherwise(
    client: AsyncClient,
) -> None:
    await _setup(client)

    body = (await client.get("/api/map")).json()

    assert "{z}" in body["tile_url"] and "{x}" in body["tile_url"] and "{y}" in body["tile_url"]
    assert "openstreetmap" in body["tile_url"]
    assert body["attribution"]


async def test_an_operator_can_point_it_at_their_own_tiles(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from setout.config import get_settings

    await _setup(client)
    monkeypatch.setattr(get_settings(), "map_tile_url", "http://tiles.lan/{z}/{x}/{y}.png")

    body = (await client.get("/api/map")).json()

    assert body["tile_url"] == "http://tiles.lan/{z}/{x}/{y}.png"
