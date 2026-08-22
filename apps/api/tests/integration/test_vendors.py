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


async def _vendor(client: AsyncClient, name: str, **extra: object) -> dict:
    resp = await client.post("/api/vendors", json={"name": name, **extra})
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _spend(client: AsyncClient, project_id: str, vendor_id: str, amount: int) -> dict:
    resp = await client.post(
        f"/api/projects/{project_id}/expenses",
        json={"description": "A purchase", "amount": amount, "vendor_id": vendor_id},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_vendors_require_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/vendors")).status_code == 401


async def test_a_vendor_keeps_the_trade_and_the_person_you_ask_for(client: AsyncClient) -> None:
    await _setup(client)
    vendor = await _vendor(
        client,
        "Bright Star Aluminium",
        trade="roofing sheets",
        contact_name="Mr Sola",
        phone="0800 000 0001",
    )

    assert vendor["trade"] == "roofing sheets"
    assert vendor["contact_name"] == "Mr Sola"
    assert vendor["phone"] == "0800 000 0001"
    assert vendor["expense_count"] == 0


async def test_a_vendor_needs_only_a_name(client: AsyncClient) -> None:
    await _setup(client)
    vendor = await _vendor(client, "Segun Blocks Owode")

    assert vendor["trade"] is None
    assert vendor["phone"] is None


async def test_the_same_vendor_name_twice_is_refused(client: AsyncClient) -> None:
    await _setup(client)
    await _vendor(client, "Sawmill Jacaranda Close")
    resp = await client.post("/api/vendors", json={"name": "sawmill jacaranda close"})

    assert resp.status_code == 409


async def test_vendors_can_be_searched_by_part_of_the_name(client: AsyncClient) -> None:
    await _setup(client)
    await _vendor(client, "Cement Depot Jacaranda Close")
    await _vendor(client, "Sawmill Jacaranda Close")
    await _vendor(client, "Idris Bricklaying")

    page = (await client.get("/api/vendors", params={"search": "Jacaranda Close"})).json()
    assert page["total"] == 2


async def test_archiving_takes_a_vendor_off_the_list(client: AsyncClient) -> None:
    await _setup(client)
    vendor = await _vendor(client, "Corner Depot Cement", notes="no longer trading")

    assert (await client.delete(f"/api/vendors/{vendor['id']}")).status_code == 204
    assert (await client.get("/api/vendors")).json()["total"] == 0

    archived = (await client.get("/api/vendors", params={"include_archived": True})).json()
    assert archived["total"] == 1


async def test_an_archived_vendor_can_still_be_opened(client: AsyncClient) -> None:
    await _setup(client)
    vendor = await _vendor(client, "Corner Depot Cement")
    await client.delete(f"/api/vendors/{vendor['id']}")

    resp = await client.get(f"/api/vendors/{vendor['id']}")
    assert resp.status_code == 200
    assert resp.json()["deleted_at"] is not None


async def test_taking_a_vendor_out_of_the_archive(client: AsyncClient) -> None:
    await _setup(client)
    vendor = await _vendor(client, "Idris Bricklaying")
    await client.delete(f"/api/vendors/{vendor['id']}")

    restored = await client.post(f"/api/vendors/{vendor['id']}/restore")
    assert restored.status_code == 200
    assert restored.json()["deleted_at"] is None
    assert (await client.get("/api/vendors")).json()["total"] == 1


async def test_spend_filed_against_an_archived_vendor_still_counts(client: AsyncClient) -> None:
    projects = await _setup(client)
    vendor = await _vendor(client, "Bright Star Aluminium")
    await _spend(client, projects["NGN"], vendor["id"], 750_000_00)
    await client.delete(f"/api/vendors/{vendor['id']}")

    spend = (await client.get(f"/api/vendors/{vendor['id']}/spend")).json()
    assert spend["projects"][0]["spent_amount"] == 750_000_00


async def test_spend_is_listed_per_project_never_added_across_currencies(
    client: AsyncClient,
) -> None:
    projects = await _setup(client, "NGN", "USD")
    vendor = await _vendor(client, "Bright Star Aluminium")
    await _spend(client, projects["NGN"], vendor["id"], 750_000_00)
    await _spend(client, projects["USD"], vendor["id"], 400_00)

    spend = (await client.get(f"/api/vendors/{vendor['id']}/spend")).json()
    assert len(spend["projects"]) == 2
    by_code = {row["currency_code"]: row for row in spend["projects"]}
    assert by_code["NGN"]["spent_amount"] == 750_000_00
    assert by_code["USD"]["spent_amount"] == 400_00


async def test_several_purchases_from_one_vendor_are_summed_within_a_project(
    client: AsyncClient,
) -> None:
    projects = await _setup(client)
    vendor = await _vendor(client, "Segun Blocks Owode")
    await _spend(client, projects["NGN"], vendor["id"], 150_000_00)
    await _spend(client, projects["NGN"], vendor["id"], 50_000_00)

    row = (await client.get(f"/api/vendors/{vendor['id']}/spend")).json()["projects"][0]
    assert row["expense_count"] == 2
    assert row["spent_amount"] == 200_000_00


async def test_a_vendor_with_no_spend_reports_no_projects(client: AsyncClient) -> None:
    await _setup(client)
    vendor = await _vendor(client, "Segun Blocks Owode")

    assert (await client.get(f"/api/vendors/{vendor['id']}/spend")).json()["projects"] == []


async def test_the_expense_count_ignores_removed_expenses(client: AsyncClient) -> None:
    projects = await _setup(client)
    vendor = await _vendor(client, "Segun Blocks Owode")
    expense = await _spend(client, projects["NGN"], vendor["id"], 150_000_00)

    await client.delete(f"/api/expenses/{expense['id']}")

    assert (await client.get(f"/api/vendors/{vendor['id']}")).json()["expense_count"] == 0


async def test_a_vendor_can_be_edited(client: AsyncClient) -> None:
    await _setup(client)
    vendor = await _vendor(client, "Segun Blocks Owode")

    resp = await client.patch(
        f"/api/vendors/{vendor['id']}", json={"trade": "block supplier", "contact_name": "Mr Segun"}
    )
    assert resp.json()["trade"] == "block supplier"
    assert resp.json()["contact_name"] == "Mr Segun"


async def test_an_edit_cannot_take_a_name_already_in_use(client: AsyncClient) -> None:
    await _setup(client)
    first = await _vendor(client, "Sawmill Jacaranda Close")
    await _vendor(client, "Idris Bricklaying")

    resp = await client.patch(f"/api/vendors/{first['id']}", json={"name": "Idris Bricklaying"})
    assert resp.status_code == 409


async def test_an_expense_cannot_name_a_vendor_that_is_not_there(client: AsyncClient) -> None:
    projects = await _setup(client)
    resp = await client.post(
        f"/api/projects/{projects['NGN']}/expenses",
        json={"description": "Cement", "amount": 100, "vendor_id": "nope"},
    )
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Vendor not found"


async def test_removing_a_vendor_leaves_the_expense_on_the_record(client: AsyncClient) -> None:
    projects = await _setup(client)
    vendor = await _vendor(client, "Segun Blocks Owode")
    expense = await _spend(client, projects["NGN"], vendor["id"], 150_000_00)

    await client.delete(f"/api/vendors/{vendor['id']}")

    still_there = (await client.get(f"/api/expenses/{expense['id']}")).json()
    assert still_there["amount"] == 150_000_00


async def test_the_vendor_list_carries_a_total_per_currency(client: AsyncClient) -> None:
    projects = await _setup(client, "NGN", "USD")
    vendor = await _vendor(client, "Bright Star Aluminium")
    await _spend(client, projects["NGN"], vendor["id"], 750_000_00)
    await _spend(client, projects["NGN"], vendor["id"], 50_000_00)
    await _spend(client, projects["USD"], vendor["id"], 400_00)

    row = (await client.get("/api/vendors")).json()["items"][0]
    assert row["expense_count"] == 3
    by_code = {t["currency_code"]: t for t in row["totals"]}
    assert by_code["NGN"]["spent_amount"] == 800_000_00
    assert by_code["NGN"]["expense_count"] == 2
    assert by_code["USD"]["spent_amount"] == 400_00


async def test_a_vendor_nobody_bought_from_has_no_totals(client: AsyncClient) -> None:
    await _setup(client)
    await _vendor(client, "Segun Blocks Owode")

    row = (await client.get("/api/vendors")).json()["items"][0]
    assert row["totals"] == []
    assert row["expense_count"] == 0


async def test_a_vendors_agreements_read_across_every_project(client: AsyncClient) -> None:
    projects = await _setup(client)
    project_id = projects["NGN"]
    other = (
        await client.post("/api/projects", json={"name": "Owode Bungalow", "currency_code": "NGN"})
    ).json()["id"]
    vendor_id = (await _vendor(client, "Kunle Bricklaying"))["id"]

    for target, description in ((project_id, "Block work"), (other, "Plastering")):
        await client.post(
            f"/api/projects/{target}/agreements",
            json={"vendor_id": vendor_id, "description": description, "agreed_amount": 180_000_00},
        )

    body = (await client.get(f"/api/vendors/{vendor_id}/agreements")).json()
    assert {row["description"] for row in body["agreements"]} == {"Block work", "Plastering"}
    assert {row["project_name"] for row in body["agreements"]} == {
        "House in NGN",
        "Owode Bungalow",
    }


async def test_a_vendor_agreement_counts_what_has_been_paid_on_it(client: AsyncClient) -> None:
    projects = await _setup(client)
    project_id = projects["NGN"]
    vendor_id = (await _vendor(client, "Kunle Bricklaying"))["id"]
    agreement = (
        await client.post(
            f"/api/projects/{project_id}/agreements",
            json={"vendor_id": vendor_id, "description": "Block work", "agreed_amount": 180_000_00},
        )
    ).json()

    await client.post(
        f"/api/projects/{project_id}/expenses",
        json={
            "description": "Part payment",
            "amount": 60_000_00,
            "vendor_id": vendor_id,
            "agreement_id": agreement["id"],
        },
    )

    row = (await client.get(f"/api/vendors/{vendor_id}/agreements")).json()["agreements"][0]
    assert row["paid_amount"] == 60_000_00
    assert row["balance_amount"] == 120_000_00


async def test_a_vendor_with_no_agreements_says_so_plainly(client: AsyncClient) -> None:
    await _setup(client)
    vendor_id = (await _vendor(client, "Quiet Supplier"))["id"]

    body = (await client.get(f"/api/vendors/{vendor_id}/agreements")).json()
    assert body["agreements"] == []
    assert body["name"] == "Quiet Supplier"
