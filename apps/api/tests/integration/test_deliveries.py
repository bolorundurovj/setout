import pytest
from httpx import AsyncClient

from setout.currencies import CURRENCIES
from setout.models.currency import Currency

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def _project(client: AsyncClient) -> str:
    await Currency.bulk_create(
        [Currency(code=c[0], name=c[1], exponent=c[2]) for c in CURRENCIES if c[0] == "NGN"]
    )
    await client.post("/api/auth/setup", json={"name": "Admin", "passphrase": "password123"})
    resp = await client.post(
        "/api/projects", json={"name": "Jacaranda Close, Ewuru", "currency_code": "NGN"}
    )
    return str(resp.json()["id"])


async def _vendor(client: AsyncClient, name: str = "Corner Depot Cement") -> str:
    resp = await client.post("/api/vendors", json={"name": name})
    return str(resp.json()["id"])


async def _expense(client: AsyncClient, project_id: str, **body: object) -> dict:
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


async def test_delivery_amount_comes_from_the_expense(client: AsyncClient) -> None:
    project_id = await _project(client)
    vendor_id = await _vendor(client)
    expense = await _expense(client, project_id, vendor_id=vendor_id)

    delivery = await _delivery(client, project_id, expense_id=expense["id"])

    assert delivery["amount"] == 76_500_00
    assert delivery["spent_on"] == expense["spent_on"]
    assert delivery["vendor_name"] == "Corner Depot Cement"
    assert delivery["received_at"] is None


async def test_description_defaults_to_the_expense_description(
    client: AsyncClient,
) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id, description="12 bags of cement plus delivery")

    defaulted = await _delivery(client, project_id, expense_id=expense["id"])
    assert defaulted["description"] == "12 bags of cement plus delivery"
    assert defaulted["expected"] is None

    other = await _expense(client, project_id, description="Roofing sheets")
    explicit = await _delivery(
        client,
        project_id,
        expense_id=other["id"],
        description="17 bags of cement",
        expected="this week",
    )
    assert explicit["description"] == "17 bags of cement"
    assert explicit["expected"] == "this week"


async def test_delivery_amount_follows_the_expense_amount(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id, amount=76_500_00)
    delivery = await _delivery(client, project_id, expense_id=expense["id"])

    await client.patch(f"/api/expenses/{expense['id']}", json={"amount": 80_000_00})

    again = (await client.get(f"/api/deliveries/{delivery['id']}")).json()
    assert again["amount"] == 80_000_00


async def test_expense_can_have_only_one_delivery(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id)
    await _delivery(client, project_id, expense_id=expense["id"])

    resp = await client.post(
        f"/api/projects/{project_id}/deliveries", json={"expense_id": expense["id"]}
    )
    assert resp.status_code == 409


async def test_expense_from_another_project_returns_404(client: AsyncClient) -> None:
    project_id = await _project(client)
    other = await client.post(
        "/api/projects", json={"name": "Owode Bungalow", "currency_code": "NGN"}
    )
    other_id = other.json()["id"]
    expense = await _expense(client, project_id)

    resp = await client.post(
        f"/api/projects/{other_id}/deliveries", json={"expense_id": expense["id"]}
    )
    assert resp.status_code == 404


async def test_received_delivery_is_not_outstanding(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id)
    delivery = await _delivery(client, project_id, expense_id=expense["id"])

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
    # Still listed without outstanding_only.
    assert (await client.get(f"/api/projects/{project_id}/deliveries")).json()["total"] == 1


async def test_marking_received_twice_keeps_the_first_received_at(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id)
    delivery = await _delivery(client, project_id, expense_id=expense["id"])

    first = (await client.post(f"/api/deliveries/{delivery['id']}/received")).json()
    second = (await client.post(f"/api/deliveries/{delivery['id']}/received")).json()
    assert first["received_at"] == second["received_at"]


async def test_received_mark_can_be_cleared(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id)
    delivery = await _delivery(client, project_id, expense_id=expense["id"])
    await client.post(f"/api/deliveries/{delivery['id']}/received")

    unreceived = await client.delete(f"/api/deliveries/{delivery['id']}/received")
    assert unreceived.status_code == 200
    assert unreceived.json()["received_at"] is None


async def test_deliveries_can_be_filtered_by_vendor(client: AsyncClient) -> None:
    project_id = await _project(client)
    cement = await _vendor(client, "Corner Depot Cement")
    timber = await _vendor(client, "Riverside Sawmill")
    one = await _expense(client, project_id, vendor_id=cement)
    two = await _expense(client, project_id, vendor_id=timber)
    await _delivery(client, project_id, expense_id=one["id"])
    await _delivery(client, project_id, expense_id=two["id"])

    page = await client.get(f"/api/projects/{project_id}/deliveries", params={"vendor_id": cement})
    assert page.json()["total"] == 1
    assert page.json()["items"][0]["vendor_name"] == "Corner Depot Cement"


async def test_deliveries_list_spans_every_project(client: AsyncClient) -> None:
    project_id = await _project(client)
    other = (
        await client.post("/api/projects", json={"name": "Owode Bungalow", "currency_code": "NGN"})
    ).json()["id"]
    this_expense = await _expense(client, project_id)
    other_expense = await _expense(client, other, description="Blocks")
    await _delivery(client, project_id, expense_id=this_expense["id"])
    await _delivery(client, other, expense_id=other_expense["id"])

    assert (await client.get("/api/deliveries")).json()["total"] == 2


async def test_expense_without_vendor_can_have_a_delivery(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id)

    delivery = await _delivery(client, project_id, expense_id=expense["id"])

    assert delivery["vendor_id"] is None
    assert delivery["vendor_name"] is None


async def test_archived_delivery_is_hidden_and_restorable(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id)
    delivery = await _delivery(client, project_id, expense_id=expense["id"])

    assert (await client.post(f"/api/deliveries/{delivery['id']}/archive")).status_code == 204
    assert (await client.get(f"/api/projects/{project_id}/deliveries")).json()["total"] == 0

    restored = await client.post(f"/api/deliveries/{delivery['id']}/restore")
    assert restored.status_code == 200
    assert (await client.get(f"/api/projects/{project_id}/deliveries")).json()["total"] == 1


async def test_archived_delivery_is_listed_with_include_archived_and_not_outstanding(
    client: AsyncClient,
) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id)
    delivery = await _delivery(client, project_id, expense_id=expense["id"])
    await client.post(f"/api/deliveries/{delivery['id']}/archive")

    page = (
        await client.get(
            f"/api/projects/{project_id}/deliveries", params={"include_archived": True}
        )
    ).json()
    assert [row["id"] for row in page["items"]] == [delivery["id"]]
    assert page["items"][0]["archived_at"]
    assert page["outstanding_amount"] == 0

    across = await client.get("/api/deliveries", params={"include_archived": True})
    assert across.json()["total"] == 1


async def test_backup_includes_deliveries(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id)
    await _delivery(client, project_id, expense_id=expense["id"])

    backup = (await client.get("/api/install/export")).json()
    assert backup["row_counts"]["delivery"] == 1


async def test_archiving_the_expense_archives_its_delivery(
    client: AsyncClient,
) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id)
    delivery = await _delivery(client, project_id, expense_id=expense["id"])

    assert (await client.post(f"/api/expenses/{expense['id']}/archive")).status_code == 204

    listing = (await client.get(f"/api/projects/{project_id}/deliveries")).json()
    assert listing["total"] == 0
    assert listing["outstanding_amount"] == 0
    assert (await client.get(f"/api/deliveries/{delivery['id']}")).status_code == 404
    assert (await client.post(f"/api/deliveries/{delivery['id']}/received")).status_code == 404


async def test_restoring_the_expense_restores_its_delivery(
    client: AsyncClient,
) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id)
    delivery = await _delivery(client, project_id, expense_id=expense["id"])

    await client.post(f"/api/expenses/{expense['id']}/archive")
    assert (await client.post(f"/api/expenses/{expense['id']}/restore")).status_code == 200

    listing = (await client.get(f"/api/projects/{project_id}/deliveries")).json()
    assert listing["total"] == 1
    assert listing["items"][0]["id"] == delivery["id"]
    assert listing["outstanding_amount"] == 76_500_00


async def test_received_only_and_outstanding_only_filters(client: AsyncClient) -> None:
    project_id = await _project(client)
    received_delivery = await _delivery(
        client, project_id, expense_id=(await _expense(client, project_id))["id"]
    )
    await _delivery(
        client,
        project_id,
        expense_id=(await _expense(client, project_id, description="A door"))["id"],
    )
    await client.post(f"/api/deliveries/{received_delivery['id']}/received")

    received = (
        await client.get(f"/api/projects/{project_id}/deliveries?received_only=true")
    ).json()
    outstanding = (
        await client.get(f"/api/projects/{project_id}/deliveries?outstanding_only=true")
    ).json()

    assert [row["id"] for row in received["items"]] == [received_delivery["id"]]
    assert received["outstanding_amount"] == 0
    assert outstanding["total"] == 1
    assert outstanding["outstanding_amount"] == 76_500_00


async def test_outstanding_amount_covers_all_pages(
    client: AsyncClient,
) -> None:
    project_id = await _project(client)
    for number in range(3):
        expense = await _expense(client, project_id, description=f"Load {number}", amount=1_000_00)
        await _delivery(client, project_id, expense_id=expense["id"])

    page = (await client.get(f"/api/projects/{project_id}/deliveries?limit=1")).json()

    assert len(page["items"]) == 1
    assert page["total"] == 3
    assert page["outstanding_amount"] == 3_000_00
