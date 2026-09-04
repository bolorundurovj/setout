"""Integration tests for the country and state lists a land is checked against."""

import pytest
from httpx import AsyncClient

from setout.models.country import Country, State

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def seed_countries() -> None:
    await Country.bulk_create(
        [Country(code="NG", name="Nigeria"), Country(code="GH", name="Ghana")]
    )
    await State.bulk_create(
        [
            State(code="NG-LA", country_id="NG", name="Lagos"),
            State(code="NG-OG", country_id="NG", name="Ogun"),
            State(code="GH-AA", country_id="GH", name="Greater Accra"),
        ]
    )


async def _setup(client: AsyncClient) -> None:
    await seed_countries()
    await client.post("/api/auth/setup", json={"name": "Admin", "password": "password123"})


async def test_the_country_list_requires_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/countries")).status_code == 401


async def test_the_countries_are_listed(client: AsyncClient) -> None:
    await _setup(client)

    resp = await client.get("/api/countries")

    assert resp.status_code == 200
    assert {row["code"] for row in resp.json()} == {"NG", "GH"}


async def test_a_country_lists_only_its_own_states(client: AsyncClient) -> None:
    await _setup(client)

    resp = await client.get("/api/countries/NG/states")

    assert resp.status_code == 200
    assert [row["name"] for row in resp.json()] == ["Lagos", "Ogun"]


async def test_a_country_code_is_read_however_it_is_cased(client: AsyncClient) -> None:
    await _setup(client)

    resp = await client.get("/api/countries/ng/states")

    assert resp.status_code == 200
    assert len(resp.json()) == 2


async def test_states_of_a_country_that_is_not_there(client: AsyncClient) -> None:
    await _setup(client)

    assert (await client.get("/api/countries/ZZ/states")).status_code == 404
