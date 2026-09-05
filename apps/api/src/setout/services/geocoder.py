"""What the map calls the spot a pin is on.

Nominatim asks that an application identify itself, keep to a request a second,
and not ask twice for the same thing. All three are this module's job, because
nothing else in the app makes an outbound call on a person's behalf.
"""

from __future__ import annotations

import asyncio
import time

import httpx

from setout import __version__
from setout.config import get_settings
from setout.schemas.geocode import GeocodedPlace

# Seven decimal places is a centimetre. Five is about a metre, which is finer
# than any pin is dropped, so nudging one does not ask again.
PLACES = 5

# What the tile policy asks of anyone using the public servers.
MIN_SECONDS_BETWEEN = 1.0
TIMEOUT_SECONDS = 5.0

_lock = asyncio.Lock()
_seen: dict[tuple[float, float], GeocodedPlace | None] = {}
_last_call = 0.0


async def reverse(latitude: float, longitude: float) -> GeocodedPlace | None:
    """None whenever the geocoder is off, unreachable, or has nothing to say."""
    settings = get_settings()
    if not settings.geocoder_url:
        return None

    at = (round(latitude, PLACES), round(longitude, PLACES))
    async with _lock:
        if at in _seen:
            return _seen[at]
        await _wait_our_turn()
        found = await _ask(settings.geocoder_url, settings.geocoder_email, at)
        _seen[at] = found
        return found


async def _wait_our_turn() -> None:
    global _last_call
    since = time.monotonic() - _last_call
    if since < MIN_SECONDS_BETWEEN:
        await asyncio.sleep(MIN_SECONDS_BETWEEN - since)
    _last_call = time.monotonic()


async def _ask(url: str, email: str, at: tuple[float, float]) -> GeocodedPlace | None:
    params = {
        "lat": str(at[0]),
        "lon": str(at[1]),
        "format": "jsonv2",
        "addressdetails": "1",
        "zoom": "18",
    }
    if email:
        params["email"] = email
    headers = {"User-Agent": f"Setout/{__version__} (self-hosted construction spend tracker)"}
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            response = await client.get(
                f"{url.rstrip('/')}/reverse", params=params, headers=headers
            )
            response.raise_for_status()
            return _read(response.json())
    except (httpx.HTTPError, ValueError):
        # A building site is where the signal is not. Saying nothing is correct.
        return None


def _read(body: object) -> GeocodedPlace | None:
    if not isinstance(body, dict):
        return None
    address = body.get("address")
    if not isinstance(address, dict):
        return None
    # Nominatim names the settlement differently by how big it is.
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


def forget() -> None:
    """Drop what has been looked up. For tests, which must never call out."""
    _seen.clear()
