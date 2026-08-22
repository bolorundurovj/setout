import pytest
from httpx import AsyncClient

from setout.currencies import CURRENCIES
from setout.models.currency import Currency

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def _setup(client: AsyncClient) -> str:
    await Currency.bulk_create(
        [Currency(code=c[0], name=c[1], exponent=c[2]) for c in CURRENCIES if c[0] == "NGN"]
    )
    await client.post("/api/auth/setup", json={"name": "Admin", "password": "password123"})
    resp = await client.post(
        "/api/projects", json={"name": "Jacaranda Close, Ewuru", "currency_code": "NGN"}
    )
    return str(resp.json()["id"])


async def _search(client: AsyncClient, query: str, **params: object) -> dict:
    resp = await client.get("/api/search", params={"q": query, **params})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _group(body: dict, kind: str) -> dict:
    found = [group for group in body["groups"] if group["kind"] == kind]
    return found[0] if found else {"total": 0, "hits": []}


async def test_search_requires_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/search", params={"q": "cement"})).status_code == 401


async def test_it_finds_the_same_word_across_every_kind(client: AsyncClient) -> None:
    project_id = await _setup(client)
    await client.post("/api/vendors", json={"name": "Corner Depot Cement"})
    await client.post("/api/items", json={"name": "Cement", "unit": "per bag"})
    await client.post("/api/people", json={"name": "Cement Mixer Man"})
    await client.post(
        f"/api/projects/{project_id}/expenses",
        json={"description": "17 bags of cement", "amount": 76_500_00},
    )

    body = await _search(client, "cement")

    assert _group(body, "vendors")["total"] == 1
    assert _group(body, "items")["total"] == 1
    assert _group(body, "people")["total"] == 1
    assert _group(body, "expenses")["total"] == 1
    assert body["total"] == 4


async def test_a_word_nobody_wrote_finds_nothing_rather_than_everything(
    client: AsyncClient,
) -> None:
    await _setup(client)
    await client.post("/api/vendors", json={"name": "Corner Depot Cement"})

    body = await _search(client, "helicopter")

    assert body["total"] == 0
    assert body["groups"] == []


async def test_an_empty_search_asks_for_nothing(client: AsyncClient) -> None:
    await _setup(client)

    body = await _search(client, "   ")

    assert body["total"] == 0
    assert body["groups"] == []


async def test_an_expense_hit_carries_what_it_takes_to_read_it(client: AsyncClient) -> None:
    project_id = await _setup(client)
    vendor = (await client.post("/api/vendors", json={"name": "Corner Depot"})).json()
    await client.post(
        f"/api/projects/{project_id}/expenses",
        json={
            "description": "17 bags of cement",
            "amount": 76_500_00,
            "vendor_id": vendor["id"],
            "spent_on": "2026-08-14",
        },
    )

    hit = _group(await _search(client, "bags"), "expenses")["hits"][0]

    assert hit["title"] == "17 bags of cement"
    assert hit["detail"] == "Corner Depot"
    assert hit["project_id"] == project_id
    assert hit["amount"] == 76_500_00
    assert hit["currency_code"] == "NGN"
    assert hit["currency_exponent"] == 2
    assert hit["spent_on"] == "2026-08-14"


async def test_it_looks_past_the_name_into_the_other_columns(client: AsyncClient) -> None:
    project_id = await _setup(client)
    await client.post("/api/vendors", json={"name": "Bright Star", "trade": "Roofing"})
    await client.post("/api/people", json={"name": "Aunty Ngozi", "role": "Roofing supervisor"})
    await client.post(
        f"/api/projects/{project_id}/expenses",
        json={"description": "Sheets", "amount": 100, "notes": "for the roofing"},
    )

    body = await _search(client, "roofing")

    assert _group(body, "vendors")["total"] == 1
    assert _group(body, "people")["total"] == 1
    assert _group(body, "expenses")["total"] == 1


async def test_case_does_not_matter(client: AsyncClient) -> None:
    await _setup(client)
    await client.post("/api/vendors", json={"name": "Corner Depot Cement"})

    assert _group(await _search(client, "CEMENT"), "vendors")["total"] == 1
    assert _group(await _search(client, "cement"), "vendors")["total"] == 1


async def test_what_was_taken_off_the_record_is_not_found(client: AsyncClient) -> None:
    await _setup(client)
    vendor = (await client.post("/api/vendors", json={"name": "Corner Depot Cement"})).json()
    await client.delete(f"/api/vendors/{vendor['id']}")

    assert (await _search(client, "cement"))["total"] == 0


async def test_it_says_how_many_matched_even_when_it_lists_fewer(client: AsyncClient) -> None:
    await _setup(client)
    for number in range(5):
        await client.post("/api/vendors", json={"name": f"Cement Seller {number}"})

    group = _group(await _search(client, "cement", limit=2), "vendors")

    assert group["total"] == 5
    assert len(group["hits"]) == 2
