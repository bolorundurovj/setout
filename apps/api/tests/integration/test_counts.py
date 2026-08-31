import pytest
from httpx import AsyncClient

from setout.currencies import CURRENCIES
from setout.models.currency import Currency

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def _signed_in(client: AsyncClient) -> None:
    await Currency.bulk_create(
        [Currency(code=c[0], name=c[1], exponent=c[2]) for c in CURRENCIES if c[0] == "NGN"]
    )
    await client.post("/api/auth/setup", json={"name": "Admin", "password": "password123"})


async def _counts(client: AsyncClient) -> dict:
    resp = await client.get("/api/counts")
    assert resp.status_code == 200, resp.text
    return resp.json()


async def test_counts_require_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/counts")).status_code == 401


async def test_a_fresh_install_counts_nothing(client: AsyncClient) -> None:
    await _signed_in(client)
    assert await _counts(client) == {
        "projects": 0,
        "vendors": 0,
        "items": 0,
        "people": 0,
        "lands": 0,
    }


async def test_counts_follow_what_has_been_added(client: AsyncClient) -> None:
    await _signed_in(client)
    await client.post(
        "/api/projects", json={"name": "Jacaranda Close, Ewuru", "currency_code": "NGN"}
    )
    await client.post("/api/projects", json={"name": "Owode Bungalow", "currency_code": "NGN"})
    await client.post("/api/vendors", json={"name": "Ewuru Block Works"})
    await client.post("/api/items", json={"name": "Cement", "unit": "bag"})
    await client.post("/api/people", json={"name": "Mum"})

    assert await _counts(client) == {
        "projects": 2,
        "vendors": 1,
        "items": 1,
        "people": 1,
        "lands": 0,
    }


async def test_what_has_been_archived_is_not_counted(client: AsyncClient) -> None:
    await _signed_in(client)
    project = (
        await client.post("/api/projects", json={"name": "Jacaranda Close", "currency_code": "NGN"})
    ).json()
    vendor = (await client.post("/api/vendors", json={"name": "Ewuru Block Works"})).json()

    await client.patch(f"/api/projects/{project['id']}", json={"status": "archived"})
    await client.delete(f"/api/projects/{project['id']}")
    await client.delete(f"/api/vendors/{vendor['id']}")

    counts = await _counts(client)
    assert counts["projects"] == 0
    assert counts["vendors"] == 0


async def test_a_restored_row_is_counted_again(client: AsyncClient) -> None:
    await _signed_in(client)
    vendor = (await client.post("/api/vendors", json={"name": "Ewuru Block Works"})).json()
    await client.delete(f"/api/vendors/{vendor['id']}")

    await client.post(f"/api/vendors/{vendor['id']}/restore")

    assert (await _counts(client))["vendors"] == 1


async def test_a_project_only_archived_still_counts(client: AsyncClient) -> None:
    await _signed_in(client)
    project = (
        await client.post("/api/projects", json={"name": "Ijapo Extension", "currency_code": "NGN"})
    ).json()

    await client.patch(f"/api/projects/{project['id']}", json={"status": "archived"})

    # It is still in the list until it is deleted, so the badge has to match.
    assert (await _counts(client))["projects"] == 1
