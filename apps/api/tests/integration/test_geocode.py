"""Integration tests for turning a pin into an address.

Nothing here reaches the network. The outbound call is replaced rather than the
HTTP client itself, because the test client is an httpx client too and patching
that would hijack the very request under test.
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
def _fresh(monkeypatch: pytest.MonkeyPatch) -> None:
    geocoder.forget()
    monkeypatch.setattr(geocoder, "MIN_SECONDS_BETWEEN", 0.0)


async def _setup(client: AsyncClient) -> None:
    await client.post("/api/auth/setup", json={"name": "Admin", "password": "password123"})


def _asks(monkeypatch: pytest.MonkeyPatch, found: GeocodedPlace | None) -> list[object]:
    calls: list[object] = []

    async def fake(url: str, email: str, at: tuple[float, float]) -> GeocodedPlace | None:
        calls.append(at)
        return found

    monkeypatch.setattr(geocoder, "_ask", fake)
    return calls


async def test_geocoding_requires_authentication(client: AsyncClient) -> None:
    resp = await client.get("/api/geocode", params={"latitude": 6.5, "longitude": 3.3})
    assert resp.status_code == 401


async def test_a_pin_comes_back_as_a_place(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _setup(client)
    monkeypatch.setattr(get_settings(), "geocoder_url", "http://geocoder.test")
    _asks(monkeypatch, EWURU)

    body = (
        await client.get("/api/geocode", params={"latitude": 6.5244, "longitude": 3.3792})
    ).json()

    assert body["city"] == "Ewuru"
    assert body["state"] == "Ogun"
    assert body["country_code"] == "NG"


async def test_nothing_is_asked_when_the_geocoder_is_off(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _setup(client)
    monkeypatch.setattr(get_settings(), "geocoder_url", "")
    calls = _asks(monkeypatch, EWURU)

    resp = await client.get("/api/geocode", params={"latitude": 6.5244, "longitude": 3.3792})

    assert resp.status_code == 200
    assert resp.json() is None
    assert calls == []


async def test_the_same_spot_is_only_asked_once(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _setup(client)
    monkeypatch.setattr(get_settings(), "geocoder_url", "http://geocoder.test")
    calls = _asks(monkeypatch, EWURU)

    at = {"latitude": 6.5244, "longitude": 3.3792}
    await client.get("/api/geocode", params=at)
    await client.get("/api/geocode", params=at)

    assert len(calls) == 1


async def test_a_pin_off_the_earth_is_refused(client: AsyncClient) -> None:
    await _setup(client)

    resp = await client.get("/api/geocode", params={"latitude": 91, "longitude": 3.3})

    assert resp.status_code == 422


async def test_no_signal_answers_with_nothing(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _setup(client)
    monkeypatch.setattr(get_settings(), "geocoder_url", "http://geocoder.test")
    _asks(monkeypatch, None)

    resp = await client.get("/api/geocode", params={"latitude": 6.5244, "longitude": 3.3792})

    assert resp.status_code == 200
    assert resp.json() is None
