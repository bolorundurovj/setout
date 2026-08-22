import pytest
from httpx import AsyncClient

from setout.currencies import CURRENCIES
from setout.models.currency import Currency

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def _project(client: AsyncClient) -> str:
    await Currency.bulk_create(
        [Currency(code=c[0], name=c[1], exponent=c[2]) for c in CURRENCIES if c[0] == "NGN"]
    )
    await client.post("/api/auth/setup", json={"name": "Admin", "password": "password123"})
    resp = await client.post(
        "/api/projects", json={"name": "Jacaranda Close, Ewuru", "currency_code": "NGN"}
    )
    return str(resp.json()["id"])


async def _vendor(client: AsyncClient, name: str = "Corner Depot Cement") -> str:
    resp = await client.post("/api/vendors", json={"name": name})
    return str(resp.json()["id"])


async def _spend(client: AsyncClient, project_id: str, **body: object) -> dict:
    payload = {"description": "17 bags of cement", "amount": 76_500_00} | body
    resp = await client.post(f"/api/projects/{project_id}/expenses", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _delivery(client: AsyncClient, project_id: str, **body: object) -> dict:
    resp = await client.post(f"/api/projects/{project_id}/deliveries", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_deliveries_require_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/projects/nope/deliveries")).status_code == 401


async def test_what_is_owed_reads_its_figure_from_the_expense(client: AsyncClient) -> None:
    project_id = await _project(client)
    vendor_id = await _vendor(client)
    spend = await _spend(client, project_id, vendor_id=vendor_id)

    delivery = await _delivery(client, project_id, expense_id=spend["id"])

    assert delivery["amount"] == 76_500_00
    assert delivery["spent_on"] == spend["spent_on"]
    assert delivery["vendor_name"] == "Corner Depot Cement"
    assert delivery["received_at"] is None


async def test_it_takes_its_words_from_the_expense_unless_told_otherwise(
    client: AsyncClient,
) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id, description="12 bags of cement plus delivery")

    borrowed = await _delivery(client, project_id, expense_id=spend["id"])
    assert borrowed["description"] == "12 bags of cement plus delivery"
    assert borrowed["promised"] is None

    other = await _spend(client, project_id, description="Roofing sheets")
    given = await _delivery(
        client,
        project_id,
        expense_id=other["id"],
        description="17 bags of cement",
        promised="this week",
    )
    assert given["description"] == "17 bags of cement"
    assert given["promised"] == "this week"


async def test_changing_the_expense_amount_moves_what_is_owed(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id, amount=76_500_00)
    delivery = await _delivery(client, project_id, expense_id=spend["id"])

    await client.patch(f"/api/expenses/{spend['id']}", json={"amount": 80_000_00})

    again = (await client.get(f"/api/deliveries/{delivery['id']}")).json()
    assert again["amount"] == 80_000_00


async def test_one_expense_cannot_be_owed_twice(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id)
    await _delivery(client, project_id, expense_id=spend["id"])

    resp = await client.post(
        f"/api/projects/{project_id}/deliveries", json={"expense_id": spend["id"]}
    )
    assert resp.status_code == 409


async def test_an_expense_from_another_project_is_refused(client: AsyncClient) -> None:
    project_id = await _project(client)
    other = await client.post(
        "/api/projects", json={"name": "Owode Bungalow", "currency_code": "NGN"}
    )
    other_id = other.json()["id"]
    spend = await _spend(client, project_id)

    resp = await client.post(
        f"/api/projects/{other_id}/deliveries", json={"expense_id": spend["id"]}
    )
    assert resp.status_code == 404


async def test_marking_it_delivered_drops_it_off_what_is_outstanding(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id)
    delivery = await _delivery(client, project_id, expense_id=spend["id"])

    outstanding = await client.get(
        f"/api/projects/{project_id}/deliveries", params={"outstanding_only": True}
    )
    assert outstanding.json()["total"] == 1

    received = await client.post(f"/api/deliveries/{delivery['id']}/received")
    assert received.status_code == 200
    assert received.json()["received_at"] is not None

    outstanding = await client.get(
        f"/api/projects/{project_id}/deliveries", params={"outstanding_only": True}
    )
    assert outstanding.json()["total"] == 0
    # It is still on the record, just no longer waited on.
    assert (await client.get(f"/api/projects/{project_id}/deliveries")).json()["total"] == 1


async def test_marking_it_twice_keeps_the_day_it_turned_up(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id)
    delivery = await _delivery(client, project_id, expense_id=spend["id"])

    first = (await client.post(f"/api/deliveries/{delivery['id']}/received")).json()
    second = (await client.post(f"/api/deliveries/{delivery['id']}/received")).json()
    assert first["received_at"] == second["received_at"]


async def test_a_delivery_marked_by_mistake_can_be_put_back(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id)
    delivery = await _delivery(client, project_id, expense_id=spend["id"])
    await client.post(f"/api/deliveries/{delivery['id']}/received")

    back = await client.delete(f"/api/deliveries/{delivery['id']}/received")
    assert back.status_code == 200
    assert back.json()["received_at"] is None


async def test_deliveries_can_be_read_by_vendor(client: AsyncClient) -> None:
    project_id = await _project(client)
    cement = await _vendor(client, "Corner Depot Cement")
    timber = await _vendor(client, "Riverside Sawmill")
    one = await _spend(client, project_id, vendor_id=cement)
    two = await _spend(client, project_id, vendor_id=timber)
    await _delivery(client, project_id, expense_id=one["id"])
    await _delivery(client, project_id, expense_id=two["id"])

    page = await client.get(f"/api/projects/{project_id}/deliveries", params={"vendor_id": cement})
    assert page.json()["total"] == 1
    assert page.json()["items"][0]["vendor_name"] == "Corner Depot Cement"


async def test_what_is_owed_reads_across_every_project(client: AsyncClient) -> None:
    project_id = await _project(client)
    other = (
        await client.post("/api/projects", json={"name": "Owode Bungalow", "currency_code": "NGN"})
    ).json()["id"]
    here = await _spend(client, project_id)
    there = await _spend(client, other, description="Blocks")
    await _delivery(client, project_id, expense_id=here["id"])
    await _delivery(client, other, expense_id=there["id"])

    assert (await client.get("/api/deliveries")).json()["total"] == 2


async def test_spend_with_no_vendor_still_records_what_is_owed(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id)

    delivery = await _delivery(client, project_id, expense_id=spend["id"])

    assert delivery["vendor_id"] is None
    assert delivery["vendor_name"] is None


async def test_a_deleted_delivery_leaves_the_list_and_can_come_back(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id)
    delivery = await _delivery(client, project_id, expense_id=spend["id"])

    assert (await client.delete(f"/api/deliveries/{delivery['id']}")).status_code == 204
    assert (await client.get(f"/api/projects/{project_id}/deliveries")).json()["total"] == 0

    restored = await client.post(f"/api/deliveries/{delivery['id']}/restore")
    assert restored.status_code == 200
    assert (await client.get(f"/api/projects/{project_id}/deliveries")).json()["total"] == 1


async def test_the_record_export_carries_deliveries(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id)
    await _delivery(client, project_id, expense_id=spend["id"])

    record = (await client.get("/api/install/export")).json()
    assert record["row_counts"]["delivery"] == 1


async def test_taking_the_expense_off_the_record_takes_what_it_owed_with_it(
    client: AsyncClient,
) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id)
    delivery = await _delivery(client, project_id, expense_id=spend["id"])

    assert (await client.delete(f"/api/expenses/{spend['id']}")).status_code == 204

    listing = (await client.get(f"/api/projects/{project_id}/deliveries")).json()
    assert listing["total"] == 0
    assert listing["owed_amount"] == 0
    assert (await client.get(f"/api/deliveries/{delivery['id']}")).status_code == 404
    assert (await client.post(f"/api/deliveries/{delivery['id']}/received")).status_code == 404


async def test_putting_the_expense_back_puts_what_it_owed_back(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id)
    delivery = await _delivery(client, project_id, expense_id=spend["id"])

    await client.delete(f"/api/expenses/{spend['id']}")
    assert (await client.post(f"/api/expenses/{spend['id']}/restore")).status_code == 200

    listing = (await client.get(f"/api/projects/{project_id}/deliveries")).json()
    assert listing["total"] == 1
    assert listing["items"][0]["id"] == delivery["id"]
    assert listing["owed_amount"] == 76_500_00


async def test_what_has_arrived_can_be_asked_for_on_its_own(client: AsyncClient) -> None:
    project_id = await _project(client)
    here = await _delivery(client, project_id, expense_id=(await _spend(client, project_id))["id"])
    await _delivery(
        client,
        project_id,
        expense_id=(await _spend(client, project_id, description="A door"))["id"],
    )
    await client.post(f"/api/deliveries/{here['id']}/received")

    arrived = (await client.get(f"/api/projects/{project_id}/deliveries?received_only=true")).json()
    waiting = (
        await client.get(f"/api/projects/{project_id}/deliveries?outstanding_only=true")
    ).json()

    assert [row["id"] for row in arrived["items"]] == [here["id"]]
    assert arrived["owed_amount"] == 0
    assert waiting["total"] == 1
    assert waiting["owed_amount"] == 76_500_00


async def test_what_is_owed_counts_every_page_not_just_the_one_asked_for(
    client: AsyncClient,
) -> None:
    project_id = await _project(client)
    for number in range(3):
        spend = await _spend(client, project_id, description=f"Load {number}", amount=1_000_00)
        await _delivery(client, project_id, expense_id=spend["id"])

    page = (await client.get(f"/api/projects/{project_id}/deliveries?limit=1")).json()

    assert len(page["items"]) == 1
    assert page["total"] == 3
    assert page["owed_amount"] == 3_000_00
