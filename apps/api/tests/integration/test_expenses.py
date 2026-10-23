import pytest
from httpx import AsyncClient

from setout.currencies import CURRENCIES
from setout.models.attachment import Attachment
from setout.models.currency import Currency
from setout.models.delivery import Delivery

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


async def _category(client: AsyncClient, project_id: str, name: str, **extra: object) -> dict:
    resp = await client.post(f"/api/projects/{project_id}/categories", json={"name": name, **extra})
    return resp.json()


async def _expense(client: AsyncClient, project_id: str, **body: object) -> dict:
    payload = {"description": "Cement", "amount": 11_000_00} | body
    resp = await client.post(f"/api/projects/{project_id}/expenses", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_expenses_require_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/projects/nope/expenses")).status_code == 401


async def test_description_and_amount_are_sufficient(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id, description="1 truck of sand", amount=50_000_00)

    assert expense["amount"] == 50_000_00
    assert expense["category_id"] is None
    assert expense["cost_type"] is None
    assert expense["spent_on"]


async def test_amount_is_quantity_times_unit_rate(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(
        client,
        project_id,
        description="600 nine inch blocks",
        amount=None,
        quantity="600",
        unit_rate=250_00,
    )
    assert expense["amount"] == 150_000_00


@pytest.mark.parametrize(
    ("sent", "shown"),
    [("600", "600"), ("600.000", "600"), ("2.500", "2.5"), ("0.250", "0.25"), ("1", "1")],
)
async def test_whole_quantity_is_not_returned_in_scientific_notation(
    client: AsyncClient, sent: str, shown: str
) -> None:
    project_id = await _project(client)
    expense = await _expense(
        client, project_id, description="Blocks", amount=None, quantity=sent, unit_rate=250_00
    )
    assert expense["quantity"] == shown

    again = await client.get(f"/api/expenses/{expense['id']}")
    assert again.json()["quantity"] == shown


async def test_amount_contradicting_quantity_times_rate_is_rejected(client: AsyncClient) -> None:
    project_id = await _project(client)
    resp = await client.post(
        f"/api/projects/{project_id}/expenses",
        json={
            "description": "600 blocks",
            "quantity": "600",
            "unit_rate": 250_00,
            "amount": 1_00,
        },
    )
    assert resp.status_code == 422


async def test_amount_or_quantity_and_rate_is_required(client: AsyncClient) -> None:
    project_id = await _project(client)
    resp = await client.post(
        f"/api/projects/{project_id}/expenses", json={"description": "Mystery"}
    )
    assert resp.status_code == 422


async def test_expense_without_category_is_counted_as_uncategorised(
    client: AsyncClient,
) -> None:
    project_id = await _project(client)
    await _expense(client, project_id, description="MISSING", amount=53_000_00)

    uncategorised = (
        await client.get(
            f"/api/projects/{project_id}/expenses", params={"uncategorised_only": True}
        )
    ).json()
    assert uncategorised["total"] == 1

    summary = (await client.get(f"/api/projects/{project_id}/expense-summary")).json()
    assert summary["uncategorised_amount"] == 53_000_00
    assert summary["spent_amount"] == 53_000_00


async def test_parent_category_rejects_its_own_expenses(client: AsyncClient) -> None:
    project_id = await _project(client)
    group = await _category(client, project_id, "Structure and exterior")
    await _category(client, project_id, "Blockwork", parent_id=group["id"])

    resp = await client.post(
        f"/api/projects/{project_id}/expenses",
        json={"description": "Blocks", "amount": 100, "category_id": group["id"]},
    )
    assert resp.status_code == 409


async def test_category_from_another_project_is_rejected(client: AsyncClient) -> None:
    project_id = await _project(client)
    other = (
        await client.post("/api/projects", json={"name": "Owode Bungalow", "currency_code": "NGN"})
    ).json()
    other_category = await _category(client, other["id"], "Interior work")

    resp = await client.post(
        f"/api/projects/{project_id}/expenses",
        json={"description": "Tiles", "amount": 100, "category_id": other_category["id"]},
    )
    assert resp.status_code == 404


async def test_variance_is_null_without_a_budget(client: AsyncClient) -> None:
    project_id = await _project(client)
    await _expense(client, project_id, amount=10_000_00)

    summary = (await client.get(f"/api/projects/{project_id}/expense-summary")).json()
    assert summary["budgeted_amount"] == 0
    assert summary["variance_percent"] is None


async def test_variance_reports_over_budget(client: AsyncClient) -> None:
    project_id = await _project(client)
    category = await _category(client, project_id, "Concrete foundation")
    await client.post(
        f"/api/categories/{category['id']}/budget-items",
        json={"description": "Budgeted", "budgeted_amount": 100_000},
    )
    await _expense(client, project_id, amount=150_000, category_id=category["id"])

    summary = (await client.get(f"/api/projects/{project_id}/expense-summary")).json()
    assert summary["budgeted_amount"] == 100_000
    assert summary["spent_amount"] == 150_000
    assert summary["variance_percent"] == 50.0


async def test_expense_can_be_categorised_later(client: AsyncClient) -> None:
    project_id = await _project(client)
    category = await _category(client, project_id, "Concrete foundation")
    expense = await _expense(client, project_id, description="MISSING", amount=53_000_00)

    categorised = await client.patch(
        f"/api/expenses/{expense['id']}", json={"category_id": category["id"]}
    )
    assert categorised.status_code == 200
    assert categorised.json()["category_id"] == category["id"]


async def test_expense_can_be_archived_and_restored(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id)

    assert (await client.post(f"/api/expenses/{expense['id']}/archive")).status_code == 204
    assert (await client.get(f"/api/projects/{project_id}/expenses")).json()["total"] == 0
    assert (await client.get(f"/api/projects/{project_id}/expense-summary")).json()[
        "spent_amount"
    ] == 0

    restored = await client.post(f"/api/expenses/{expense['id']}/restore")
    assert restored.status_code == 200
    assert restored.json()["archived_at"] is None
    assert (await client.get(f"/api/projects/{project_id}/expenses")).json()["total"] == 1


async def test_archived_expense_is_listed_only_with_include_archived(client: AsyncClient) -> None:
    project_id = await _project(client)
    active = await _expense(client, project_id, description="Cement")
    archived_expense = await _expense(client, project_id, description="Sand")
    await client.post(f"/api/expenses/{archived_expense['id']}/archive")

    listed = await client.get(
        f"/api/projects/{project_id}/expenses", params={"include_archived": True}
    )
    page = listed.json()
    assert page["total"] == 2
    assert {row["id"] for row in page["items"]} == {active["id"], archived_expense["id"]}
    archived_row = next(row for row in page["items"] if row["id"] == archived_expense["id"])
    assert archived_row["archived_at"]

    summary = (await client.get(f"/api/projects/{project_id}/expense-summary")).json()
    assert summary["spent_amount"] == 11_000_00


async def _vendor(client: AsyncClient, name: str = "Corner Depot Cement") -> str:
    resp = await client.post("/api/vendors", json={"name": name})
    return str(resp.json()["id"])


async def _person(client: AsyncClient, name: str = "Mummy") -> str:
    resp = await client.post("/api/people", json={"name": name})
    return str(resp.json()["id"])


async def _item(client: AsyncClient, name: str = "Cement") -> str:
    resp = await client.post("/api/items", json={"name": name})
    return str(resp.json()["id"])


async def _listed(client: AsyncClient, project_id: str, **params: object) -> dict:
    resp = await client.get(f"/api/projects/{project_id}/expenses", params=params)
    assert resp.status_code == 200, resp.text
    return resp.json()


async def test_search_matches_part_of_description_or_notes(client: AsyncClient) -> None:
    project_id = await _project(client)
    await _expense(client, project_id, description="17 bags of cement")
    await _expense(client, project_id, description="Blocks", notes="paid in cement money")
    await _expense(client, project_id, description="Diesel")

    page = await _listed(client, project_id, search="cement")
    assert {row["description"] for row in page["items"]} == {"17 bags of cement", "Blocks"}
    assert page["total"] == 2


async def test_list_filters_by_vendor_person_or_item(client: AsyncClient) -> None:
    project_id = await _project(client)
    vendor_id = await _vendor(client)
    person_id = await _person(client)
    item_id = await _item(client)
    await _expense(client, project_id, description="From the depot", vendor_id=vendor_id)
    await _expense(client, project_id, description="Mummy paid", paid_by_id=person_id)
    await _expense(client, project_id, description="Cement", item_id=item_id)
    await _expense(client, project_id, description="Nothing attributed")

    assert (await _listed(client, project_id, vendor_id=vendor_id))["total"] == 1
    assert (await _listed(client, project_id, paid_by_id=person_id))["total"] == 1
    assert (await _listed(client, project_id, item_id=item_id))["total"] == 1


async def test_date_range_is_inclusive(client: AsyncClient) -> None:
    project_id = await _project(client)
    for day in ("2026-02-28", "2026-03-01", "2026-03-17", "2026-03-31", "2026-04-01"):
        await _expense(client, project_id, description=day, spent_on=day)

    page = await _listed(client, project_id, spent_from="2026-03-01", spent_to="2026-03-31")
    assert [row["description"] for row in page["items"]] == [
        "2026-03-31",
        "2026-03-17",
        "2026-03-01",
    ]

    assert (await _listed(client, project_id, spent_from="2026-04-01"))["total"] == 1
    assert (await _listed(client, project_id, spent_to="2026-02-28"))["total"] == 1


async def test_filters_combine(client: AsyncClient) -> None:
    project_id = await _project(client)
    vendor_id = await _vendor(client)
    other_id = await _vendor(client, "Riverside Sawmill")
    await _expense(
        client, project_id, description="Cement", vendor_id=vendor_id, spent_on="2026-03-02"
    )
    await _expense(
        client, project_id, description="Cement", vendor_id=other_id, spent_on="2026-03-02"
    )
    await _expense(
        client, project_id, description="Cement", vendor_id=vendor_id, spent_on="2026-05-02"
    )

    page = await _listed(client, project_id, search="cement", vendor_id=vendor_id, month="2026-03")
    assert page["total"] == 1

    narrower = await _listed(client, project_id, month="2026-03", spent_from="2026-03-15")
    assert narrower["total"] == 0


@pytest.mark.parametrize(
    ("sort", "expected"),
    [
        ("recent", ["Newest", "Middle", "Oldest"]),
        ("oldest", ["Oldest", "Middle", "Newest"]),
        ("largest", ["Middle", "Newest", "Oldest"]),
        ("smallest", ["Oldest", "Newest", "Middle"]),
    ],
)
async def test_list_sort_order(client: AsyncClient, sort: str, expected: list[str]) -> None:
    project_id = await _project(client)
    await _expense(client, project_id, description="Oldest", amount=1_000, spent_on="2026-01-01")
    await _expense(client, project_id, description="Middle", amount=9_000, spent_on="2026-02-01")
    await _expense(client, project_id, description="Newest", amount=5_000, spent_on="2026-03-01")

    page = await _listed(client, project_id, sort=sort)
    assert [row["description"] for row in page["items"]] == expected


async def test_total_amount_covers_all_pages(client: AsyncClient) -> None:
    project_id = await _project(client)
    vendor_id = await _vendor(client)
    for index in range(3):
        await _expense(
            client, project_id, description=f"Load {index}", amount=10_000, vendor_id=vendor_id
        )
    await _expense(client, project_id, description="Somewhere else", amount=7_000)

    page = await _listed(client, project_id, limit=1)
    assert len(page["items"]) == 1
    assert page["total_amount"] == 37_000

    filtered = await _listed(client, project_id, vendor_id=vendor_id)
    assert filtered["total_amount"] == 30_000


async def test_archived_expense_is_excluded_from_total_amount(client: AsyncClient) -> None:
    project_id = await _project(client)
    active = await _expense(client, project_id, description="Cement", amount=10_000)
    archived_expense = await _expense(client, project_id, description="Sand", amount=5_000)
    await client.post(f"/api/expenses/{archived_expense['id']}/archive")

    assert (await _listed(client, project_id))["total_amount"] == 10_000
    assert (await _listed(client, project_id, include_archived=True))["total_amount"] == 15_000
    assert active["amount"] == 10_000


async def test_expenses_are_paginated(client: AsyncClient) -> None:
    project_id = await _project(client)
    for index in range(3):
        await _expense(client, project_id, description=f"Load {index}")

    page = (await client.get(f"/api/projects/{project_id}/expenses", params={"limit": 2})).json()
    assert page["total"] == 3
    assert len(page["items"]) == 2


async def test_unknown_expenses_return_404(client: AsyncClient) -> None:
    await _project(client)
    assert (await client.get("/api/expenses/nope")).status_code == 404
    assert (await client.post("/api/expenses/nope/archive")).status_code == 404
    assert (await client.post("/api/expenses/nope/restore")).status_code == 404
    assert (await client.patch("/api/expenses/nope", json={"amount": 1})).status_code == 404
    assert (await client.get("/api/projects/nope/expense-summary")).status_code == 404


async def test_expense_records_item_vendor_and_payer(client: AsyncClient) -> None:
    project_id = await _project(client)
    item = (await client.post("/api/items", json={"name": "Cement", "unit": "bag"})).json()
    vendor = (await client.post("/api/vendors", json={"name": "Segun Blocks Owode"})).json()
    person = (await client.post("/api/people", json={"name": "Mum"})).json()

    expense = await _expense(
        client,
        project_id,
        description="10 bags of cement",
        item_id=item["id"],
        vendor_id=vendor["id"],
        paid_by_id=person["id"],
    )

    assert expense["item_id"] == item["id"]
    assert expense["vendor_id"] == vendor["id"]
    assert expense["paid_by_id"] == person["id"]


async def test_attribution_is_optional_on_every_expense(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id, description="MISSING", amount=53_000_00)

    assert expense["item_id"] is None
    assert expense["vendor_id"] is None
    assert expense["paid_by_id"] is None


async def test_attribution_can_be_added_later(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id, description="MISSING", amount=53_000_00)
    vendor = (await client.post("/api/vendors", json={"name": "Sawmill Jacaranda Close"})).json()

    resp = await client.patch(
        f"/api/expenses/{expense['id']}", json={"vendor_id": vendor["id"], "description": "Wood"}
    )
    assert resp.status_code == 200
    assert resp.json()["vendor_id"] == vendor["id"]
    assert resp.json()["description"] == "Wood"


async def test_update_with_unknown_vendor_returns_404(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id)

    resp = await client.patch(f"/api/expenses/{expense['id']}", json={"vendor_id": "nope"})
    assert resp.status_code == 404


async def test_project_totals_follow_expenses(client: AsyncClient) -> None:
    project_id = await _project(client)
    category = await _category(client, project_id, "Concrete foundation")
    await client.post(
        f"/api/categories/{category['id']}/budget-items",
        json={"description": "Budgeted", "budgeted_amount": 3_828_300},
    )

    listed = (await client.get("/api/projects")).json()["items"][0]
    assert listed["budgeted_amount"] == 3_828_300
    assert listed["spent_amount"] == 0

    await _expense(
        client, project_id, description="Blocks", amount=4_889_300, category_id=category["id"]
    )

    listed = (await client.get("/api/projects")).json()["items"][0]
    assert listed["spent_amount"] == 4_889_300
    assert (await client.get(f"/api/projects/{project_id}")).json()["spent_amount"] == 4_889_300


async def test_uncategorised_expenses_count_in_project_totals(client: AsyncClient) -> None:
    project_id = await _project(client)
    await _expense(client, project_id, description="MISSING", amount=53_000_00)

    listed = (await client.get("/api/projects")).json()["items"][0]
    assert listed["spent_amount"] == 53_000_00


async def test_spent_total_is_per_project(client: AsyncClient) -> None:
    project_id = await _project(client)
    await _expense(client, project_id, amount=10_000)
    other = (
        await client.post("/api/projects", json={"name": "Owode Bungalow", "currency_code": "NGN"})
    ).json()

    by_id = {p["id"]: p for p in (await client.get("/api/projects")).json()["items"]}
    assert by_id[project_id]["spent_amount"] == 10_000
    assert by_id[other["id"]]["spent_amount"] == 0


async def test_archived_expense_is_excluded_from_project_totals(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id, amount=25_000)
    await client.post(f"/api/expenses/{expense['id']}/archive")

    listed = (await client.get("/api/projects")).json()["items"][0]
    assert listed["spent_amount"] == 0


async def test_expense_can_be_updated(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id, description="Cement", amount=11_000_00)

    changed = await client.patch(
        f"/api/expenses/{expense['id']}",
        json={"description": "10 bags of cement", "amount": 12_000_00},
    )
    assert changed.status_code == 200
    assert changed.json()["description"] == "10 bags of cement"
    assert changed.json()["amount"] == 12_000_00

    listed = (await client.get("/api/projects")).json()["items"][0]
    assert listed["spent_amount"] == 12_000_00


async def test_changing_the_quantity_recomputes_the_amount(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(
        client,
        project_id,
        description="600 nine inch blocks",
        amount=None,
        quantity="600",
        unit_rate=250_00,
    )
    assert expense["amount"] == 150_000_00

    changed = await client.patch(f"/api/expenses/{expense['id']}", json={"quantity": "700"})
    assert changed.status_code == 200
    assert changed.json()["amount"] == 175_000_00


async def test_null_amount_with_quantity_is_derived(
    client: AsyncClient,
) -> None:
    # This is what the form sends when it has a quantity and a rate: it leaves
    # the amount to the server. amount is not nullable, so it must never reach
    # the field update.
    project_id = await _project(client)
    expense = await _expense(client, project_id, description="Cement", amount=11_000_00)

    changed = await client.patch(
        f"/api/expenses/{expense['id']}",
        json={
            "description": "10 bags of cement",
            "amount": None,
            "quantity": "10",
            "unit_rate": 11_000_00,
        },
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["amount"] == 110_000_00


async def test_null_amount_alone_keeps_the_amount(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id, description="Sand", amount=50_000_00)

    changed = await client.patch(
        f"/api/expenses/{expense['id']}",
        json={"description": "1 truck of sand", "amount": None},
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["amount"] == 50_000_00
    assert changed.json()["description"] == "1 truck of sand"


async def test_category_reports_spent_amount(client: AsyncClient) -> None:
    project_id = await _project(client)
    category = await _category(client, project_id, "Concrete foundation")
    other = await _category(client, project_id, "Interior work")

    await _expense(
        client, project_id, description="Sand", amount=96_000, category_id=category["id"]
    )
    await _expense(client, project_id, description="Tiles", amount=340_000, category_id=other["id"])
    await _expense(client, project_id, description="MISSING", amount=61_000)

    categories = {
        s["id"]: s for s in (await client.get(f"/api/projects/{project_id}/categories")).json()
    }
    assert categories[category["id"]]["spent_amount"] == 96_000
    assert categories[other["id"]]["spent_amount"] == 340_000
    # Uncategorised expenses belong to no category.
    assert sum(s["spent_amount"] for s in categories.values()) == 436_000


async def test_child_expenses_roll_up_to_parent_category(client: AsyncClient) -> None:
    project_id = await _project(client)
    group = await _category(client, project_id, "Structure and exterior")
    child = await _category(client, project_id, "Blockwork", parent_id=group["id"])

    await _expense(
        client, project_id, description="Blocks", amount=124_800, category_id=child["id"]
    )

    categories = {
        s["id"]: s for s in (await client.get(f"/api/projects/{project_id}/categories")).json()
    }
    assert categories[group["id"]]["spent_amount"] == 124_800
    assert categories[group["id"]]["own_spent_amount"] == 0
    assert categories[child["id"]]["own_spent_amount"] == 124_800


async def test_archived_expense_is_excluded_from_category_total(client: AsyncClient) -> None:
    project_id = await _project(client)
    category = await _category(client, project_id, "Roofing")
    expense = await _expense(client, project_id, amount=820_000, category_id=category["id"])

    await client.post(f"/api/expenses/{expense['id']}/archive")

    categories = (await client.get(f"/api/projects/{project_id}/categories")).json()
    assert categories[0]["spent_amount"] == 0


async def test_category_reports_expense_count(client: AsyncClient) -> None:
    project_id = await _project(client)
    category = await _category(client, project_id, "Structure and exterior")

    for amount in (10_000_00, 25_000_00):
        await _expense(client, project_id, category_id=category["id"], amount=amount)

    categories = (await client.get(f"/api/projects/{project_id}/categories")).json()
    row = next(s for s in categories if s["id"] == category["id"])
    assert row["expense_count"] == 2
    assert row["own_expense_count"] == 2


async def test_parent_category_counts_child_expenses(client: AsyncClient) -> None:
    project_id = await _project(client)
    parent = await _category(client, project_id, "Structure")
    child = await _category(client, project_id, "Roof", parent_id=parent["id"])

    await _expense(client, project_id, category_id=child["id"], amount=10_000_00)

    categories = (await client.get(f"/api/projects/{project_id}/categories")).json()
    group = next(s for s in categories if s["id"] == parent["id"])
    assert group["expense_count"] == 1
    # A parent category holds no expenses directly.
    assert group["own_expense_count"] == 0


async def test_archived_expense_is_excluded_from_category_count(client: AsyncClient) -> None:
    project_id = await _project(client)
    category = await _category(client, project_id, "Interior work")
    active = await _expense(client, project_id, category_id=category["id"], amount=10_000_00)
    archived_expense = await _expense(
        client, project_id, category_id=category["id"], amount=25_000_00
    )

    await client.post(f"/api/expenses/{archived_expense['id']}/archive")

    categories = (await client.get(f"/api/projects/{project_id}/categories")).json()
    row = next(s for s in categories if s["id"] == category["id"])
    assert row["expense_count"] == 1
    assert row["spent_amount"] == active["amount"]


async def test_expense_summary_reports_uncategorised_count(client: AsyncClient) -> None:
    project_id = await _project(client)
    await _expense(client, project_id, amount=61_000_00)
    await _expense(client, project_id, amount=5_000_00)

    summary = (await client.get(f"/api/projects/{project_id}/expense-summary")).json()
    assert summary["uncategorised_count"] == 2
    assert summary["uncategorised_amount"] == 66_000_00


async def test_months_group_expenses_by_month(client: AsyncClient) -> None:
    project_id = await _project(client)
    await _expense(client, project_id, amount=10_000_00, spent_on="2026-06-11")
    await _expense(client, project_id, amount=5_000_00, spent_on="2026-06-28")
    await _expense(client, project_id, amount=40_000_00, spent_on="2026-07-02")

    months = (await client.get(f"/api/projects/{project_id}/months")).json()

    assert [m["month"] for m in months["months"]] == ["2026-06", "2026-07"]
    assert months["months"][0]["amount"] == 15_000_00
    assert months["months"][0]["expense_count"] == 2
    assert months["total_amount"] == 55_000_00
    assert months["highest_month"] == "2026-07"


async def test_month_breakdown_uses_top_level_categories(client: AsyncClient) -> None:
    project_id = await _project(client)
    parent = await _category(client, project_id, "Structure and exterior")
    child = await _category(client, project_id, "Blockwork", parent_id=parent["id"])
    await _expense(
        client, project_id, category_id=child["id"], amount=30_000_00, spent_on="2026-06-11"
    )
    await _expense(client, project_id, amount=6_000_00, spent_on="2026-06-12")

    months = (await client.get(f"/api/projects/{project_id}/months")).json()
    parts = months["months"][0]["categories"]

    assert [(p["category_id"], p["name"], p["amount"]) for p in parts] == [
        (parent["id"], "Structure and exterior", 30_000_00),
        (None, "Uncategorised", 6_000_00),
    ]


async def test_archived_expense_is_excluded_from_months(client: AsyncClient) -> None:
    project_id = await _project(client)
    await _expense(client, project_id, amount=10_000_00, spent_on="2026-06-11")
    archived_expense = await _expense(client, project_id, amount=90_000_00, spent_on="2026-06-12")

    await client.post(f"/api/expenses/{archived_expense['id']}/archive")

    months = (await client.get(f"/api/projects/{project_id}/months")).json()
    assert months["months"][0]["amount"] == 10_000_00
    assert months["months"][0]["expense_count"] == 1


async def test_months_are_empty_without_expenses(client: AsyncClient) -> None:
    project_id = await _project(client)

    months = (await client.get(f"/api/projects/{project_id}/months")).json()
    assert months["months"] == []
    assert months["highest_month"] is None
    assert months["total_amount"] == 0


async def test_months_of_unknown_project_return_404(client: AsyncClient) -> None:
    await _project(client)
    assert (await client.get("/api/projects/nope/months")).status_code == 404


async def test_expenses_can_be_filtered_by_month(client: AsyncClient) -> None:
    project_id = await _project(client)
    await _expense(client, project_id, description="June sand", spent_on="2026-06-30")
    await _expense(client, project_id, description="July sand", spent_on="2026-07-01")

    page = (
        await client.get(f"/api/projects/{project_id}/expenses", params={"month": "2026-06"})
    ).json()

    assert page["total"] == 1
    assert page["items"][0]["description"] == "June sand"


async def test_december_month_filter_ends_at_year_end(client: AsyncClient) -> None:
    project_id = await _project(client)
    await _expense(client, project_id, description="December sand", spent_on="2026-12-31")
    await _expense(client, project_id, description="January sand", spent_on="2027-01-01")

    page = (
        await client.get(f"/api/projects/{project_id}/expenses", params={"month": "2026-12"})
    ).json()

    assert page["total"] == 1
    assert page["items"][0]["description"] == "December sand"


async def test_invalid_month_is_rejected(client: AsyncClient) -> None:
    project_id = await _project(client)
    resp = await client.get(f"/api/projects/{project_id}/expenses", params={"month": "2026-13"})
    assert resp.status_code == 422


async def test_expense_summary_reports_archived_count(
    client: AsyncClient,
) -> None:
    project_id = await _project(client)
    active = await _expense(client, project_id, description="Cement", amount=10_000_00)
    archived_expense = await _expense(
        client, project_id, description="Wrong project", amount=5_000_00
    )

    await client.post(f"/api/expenses/{archived_expense['id']}/archive")

    summary = (await client.get(f"/api/projects/{project_id}/expense-summary")).json()
    assert summary["archived_count"] == 1
    # Archived expenses are excluded from totals; archived_count discloses them.
    assert summary["spent_amount"] == 10_000_00
    assert active["id"] != archived_expense["id"]


async def test_agreement_only_filter_returns_expenses_with_any_agreement(
    client: AsyncClient,
) -> None:
    project_id = await _project(client)
    vendor = (await client.post("/api/vendors", json={"name": "Kunle Bricklaying"})).json()
    first = (
        await client.post(
            f"/api/projects/{project_id}/agreements",
            json={"vendor_id": vendor["id"], "description": "Block work", "agreed_amount": 100_00},
        )
    ).json()
    second = (
        await client.post(
            f"/api/projects/{project_id}/agreements",
            json={"vendor_id": vendor["id"], "description": "Roofing", "agreed_amount": 200_00},
        )
    ).json()
    await _expense(client, project_id, description="Part payment", agreement_id=first["id"])
    await _expense(client, project_id, description="Roof payment", agreement_id=second["id"])
    await _expense(client, project_id, description="Cement, no agreement")

    page = (await client.get(f"/api/projects/{project_id}/expenses?agreement_only=true")).json()

    assert page["total"] == 2
    assert {row["agreement_id"] for row in page["items"]} == {first["id"], second["id"]}


async def test_expense_summary_totals(
    client: AsyncClient,
) -> None:
    project_id = await _project(client)
    category = await _category(client, project_id, "Concrete foundation")
    await client.post(
        f"/api/categories/{category['id']}/budget-items",
        json={"description": "Sand", "budgeted_amount": 50_000_00},
    )
    await client.post(
        f"/api/categories/{category['id']}/budget-items",
        json={"description": "Cement", "budgeted_amount": 30_000_00},
    )
    await _expense(client, project_id, amount=10_000_00, category_id=category["id"])
    await _expense(client, project_id, amount=5_000_00)
    archived_expense = await _expense(client, project_id, amount=999_00)
    await client.post(f"/api/expenses/{archived_expense['id']}/archive")

    summary = (await client.get(f"/api/projects/{project_id}/expense-summary")).json()

    assert summary["budgeted_amount"] == 80_000_00
    assert summary["spent_amount"] == 15_000_00
    assert summary["uncategorised_amount"] == 5_000_00
    assert summary["uncategorised_count"] == 1
    assert summary["archived_count"] == 1


async def test_empty_project_totals_are_zero(
    client: AsyncClient,
) -> None:
    project_id = await _project(client)

    summary = (await client.get(f"/api/projects/{project_id}/expense-summary")).json()

    assert summary["budgeted_amount"] == 0
    assert summary["spent_amount"] == 0
    assert summary["uncategorised_amount"] == 0
    assert summary["variance_percent"] is None


async def test_archiving_an_expense_archives_its_delivery_and_attachments(
    client: AsyncClient,
) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id)
    await client.post(
        f"/api/projects/{project_id}/deliveries",
        json={"expense_id": expense["id"], "description": "17 bags"},
    )
    attached = await client.post(
        f"/api/projects/{project_id}/expenses/{expense['id']}/attachments",
        files={"file": ("receipt.jpg", b"\xff\xd8\xff\xd9", "image/jpeg")},
    )
    assert attached.status_code == 201, attached.text

    assert (await client.post(f"/api/expenses/{expense['id']}/archive")).status_code == 204

    assert await Delivery.filter(expense_id=expense["id"], archived_at__isnull=True).count() == 0
    assert await Attachment.filter(expense_id=expense["id"], archived_at__isnull=True).count() == 0


async def test_restoring_an_expense_restores_its_delivery_and_attachments(
    client: AsyncClient,
) -> None:
    project_id = await _project(client)
    expense = await _expense(client, project_id)
    await client.post(
        f"/api/projects/{project_id}/deliveries",
        json={"expense_id": expense["id"], "description": "17 bags"},
    )
    await client.post(
        f"/api/projects/{project_id}/expenses/{expense['id']}/attachments",
        files={"file": ("receipt.jpg", b"\xff\xd8\xff\xd9", "image/jpeg")},
    )

    await client.post(f"/api/expenses/{expense['id']}/archive")
    assert (await client.post(f"/api/expenses/{expense['id']}/restore")).status_code == 200

    assert await Delivery.filter(expense_id=expense["id"], archived_at__isnull=True).count() == 1
    assert await Attachment.filter(expense_id=expense["id"], archived_at__isnull=True).count() == 1


async def test_suggestion_from_item_history(client: AsyncClient) -> None:
    project_id = await _project(client)
    category = await _category(client, project_id, "Concrete foundation")
    item = (await client.post("/api/items", json={"name": "Cement", "unit": "bag"})).json()

    await _expense(client, project_id, item_id=item["id"], category_id=category["id"])
    await _expense(client, project_id, item_id=item["id"], category_id=category["id"])

    resp = await client.get(
        f"/api/projects/{project_id}/suggest-category", params={"item_id": item["id"]}
    )
    assert resp.status_code == 200
    assert resp.json()["category_id"] == category["id"]
    assert "item" in resp.json()["reason"].casefold()


async def test_suggestion_from_vendor_history(client: AsyncClient) -> None:
    project_id = await _project(client)
    category = await _category(client, project_id, "Blockwork")
    vendor = (await client.post("/api/vendors", json={"name": "Segun Blocks"})).json()

    await _expense(client, project_id, vendor_id=vendor["id"], category_id=category["id"])
    await _expense(client, project_id, vendor_id=vendor["id"], category_id=category["id"])

    resp = await client.get(
        f"/api/projects/{project_id}/suggest-category", params={"vendor_id": vendor["id"]}
    )
    assert resp.status_code == 200
    assert resp.json()["category_id"] == category["id"]
    assert "vendor" in resp.json()["reason"].casefold()


async def test_suggestion_prefers_item_over_vendor(client: AsyncClient) -> None:
    project_id = await _project(client)
    item_category = await _category(client, project_id, "Concrete foundation")
    vendor_category = await _category(client, project_id, "Blockwork")
    item = (await client.post("/api/items", json={"name": "Cement"})).json()
    vendor = (await client.post("/api/vendors", json={"name": "Segun Blocks"})).json()

    await _expense(
        client,
        project_id,
        item_id=item["id"],
        vendor_id=vendor["id"],
        category_id=item_category["id"],
    )
    await _expense(
        client,
        project_id,
        item_id=item["id"],
        vendor_id=vendor["id"],
        category_id=item_category["id"],
    )
    await _expense(client, project_id, vendor_id=vendor["id"], category_id=vendor_category["id"])

    resp = await client.get(
        f"/api/projects/{project_id}/suggest-category",
        params={"item_id": item["id"], "vendor_id": vendor["id"]},
    )
    assert resp.json()["category_id"] == item_category["id"]


async def test_suggestion_tie_returns_null(client: AsyncClient) -> None:
    project_id = await _project(client)
    first = await _category(client, project_id, "Concrete foundation")
    second = await _category(client, project_id, "Blockwork")
    item = (await client.post("/api/items", json={"name": "Cement"})).json()

    await _expense(client, project_id, item_id=item["id"], category_id=first["id"])
    await _expense(client, project_id, item_id=item["id"], category_id=second["id"])

    resp = await client.get(
        f"/api/projects/{project_id}/suggest-category", params={"item_id": item["id"]}
    )
    assert resp.status_code == 200
    assert resp.json()["category_id"] is None
    assert resp.json()["reason"] is None


async def test_suggestion_empty_returns_null(client: AsyncClient) -> None:
    project_id = await _project(client)
    item = (await client.post("/api/items", json={"name": "Cement"})).json()

    resp = await client.get(
        f"/api/projects/{project_id}/suggest-category", params={"item_id": item["id"]}
    )
    assert resp.status_code == 200
    assert resp.json()["category_id"] is None
    assert resp.json()["reason"] is None


async def test_suggestion_for_unknown_project_returns_404(client: AsyncClient) -> None:
    await _project(client)
    resp = await client.get("/api/projects/nope/suggest-category")
    assert resp.status_code == 404


async def test_auto_assigns_category_from_strong_item_pattern(client: AsyncClient) -> None:
    project_id = await _project(client)
    category = await _category(client, project_id, "Concrete foundation")
    item = (await client.post("/api/items", json={"name": "Cement"})).json()

    await _expense(client, project_id, item_id=item["id"], category_id=category["id"])
    await _expense(client, project_id, item_id=item["id"], category_id=category["id"])

    expense = await _expense(client, project_id, item_id=item["id"])
    assert expense["category_id"] == category["id"]


async def test_auto_assigns_category_from_strong_vendor_pattern(client: AsyncClient) -> None:
    project_id = await _project(client)
    category = await _category(client, project_id, "Blockwork")
    vendor = (await client.post("/api/vendors", json={"name": "Segun Blocks"})).json()

    await _expense(client, project_id, vendor_id=vendor["id"], category_id=category["id"])
    await _expense(client, project_id, vendor_id=vendor["id"], category_id=category["id"])

    expense = await _expense(client, project_id, vendor_id=vendor["id"])
    assert expense["category_id"] == category["id"]


async def test_auto_assign_prefers_item_over_vendor(client: AsyncClient) -> None:
    project_id = await _project(client)
    item_category = await _category(client, project_id, "Concrete foundation")
    vendor_category = await _category(client, project_id, "Blockwork")
    item = (await client.post("/api/items", json={"name": "Cement"})).json()
    vendor = (await client.post("/api/vendors", json={"name": "Segun Blocks"})).json()

    await _expense(
        client,
        project_id,
        item_id=item["id"],
        vendor_id=vendor["id"],
        category_id=item_category["id"],
    )
    await _expense(
        client,
        project_id,
        item_id=item["id"],
        vendor_id=vendor["id"],
        category_id=item_category["id"],
    )
    await _expense(client, project_id, vendor_id=vendor["id"], category_id=vendor_category["id"])

    expense = await _expense(client, project_id, item_id=item["id"], vendor_id=vendor["id"])
    assert expense["category_id"] == item_category["id"]


async def test_auto_assign_skips_split_history(client: AsyncClient) -> None:
    project_id = await _project(client)
    first = await _category(client, project_id, "Concrete foundation")
    second = await _category(client, project_id, "Blockwork")
    item = (await client.post("/api/items", json={"name": "Cement"})).json()

    await _expense(client, project_id, item_id=item["id"], category_id=first["id"])
    await _expense(client, project_id, item_id=item["id"], category_id=second["id"])

    expense = await _expense(client, project_id, item_id=item["id"])
    assert expense["category_id"] is None


async def test_auto_assign_needs_at_least_two_expenses(client: AsyncClient) -> None:
    project_id = await _project(client)
    category = await _category(client, project_id, "Concrete foundation")
    item = (await client.post("/api/items", json={"name": "Cement"})).json()

    await _expense(client, project_id, item_id=item["id"], category_id=category["id"])

    expense = await _expense(client, project_id, item_id=item["id"])
    assert expense["category_id"] is None


async def test_auto_assign_can_be_disabled(client: AsyncClient) -> None:
    project_id = await _project(client)
    category = await _category(client, project_id, "Concrete foundation")
    item = (await client.post("/api/items", json={"name": "Cement"})).json()

    await _expense(client, project_id, item_id=item["id"], category_id=category["id"])
    await _expense(client, project_id, item_id=item["id"], category_id=category["id"])

    expense = await _expense(client, project_id, item_id=item["id"], auto_categorize=False)
    assert expense["category_id"] is None


async def test_bulk_categorises_uncategorised_expenses(client: AsyncClient) -> None:
    project_id = await _project(client)
    category = await _category(client, project_id, "Concrete foundation")
    first = await _expense(client, project_id, description="Cement", amount=10_000_00)
    second = await _expense(client, project_id, description="Sand", amount=5_000_00)

    resp = await client.patch(
        f"/api/projects/{project_id}/expenses",
        json={"expense_ids": [first["id"], second["id"]], "category_id": category["id"]},
    )
    assert resp.status_code == 200
    assert resp.json()["categorised_count"] == 2

    page = (
        await client.get(
            f"/api/projects/{project_id}/expenses", params={"uncategorised_only": True}
        )
    ).json()
    assert page["total"] == 0

    listed = (await client.get(f"/api/projects/{project_id}/expenses")).json()
    categorised = {row["id"]: row["category_id"] for row in listed["items"]}
    assert categorised[first["id"]] == category["id"]
    assert categorised[second["id"]] == category["id"]


async def test_bulk_categorise_ignores_expenses_already_categorised_or_archived(
    client: AsyncClient,
) -> None:
    project_id = await _project(client)
    category = await _category(client, project_id, "Concrete foundation")
    uncategorised = await _expense(client, project_id, description="Cement", amount=10_000_00)
    categorised = await _expense(
        client, project_id, description="Sand", amount=5_000_00, category_id=category["id"]
    )
    archived_expense = await _expense(client, project_id, description="Wood", amount=3_000_00)
    await client.post(f"/api/expenses/{archived_expense['id']}/archive")

    resp = await client.patch(
        f"/api/projects/{project_id}/expenses",
        json={
            "expense_ids": [uncategorised["id"], categorised["id"], archived_expense["id"], "nope"],
            "category_id": category["id"],
        },
    )
    assert resp.status_code == 200
    assert resp.json()["categorised_count"] == 1


async def test_bulk_categorise_rejects_a_group_category(client: AsyncClient) -> None:
    project_id = await _project(client)
    group = await _category(client, project_id, "Structure and exterior")
    await _category(client, project_id, "Blockwork", parent_id=group["id"])
    expense = await _expense(client, project_id, description="Cement", amount=10_000_00)

    resp = await client.patch(
        f"/api/projects/{project_id}/expenses",
        json={"expense_ids": [expense["id"]], "category_id": group["id"]},
    )
    assert resp.status_code == 409


async def test_bulk_categorise_rejects_a_category_from_another_project(client: AsyncClient) -> None:
    project_id = await _project(client)
    other = (
        await client.post("/api/projects", json={"name": "Owode Bungalow", "currency_code": "NGN"})
    ).json()
    other_category = await _category(client, other["id"], "Interior work")
    expense = await _expense(client, project_id, description="Cement", amount=10_000_00)

    resp = await client.patch(
        f"/api/projects/{project_id}/expenses",
        json={"expense_ids": [expense["id"]], "category_id": other_category["id"]},
    )
    assert resp.status_code == 404
