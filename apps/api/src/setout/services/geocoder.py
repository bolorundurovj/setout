"""Reverse geocoding through Nominatim.

The Nominatim usage policy requires an identifying User-Agent, at most one request
per second, and caching of repeated requests. This module is the only outbound caller.
"""

from __future__ import annotations

import asyncio
import time

import httpx

from setout import __version__
from setout.config import get_settings
from setout.schemas.geocode import GeocodedPlace

# Five decimal places is about one metre, so a small pin move reuses the cached result.
COORDINATE_DECIMALS = 5

# Rate limit from the Nominatim usage policy for the public servers.
MIN_SECONDS_BETWEEN = 1.0
TIMEOUT_SECONDS = 5.0

_lock = asyncio.Lock()
_cache: dict[tuple[float, float], GeocodedPlace | None] = {}
_last_call = 0.0


async def reverse(latitude: float, longitude: float) -> GeocodedPlace | None:
    """Returns None when the geocoder is disabled, unreachable, or returns no address."""
    settings = get_settings()
    if not settings.geocoder_url:
        return None

    key = (round(latitude, COORDINATE_DECIMALS), round(longitude, COORDINATE_DECIMALS))
    async with _lock:
        if key in _cache:
            return _cache[key]
        await _throttle()
        place = await _request_reverse(settings.geocoder_url, settings.geocoder_email, key)
        _cache[key] = place
        return place


async def _throttle() -> None:
    global _last_call
    since = time.monotonic() - _last_call
    if since < MIN_SECONDS_BETWEEN:
        await asyncio.sleep(MIN_SECONDS_BETWEEN - since)
    _last_call = time.monotonic()


async def _request_reverse(
    url: str, email: str, coordinates: tuple[float, float]
) -> GeocodedPlace | None:
    params = {
        "lat": str(coordinates[0]),
        "lon": str(coordinates[1]),
        "format": "jsonv2",
        "addressdetails": "1",
        "zoom": "18",
    }
    if email:
        params["email"] = email
    headers = {"User-Agent": f"Setout/{__version__} (self-hosted construction expense tracker)"}
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            response = await client.get(
                f"{url.rstrip('/')}/reverse", params=params, headers=headers
            )
            response.raise_for_status()
            return _read(response.json())
    except (httpx.HTTPError, ValueError):
        # Geocoding is optional, so network and parse failures return no address.
        return None


def _read(body: object) -> GeocodedPlace | None:
    if not isinstance(body, dict):
        return None
    address = body.get("address")
    if not isinstance(address, dict):
        return None
    # Nominatim uses a different key for a settlement depending on its size.
    town = _first(address, "city", "town", "village", "hamlet", "suburb")
    country = address.get("country_code")
    return GeocodedPlace(
        address=str(body.get("display_name") or "") or None,
        city=town,
        state=_first(address, "state", "region", "province"),
        country_code=str(country).upper() if isinstance(country, str) else None,
    )


def _first(address: dict[str, object], *keys: str) -> str | None:
    for key in keys:
        value = address.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def clear_cache() -> None:
    """Clears the lookup cache between tests."""
    _cache.clear()
