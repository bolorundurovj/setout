import pytest
from httpx import AsyncClient

from setout.currencies import CURRENCIES
from setout.models.currency import Currency

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def _setup(client: AsyncClient, *codes: str) -> dict[str, str]:
    wanted = codes or ("NGN",)
    await Currency.bulk_create(
        [Currency(code=c[0], name=c[1], exponent=c[2]) for c in CURRENCIES if c[0] in wanted]
    )
    await client.post("/api/auth/setup", json={"name": "Admin", "password": "password123"})
    projects = {}
    for code in wanted:
        resp = await client.post(
            "/api/projects", json={"name": f"House in {code}", "currency_code": code}
        )
        projects[code] = resp.json()["id"]
    return projects


async def _item(client: AsyncClient, name: str, unit: str | None = "each") -> dict:
    resp = await client.post("/api/items", json={"name": name, "unit": unit})
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _buy(client: AsyncClient, project_id: str, item_id: str, rate: int, day: str) -> dict:
    resp = await client.post(
        f"/api/projects/{project_id}/expenses",
        json={
            "description": "A purchase",
            "item_id": item_id,
            "quantity": "1",
            "unit_rate": rate,
            "spent_on": day,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_items_require_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/items")).status_code == 401


async def test_an_item_carries_a_unit(client: AsyncClient) -> None:
    await _setup(client)
    item = await _item(client, "Cement", unit="bag")

    assert item["unit"] == "bag"
    assert item["purchase_count"] == 0


async def test_the_same_name_twice_is_refused(client: AsyncClient) -> None:
    await _setup(client)
    await _item(client, "Cement")
    resp = await client.post("/api/items", json={"name": "cement"})

    assert resp.status_code == 409


async def test_a_name_freed_by_archiving_can_be_used_again(client: AsyncClient) -> None:
    await _setup(client)
    item = await _item(client, "Cement")
    assert (await client.delete(f"/api/items/{item['id']}")).status_code == 204

    assert (await client.post("/api/items", json={"name": "Cement"})).status_code == 201


async def test_items_can_be_searched_by_part_of_the_name(client: AsyncClient) -> None:
    await _setup(client)
    await _item(client, "Six inch blocks")
    await _item(client, "Nine inch blocks")
    await _item(client, "Cement")

    page = (await client.get("/api/items", params={"search": "inch"})).json()
    assert page["total"] == 2


async def test_archiving_hides_an_item_and_restoring_brings_it_back(client: AsyncClient) -> None:
    await _setup(client)
    item = await _item(client, "Cement")

    await client.delete(f"/api/items/{item['id']}")
    assert (await client.get("/api/items")).json()["total"] == 0
    assert (await client.get(f"/api/items/{item['id']}")).status_code == 404

    restored = await client.post(f"/api/items/{item['id']}/restore")
    assert restored.status_code == 200
    assert restored.json()["deleted_at"] is None
    assert (await client.get("/api/items")).json()["total"] == 1


async def test_every_purchase_builds_the_price_history(client: AsyncClient) -> None:
    projects = await _setup(client)
    item = await _item(client, "Six inch blocks")
    for rate, day in [
        (200_00, "2026-01-05"),
        (200_00, "2026-02-05"),
        (230_00, "2026-03-05"),
        (250_00, "2026-04-05"),
        (270_00, "2026-05-05"),
    ]:
        await _buy(client, projects["NGN"], item["id"], rate, day)

    prices = (await client.get(f"/api/items/{item['id']}/prices")).json()
    assert len(prices["series"]) == 1
    series = prices["series"][0]
    assert series["currency_code"] == "NGN"
    assert series["count"] == 5
    assert series["first_price"] == 200_00
    assert series["last_price"] == 270_00
    assert series["change_percent"] == 35.0
    assert [p["unit_rate"] for p in series["points"]] == [200_00, 200_00, 230_00, 250_00, 270_00]


async def test_the_purchase_count_reflects_priced_purchases(client: AsyncClient) -> None:
    projects = await _setup(client)
    item = await _item(client, "Cement")
    await _buy(client, projects["NGN"], item["id"], 11_000_00, "2026-05-05")

    assert (await client.get(f"/api/items/{item['id']}")).json()["purchase_count"] == 1


async def test_a_purchase_with_no_unit_rate_carries_no_price(client: AsyncClient) -> None:
    projects = await _setup(client)
    item = await _item(client, "Roofing sheets")
    resp = await client.post(
        f"/api/projects/{projects['NGN']}/expenses",
        json={"description": "Roofing sheets", "item_id": item["id"], "amount": 750_000_00},
    )
    assert resp.status_code == 201

    assert (await client.get(f"/api/items/{item['id']}")).json()["purchase_count"] == 0
    assert (await client.get(f"/api/items/{item['id']}/prices")).json()["series"] == []


async def test_two_currencies_make_two_series_never_one_total(client: AsyncClient) -> None:
    projects = await _setup(client, "NGN", "USD")
    item = await _item(client, "Cement")
    await _buy(client, projects["NGN"], item["id"], 11_000_00, "2026-05-05")
    await _buy(client, projects["USD"], item["id"], 9_00, "2026-05-06")

    series = (await client.get(f"/api/items/{item['id']}/prices")).json()["series"]
    assert [s["currency_code"] for s in series] == ["NGN", "USD"]
    assert [s["count"] for s in series] == [1, 1]


async def test_the_last_price_answers_in_the_projects_currency(client: AsyncClient) -> None:
    projects = await _setup(client, "NGN", "USD")
    item = await _item(client, "Cement")
    await _buy(client, projects["NGN"], item["id"], 4_500_00, "2026-04-05")
    await _buy(client, projects["NGN"], item["id"], 11_000_00, "2026-05-05")
    await _buy(client, projects["USD"], item["id"], 9_00, "2026-06-05")

    resp = (
        await client.get(f"/api/projects/{projects['NGN']}/items/{item['id']}/last-price")
    ).json()
    assert resp["item_id"] == item["id"]
    assert resp["last_price"]["unit_rate"] == 11_000_00
    assert resp["last_price"]["currency_code"] == "NGN"
    assert resp["last_price"]["spent_on"] == "2026-05-05"


async def test_there_is_no_last_price_before_the_first_purchase(client: AsyncClient) -> None:
    projects = await _setup(client)
    item = await _item(client, "Cement")

    resp = await client.get(f"/api/projects/{projects['NGN']}/items/{item['id']}/last-price")
    assert resp.status_code == 200
    assert resp.json()["last_price"] is None


async def test_the_last_price_names_the_vendor_it_was_bought_from(client: AsyncClient) -> None:
    projects = await _setup(client)
    item = await _item(client, "Cement")
    vendor = (await client.post("/api/vendors", json={"name": "Segun Blocks Owode"})).json()
    await client.post(
        f"/api/projects/{projects['NGN']}/expenses",
        json={
            "description": "Cement",
            "item_id": item["id"],
            "vendor_id": vendor["id"],
            "quantity": "1",
            "unit_rate": 11_000_00,
            "spent_on": "2026-05-05",
        },
    )

    resp = (
        await client.get(f"/api/projects/{projects['NGN']}/items/{item['id']}/last-price")
    ).json()
    assert resp["last_price"]["vendor_name"] == "Segun Blocks Owode"


async def test_a_removed_expense_leaves_the_price_history(client: AsyncClient) -> None:
    projects = await _setup(client)
    item = await _item(client, "Cement")
    expense = await _buy(client, projects["NGN"], item["id"], 11_000_00, "2026-05-05")

    await client.delete(f"/api/expenses/{expense['id']}")

    assert (await client.get(f"/api/items/{item['id']}/prices")).json()["series"] == []
    assert (await client.get(f"/api/items/{item['id']}")).json()["purchase_count"] == 0


async def test_prices_for_an_item_that_is_not_there(client: AsyncClient) -> None:
    await _setup(client)
    assert (await client.get("/api/items/nope/prices")).status_code == 404


async def test_an_item_can_be_renamed_but_not_onto_a_taken_name(client: AsyncClient) -> None:
    await _setup(client)
    cement = await _item(client, "Cement")
    await _item(client, "Blocks")

    assert (
        await client.patch(f"/api/items/{cement['id']}", json={"name": "Portland cement"})
    ).json()["name"] == "Portland cement"
    assert (
        await client.patch(f"/api/items/{cement['id']}", json={"name": "Blocks"})
    ).status_code == 409


async def test_an_expense_cannot_name_an_item_that_is_not_there(client: AsyncClient) -> None:
    projects = await _setup(client)
    resp = await client.post(
        f"/api/projects/{projects['NGN']}/expenses",
        json={"description": "Cement", "amount": 100, "item_id": "nope"},
    )
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Item not found"


async def test_the_item_list_carries_first_last_and_change_per_currency(
    client: AsyncClient,
) -> None:
    projects = await _setup(client, "NGN", "USD")
    item = await _item(client, "Six inch blocks")
    await _buy(client, projects["NGN"], item["id"], 200_00, "2026-01-05")
    await _buy(client, projects["NGN"], item["id"], 270_00, "2026-05-05")
    await _buy(client, projects["USD"], item["id"], 1_00, "2026-05-06")

    row = (await client.get("/api/items")).json()["items"][0]
    assert row["purchase_count"] == 3
    by_code = {p["currency_code"]: p for p in row["prices"]}
    assert by_code["NGN"]["first_price"] == 200_00
    assert by_code["NGN"]["last_price"] == 270_00
    assert by_code["NGN"]["change_percent"] == 35.0
    assert by_code["USD"]["count"] == 1
    assert by_code["USD"]["change_percent"] is None


async def test_an_item_nobody_has_bought_has_no_prices(client: AsyncClient) -> None:
    await _setup(client)
    await _item(client, "Cement")

    row = (await client.get("/api/items")).json()["items"][0]
    assert row["prices"] == []
    assert row["purchase_count"] == 0
