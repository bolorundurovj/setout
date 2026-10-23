"""Integration tests for reverse geocoding coordinates to a map address.

No request reaches the network. The outbound lookup is stubbed rather than the
HTTP client, because the test client is also an httpx client and patching httpx
would intercept its requests.
"""

import pytest
from httpx import AsyncClient

from setout.config import get_settings
from setout.schemas.geocode import GeocodedPlace
from setout.services import geocoder

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]

EWURU = GeocodedPlace(
    address="14 Jacaranda Close, Ewuru, Ogun, Nigeria",
    city="Ewuru",
    state="Ogun",
    country_code="NG",
)


@pytest.fixture(autouse=True)
def _reset_geocoder(monkeypatch: pytest.MonkeyPatch) -> None:
    geocoder.clear_cache()
    monkeypatch.setattr(geocoder, "MIN_SECONDS_BETWEEN", 0.0)


async def _setup(client: AsyncClient) -> None:
    await client.post("/api/auth/setup", json={"name": "Admin", "passphrase": "password123"})


def _stub_lookup(monkeypatch: pytest.MonkeyPatch, place: GeocodedPlace | None) -> list[object]:
    calls: list[object] = []

    async def fake(url: str, email: str, coordinates: tuple[float, float]) -> GeocodedPlace | None:
        calls.append(coordinates)
        return place

    monkeypatch.setattr(geocoder, "_request_reverse", fake)
    return calls


async def test_geocoding_requires_authentication(client: AsyncClient) -> None:
    resp = await client.get("/api/geocode", params={"latitude": 6.5, "longitude": 3.3})
    assert resp.status_code == 401


async def test_reverse_geocode_returns_place(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _setup(client)
    monkeypatch.setattr(get_settings(), "geocoder_url", "http://geocoder.test")
    _stub_lookup(monkeypatch, EWURU)

    body = (
        await client.get("/api/geocode", params={"latitude": 6.5244, "longitude": 3.3792})
    ).json()

    assert body["city"] == "Ewuru"
    assert body["state"] == "Ogun"
    assert body["country_code"] == "NG"


async def test_no_lookup_when_geocoder_is_disabled(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _setup(client)
    monkeypatch.setattr(get_settings(), "geocoder_url", "")
    calls = _stub_lookup(monkeypatch, EWURU)

    resp = await client.get("/api/geocode", params={"latitude": 6.5244, "longitude": 3.3792})

    assert resp.status_code == 200
    assert resp.json() is None
    assert calls == []


async def test_repeat_coordinates_are_looked_up_once(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _setup(client)
    monkeypatch.setattr(get_settings(), "geocoder_url", "http://geocoder.test")
    calls = _stub_lookup(monkeypatch, EWURU)

    coordinates = {"latitude": 6.5244, "longitude": 3.3792}
    await client.get("/api/geocode", params=coordinates)
    await client.get("/api/geocode", params=coordinates)

    assert len(calls) == 1


async def test_out_of_range_latitude_is_rejected(client: AsyncClient) -> None:
    await _setup(client)

    resp = await client.get("/api/geocode", params={"latitude": 91, "longitude": 3.3})

    assert resp.status_code == 422


async def test_failed_lookup_returns_null(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _setup(client)
    monkeypatch.setattr(get_settings(), "geocoder_url", "http://geocoder.test")
    _stub_lookup(monkeypatch, None)

    resp = await client.get("/api/geocode", params={"latitude": 6.5244, "longitude": 3.3792})

    assert resp.status_code == 200
    assert resp.json() is None
