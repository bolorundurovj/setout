"""Integration tests for the health endpoint."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from setout import __version__

pytestmark = pytest.mark.integration


async def test_healthz_reports_ok(client: AsyncClient) -> None:
    response = await client.get("/healthz")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    assert body["version"] == __version__
