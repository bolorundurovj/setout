"""Turning a pin into an address, without ever leaving the machine."""

from typing import Any

import httpx
import pytest

from setout.config import get_settings
from setout.services import geocoder

pytestmark = [pytest.mark.unit, pytest.mark.asyncio]

REPLY = {
    "display_name": "14 Jacaranda Close, Ewuru, Ogun, Nigeria",
    "address": {"road": "Jacaranda Close", "town": "Ewuru", "state": "Ogun", "country_code": "ng"},
}


@pytest.fixture(autouse=True)
def _fresh(monkeypatch: pytest.MonkeyPatch) -> None:
    geocoder.forget()
    monkeypatch.setattr(geocoder, "_last_call", 0.0)
    monkeypatch.setattr(geocoder, "MIN_SECONDS_BETWEEN", 0.0)
    settings = get_settings()
    monkeypatch.setattr(settings, "geocoder_url", "http://geocoder.test")
    monkeypatch.setattr(settings, "geocoder_email", "")


def _answers(calls: list[str], body: Any = REPLY, status: int = 200) -> None:
    async def fake(self: Any, url: str, **kwargs: Any) -> httpx.Response:
        calls.append(url)
        return httpx.Response(status, json=body, request=httpx.Request("GET", url))

    return fake  # type: ignore[return-value]


async def test_a_pin_becomes_a_place(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    monkeypatch.setattr(httpx.AsyncClient, "get", _answers(calls))

    found = await geocoder.reverse(6.5244, 3.3792)

    assert found is not None
    assert found.city == "Ewuru"
    assert found.state == "Ogun"
    assert found.country_code == "NG"
    assert found.address is not None and "Jacaranda" in found.address


async def test_the_same_spot_is_only_asked_once(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    monkeypatch.setattr(httpx.AsyncClient, "get", _answers(calls))

    await geocoder.reverse(6.5244, 3.3792)
    await geocoder.reverse(6.5244, 3.3792)

    assert len(calls) == 1


async def test_nudging_the_pin_a_hand_width_is_the_same_spot(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []
    monkeypatch.setattr(httpx.AsyncClient, "get", _answers(calls))

    await geocoder.reverse(6.5244000, 3.3792000)
    await geocoder.reverse(6.5244001, 3.3792001)

    assert len(calls) == 1


async def test_a_pin_down_the_road_is_asked_again(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    monkeypatch.setattr(httpx.AsyncClient, "get", _answers(calls))

    await geocoder.reverse(6.5244, 3.3792)
    await geocoder.reverse(6.5299, 3.3792)

    assert len(calls) == 2


async def test_nothing_is_asked_when_the_geocoder_is_off(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []
    monkeypatch.setattr(httpx.AsyncClient, "get", _answers(calls))
    monkeypatch.setattr(get_settings(), "geocoder_url", "")

    assert await geocoder.reverse(6.5244, 3.3792) is None
    assert calls == []


async def test_no_signal_says_nothing_rather_than_failing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def refuse(self: Any, url: str, **kwargs: Any) -> httpx.Response:
        raise httpx.ConnectError("no route to host")

    monkeypatch.setattr(httpx.AsyncClient, "get", refuse)

    assert await geocoder.reverse(6.5244, 3.3792) is None


async def test_a_refusal_says_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    monkeypatch.setattr(httpx.AsyncClient, "get", _answers(calls, body={}, status=429))

    assert await geocoder.reverse(6.5244, 3.3792) is None


async def test_open_country_has_no_street(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    monkeypatch.setattr(
        httpx.AsyncClient, "get", _answers(calls, body={"address": {"country_code": "ng"}})
    )

    found = await geocoder.reverse(6.5244, 3.3792)

    assert found is not None
    assert found.city is None
    assert found.country_code == "NG"


async def test_a_village_counts_as_the_town(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    monkeypatch.setattr(
        httpx.AsyncClient,
        "get",
        _answers(calls, body={"address": {"village": "Ewuru", "country_code": "ng"}}),
    )

    found = await geocoder.reverse(6.5244, 3.3792)

    assert found is not None and found.city == "Ewuru"


async def test_an_answer_with_no_address_says_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    monkeypatch.setattr(httpx.AsyncClient, "get", _answers(calls, body={"error": "Unable"}))

    assert await geocoder.reverse(6.5244, 3.3792) is None
