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
    await client.post("/api/auth/setup", json={"name": "Admin", "password": "password123"})
    resp = await client.post(
        "/api/projects", json={"name": "Jacaranda Close, Ewuru", "currency_code": "NGN"}
    )
    return str(resp.json()["id"])


async def _scope(client: AsyncClient, project_id: str, name: str, **extra: object) -> dict:
    resp = await client.post(f"/api/projects/{project_id}/scopes", json={"name": name, **extra})
    return resp.json()


async def _spend(client: AsyncClient, project_id: str, **body: object) -> dict:
    payload = {"description": "Cement", "amount": 11_000_00} | body
    resp = await client.post(f"/api/projects/{project_id}/expenses", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_expenses_require_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/projects/nope/expenses")).status_code == 401


async def test_three_fields_are_enough(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id, description="1 truck of sand", amount=50_000_00)

    assert spend["amount"] == 50_000_00
    assert spend["scope_id"] is None
    assert spend["cost_type"] is None
    assert spend["spent_on"]


async def test_amount_is_quantity_times_unit_rate(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(
        client,
        project_id,
        description="600 nine inch blocks",
        amount=None,
        quantity="600",
        unit_rate=250_00,
    )
    assert spend["amount"] == 150_000_00


@pytest.mark.parametrize(
    ("sent", "shown"),
    [("600", "600"), ("600.000", "600"), ("2.500", "2.5"), ("0.250", "0.25"), ("1", "1")],
)
async def test_a_round_quantity_is_not_shown_in_scientific_notation(
    client: AsyncClient, sent: str, shown: str
) -> None:
    project_id = await _project(client)
    spend = await _spend(
        client, project_id, description="Blocks", amount=None, quantity=sent, unit_rate=250_00
    )
    assert spend["quantity"] == shown

    again = await client.get(f"/api/expenses/{spend['id']}")
    assert again.json()["quantity"] == shown


async def test_an_amount_that_contradicts_the_maths_is_refused(client: AsyncClient) -> None:
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


async def test_something_has_to_say_what_it_cost(client: AsyncClient) -> None:
    project_id = await _project(client)
    resp = await client.post(
        f"/api/projects/{project_id}/expenses", json={"description": "Mystery"}
    )
    assert resp.status_code == 422


async def test_spend_with_no_scope_is_kept_and_counted_as_unfiled(client: AsyncClient) -> None:
    project_id = await _project(client)
    await _spend(client, project_id, description="MISSING", amount=53_000_00)

    unfiled = (
        await client.get(f"/api/projects/{project_id}/expenses", params={"unfiled_only": True})
    ).json()
    assert unfiled["total"] == 1

    spend = (await client.get(f"/api/projects/{project_id}/spend")).json()
    assert spend["unfiled_amount"] == 53_000_00
    assert spend["spent_amount"] == 53_000_00


async def test_a_group_scope_holds_no_spend_of_its_own(client: AsyncClient) -> None:
    project_id = await _project(client)
    group = await _scope(client, project_id, "Structure and exterior")
    await _scope(client, project_id, "Blockwork", parent_id=group["id"])

    resp = await client.post(
        f"/api/projects/{project_id}/expenses",
        json={"description": "Blocks", "amount": 100, "scope_id": group["id"]},
    )
    assert resp.status_code == 409


async def test_spend_cannot_be_filed_against_another_project(client: AsyncClient) -> None:
    project_id = await _project(client)
    other = (
        await client.post("/api/projects", json={"name": "Owode Bungalow", "currency_code": "NGN"})
    ).json()
    stranger = await _scope(client, other["id"], "Interior work")

    resp = await client.post(
        f"/api/projects/{project_id}/expenses",
        json={"description": "Tiles", "amount": 100, "scope_id": stranger["id"]},
    )
    assert resp.status_code == 404


async def test_variance_is_null_without_a_budget(client: AsyncClient) -> None:
    project_id = await _project(client)
    await _spend(client, project_id, amount=10_000_00)

    spend = (await client.get(f"/api/projects/{project_id}/spend")).json()
    assert spend["planned_amount"] == 0
    assert spend["variance_percent"] is None


async def test_variance_reports_going_over(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Concrete foundation")
    await client.post(
        f"/api/scopes/{scope['id']}/budget-items",
        json={"description": "Planned", "planned_amount": 100_000},
    )
    await _spend(client, project_id, amount=150_000, scope_id=scope["id"])

    spend = (await client.get(f"/api/projects/{project_id}/spend")).json()
    assert spend["planned_amount"] == 100_000
    assert spend["spent_amount"] == 150_000
    assert spend["variance_percent"] == 50.0


async def test_an_expense_can_be_filed_later(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Concrete foundation")
    spend = await _spend(client, project_id, description="MISSING", amount=53_000_00)

    filed = await client.patch(f"/api/expenses/{spend['id']}", json={"scope_id": scope["id"]})
    assert filed.status_code == 200
    assert filed.json()["scope_id"] == scope["id"]


async def test_an_expense_is_soft_deleted_and_restorable(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id)

    assert (await client.delete(f"/api/expenses/{spend['id']}")).status_code == 204
    assert (await client.get(f"/api/projects/{project_id}/expenses")).json()["total"] == 0
    assert (await client.get(f"/api/projects/{project_id}/spend")).json()["spent_amount"] == 0

    restored = await client.post(f"/api/expenses/{spend['id']}/restore")
    assert restored.status_code == 200
    assert restored.json()["deleted_at"] is None
    assert (await client.get(f"/api/projects/{project_id}/expenses")).json()["total"] == 1


async def test_expenses_are_paginated(client: AsyncClient) -> None:
    project_id = await _project(client)
    for index in range(3):
        await _spend(client, project_id, description=f"Load {index}")

    page = (await client.get(f"/api/projects/{project_id}/expenses", params={"limit": 2})).json()
    assert page["total"] == 3
    assert len(page["items"]) == 2


async def test_missing_things_answer_404(client: AsyncClient) -> None:
    await _project(client)
    assert (await client.get("/api/expenses/nope")).status_code == 404
    assert (await client.delete("/api/expenses/nope")).status_code == 404
    assert (await client.post("/api/expenses/nope/restore")).status_code == 404
    assert (await client.patch("/api/expenses/nope", json={"amount": 1})).status_code == 404
    assert (await client.get("/api/projects/nope/spend")).status_code == 404


async def test_an_expense_records_what_who_and_who_paid(client: AsyncClient) -> None:
    project_id = await _project(client)
    item = (await client.post("/api/items", json={"name": "Cement", "unit": "bag"})).json()
    vendor = (await client.post("/api/vendors", json={"name": "Segun Blocks Owode"})).json()
    person = (await client.post("/api/people", json={"name": "Mum"})).json()

    spend = await _spend(
        client,
        project_id,
        description="10 bags of cement",
        item_id=item["id"],
        vendor_id=vendor["id"],
        paid_by_id=person["id"],
    )

    assert spend["item_id"] == item["id"]
    assert spend["vendor_id"] == vendor["id"]
    assert spend["paid_by_id"] == person["id"]


async def test_attribution_is_optional_on_every_expense(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id, description="MISSING", amount=53_000_00)

    assert spend["item_id"] is None
    assert spend["vendor_id"] is None
    assert spend["paid_by_id"] is None


async def test_attribution_can_be_added_to_an_expense_later(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id, description="MISSING", amount=53_000_00)
    vendor = (await client.post("/api/vendors", json={"name": "Sawmill Jacaranda Close"})).json()

    resp = await client.patch(
        f"/api/expenses/{spend['id']}", json={"vendor_id": vendor["id"], "description": "Wood"}
    )
    assert resp.status_code == 200
    assert resp.json()["vendor_id"] == vendor["id"]
    assert resp.json()["description"] == "Wood"


async def test_an_edit_cannot_point_at_a_vendor_that_is_not_there(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id)

    resp = await client.patch(f"/api/expenses/{spend['id']}", json={"vendor_id": "nope"})
    assert resp.status_code == 404


async def test_the_project_card_figures_follow_the_spend(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Concrete foundation")
    await client.post(
        f"/api/scopes/{scope['id']}/budget-items",
        json={"description": "Planned", "planned_amount": 3_828_300},
    )

    listed = (await client.get("/api/projects")).json()["items"][0]
    assert listed["planned_amount"] == 3_828_300
    assert listed["spent_amount"] == 0

    await _spend(client, project_id, description="Blocks", amount=4_889_300, scope_id=scope["id"])

    listed = (await client.get("/api/projects")).json()["items"][0]
    assert listed["spent_amount"] == 4_889_300
    assert (await client.get(f"/api/projects/{project_id}")).json()["spent_amount"] == 4_889_300


async def test_unfiled_spend_still_counts_on_the_card(client: AsyncClient) -> None:
    project_id = await _project(client)
    await _spend(client, project_id, description="MISSING", amount=53_000_00)

    listed = (await client.get("/api/projects")).json()["items"][0]
    assert listed["spent_amount"] == 53_000_00


async def test_spend_stays_with_its_own_project(client: AsyncClient) -> None:
    project_id = await _project(client)
    await _spend(client, project_id, amount=10_000)
    other = (
        await client.post("/api/projects", json={"name": "Owode Bungalow", "currency_code": "NGN"})
    ).json()

    by_id = {p["id"]: p for p in (await client.get("/api/projects")).json()["items"]}
    assert by_id[project_id]["spent_amount"] == 10_000
    assert by_id[other["id"]]["spent_amount"] == 0


async def test_a_deleted_expense_leaves_the_card_total(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id, amount=25_000)
    await client.delete(f"/api/expenses/{spend['id']}")

    listed = (await client.get("/api/projects")).json()["items"][0]
    assert listed["spent_amount"] == 0


async def test_an_expense_can_be_changed(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id, description="Cement", amount=11_000_00)

    changed = await client.patch(
        f"/api/expenses/{spend['id']}",
        json={"description": "10 bags of cement", "amount": 12_000_00},
    )
    assert changed.status_code == 200
    assert changed.json()["description"] == "10 bags of cement"
    assert changed.json()["amount"] == 12_000_00

    # The totals follow the change rather than the original.
    listed = (await client.get("/api/projects")).json()["items"][0]
    assert listed["spent_amount"] == 12_000_00


async def test_changing_the_quantity_recomputes_the_amount(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(
        client,
        project_id,
        description="600 nine inch blocks",
        amount=None,
        quantity="600",
        unit_rate=250_00,
    )
    assert spend["amount"] == 150_000_00

    changed = await client.patch(f"/api/expenses/{spend['id']}", json={"quantity": "700"})
    assert changed.status_code == 200
    assert changed.json()["amount"] == 175_000_00


async def test_a_null_amount_with_a_quantity_is_derived_not_rejected(
    client: AsyncClient,
) -> None:
    # This is what the form sends when it has a quantity and a rate: it leaves
    # the amount to the server. amount is not nullable, so it must never reach
    # the field update.
    project_id = await _project(client)
    spend = await _spend(client, project_id, description="Cement", amount=11_000_00)

    changed = await client.patch(
        f"/api/expenses/{spend['id']}",
        json={
            "description": "10 bags of cement",
            "amount": None,
            "quantity": "10",
            "unit_rate": 11_000_00,
        },
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["amount"] == 110_000_00


async def test_a_null_amount_on_its_own_leaves_the_amount_alone(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id, description="Sand", amount=50_000_00)

    changed = await client.patch(
        f"/api/expenses/{spend['id']}",
        json={"description": "1 truck of sand", "amount": None},
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["amount"] == 50_000_00
    assert changed.json()["description"] == "1 truck of sand"


async def test_a_scope_carries_what_was_spent_on_it(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Concrete foundation")
    other = await _scope(client, project_id, "Interior work")

    await _spend(client, project_id, description="Sand", amount=96_000, scope_id=scope["id"])
    await _spend(client, project_id, description="Tiles", amount=340_000, scope_id=other["id"])
    await _spend(client, project_id, description="MISSING", amount=61_000)

    scopes = {s["id"]: s for s in (await client.get(f"/api/projects/{project_id}/scopes")).json()}
    assert scopes[scope["id"]]["spent_amount"] == 96_000
    assert scopes[other["id"]]["spent_amount"] == 340_000
    # Unfiled spend belongs to no scope, so it is in neither.
    assert sum(s["spent_amount"] for s in scopes.values()) == 436_000


async def test_spend_rolls_up_to_the_group_scope(client: AsyncClient) -> None:
    project_id = await _project(client)
    group = await _scope(client, project_id, "Structure and exterior")
    child = await _scope(client, project_id, "Blockwork", parent_id=group["id"])

    await _spend(client, project_id, description="Blocks", amount=124_800, scope_id=child["id"])

    scopes = {s["id"]: s for s in (await client.get(f"/api/projects/{project_id}/scopes")).json()}
    assert scopes[group["id"]]["spent_amount"] == 124_800
    assert scopes[group["id"]]["own_spent_amount"] == 0
    assert scopes[child["id"]]["own_spent_amount"] == 124_800


async def test_a_deleted_expense_leaves_the_scope_total(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Roofing")
    spend = await _spend(client, project_id, amount=820_000, scope_id=scope["id"])

    await client.delete(f"/api/expenses/{spend['id']}")

    scopes = (await client.get(f"/api/projects/{project_id}/scopes")).json()
    assert scopes[0]["spent_amount"] == 0


async def test_a_scope_says_how_many_expenses_are_filed_to_it(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Structure and exterior")

    for amount in (10_000_00, 25_000_00):
        await _spend(client, project_id, scope_id=scope["id"], amount=amount)

    scopes = (await client.get(f"/api/projects/{project_id}/scopes")).json()
    row = next(s for s in scopes if s["id"] == scope["id"])
    assert row["expense_count"] == 2
    assert row["own_expense_count"] == 2


async def test_a_group_scope_counts_the_expenses_below_it(client: AsyncClient) -> None:
    project_id = await _project(client)
    parent = await _scope(client, project_id, "Structure")
    child = await _scope(client, project_id, "Roof", parent_id=parent["id"])

    await _spend(client, project_id, scope_id=child["id"], amount=10_000_00)

    scopes = (await client.get(f"/api/projects/{project_id}/scopes")).json()
    group = next(s for s in scopes if s["id"] == parent["id"])
    assert group["expense_count"] == 1
    # A group holds nothing itself, so the count of its own stays at nothing.
    assert group["own_expense_count"] == 0


async def test_a_deleted_expense_leaves_the_count(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Interior work")
    kept = await _spend(client, project_id, scope_id=scope["id"], amount=10_000_00)
    gone = await _spend(client, project_id, scope_id=scope["id"], amount=25_000_00)

    await client.delete(f"/api/expenses/{gone['id']}")

    scopes = (await client.get(f"/api/projects/{project_id}/scopes")).json()
    row = next(s for s in scopes if s["id"] == scope["id"])
    assert row["expense_count"] == 1
    assert row["spent_amount"] == kept["amount"]


async def test_spend_says_how_many_expenses_reached_no_scope(client: AsyncClient) -> None:
    project_id = await _project(client)
    await _spend(client, project_id, amount=61_000_00)
    await _spend(client, project_id, amount=5_000_00)

    spend = (await client.get(f"/api/projects/{project_id}/spend")).json()
    assert spend["unfiled_count"] == 2
    assert spend["unfiled_amount"] == 66_000_00


async def test_months_gather_spend_into_the_months_it_happened_in(client: AsyncClient) -> None:
    project_id = await _project(client)
    await _spend(client, project_id, amount=10_000_00, spent_on="2026-06-11")
    await _spend(client, project_id, amount=5_000_00, spent_on="2026-06-28")
    await _spend(client, project_id, amount=40_000_00, spent_on="2026-07-02")

    months = (await client.get(f"/api/projects/{project_id}/months")).json()

    assert [m["month"] for m in months["months"]] == ["2026-06", "2026-07"]
    assert months["months"][0]["amount"] == 15_000_00
    assert months["months"][0]["expense_count"] == 2
    assert months["total_amount"] == 55_000_00
    assert months["busiest_month"] == "2026-07"


async def test_a_month_splits_by_the_top_of_each_branch(client: AsyncClient) -> None:
    project_id = await _project(client)
    parent = await _scope(client, project_id, "Structure and exterior")
    child = await _scope(client, project_id, "Blockwork", parent_id=parent["id"])
    await _spend(client, project_id, scope_id=child["id"], amount=30_000_00, spent_on="2026-06-11")
    await _spend(client, project_id, amount=6_000_00, spent_on="2026-06-12")

    months = (await client.get(f"/api/projects/{project_id}/months")).json()
    parts = months["months"][0]["scopes"]

    assert [(p["scope_id"], p["name"], p["amount"]) for p in parts] == [
        (parent["id"], "Structure and exterior", 30_000_00),
        (None, "Not filed to a scope", 6_000_00),
    ]


async def test_a_deleted_expense_leaves_its_month(client: AsyncClient) -> None:
    project_id = await _project(client)
    await _spend(client, project_id, amount=10_000_00, spent_on="2026-06-11")
    gone = await _spend(client, project_id, amount=90_000_00, spent_on="2026-06-12")

    await client.delete(f"/api/expenses/{gone['id']}")

    months = (await client.get(f"/api/projects/{project_id}/months")).json()
    assert months["months"][0]["amount"] == 10_000_00
    assert months["months"][0]["expense_count"] == 1


async def test_months_are_empty_until_something_is_spent(client: AsyncClient) -> None:
    project_id = await _project(client)

    months = (await client.get(f"/api/projects/{project_id}/months")).json()
    assert months["months"] == []
    assert months["busiest_month"] is None
    assert months["total_amount"] == 0


async def test_months_of_a_project_that_is_not_there(client: AsyncClient) -> None:
    await _project(client)
    assert (await client.get("/api/projects/nope/months")).status_code == 404


async def test_expenses_can_be_asked_for_one_month(client: AsyncClient) -> None:
    project_id = await _project(client)
    await _spend(client, project_id, description="June sand", spent_on="2026-06-30")
    await _spend(client, project_id, description="July sand", spent_on="2026-07-01")

    page = (
        await client.get(f"/api/projects/{project_id}/expenses", params={"month": "2026-06"})
    ).json()

    assert page["total"] == 1
    assert page["items"][0]["description"] == "June sand"


async def test_december_asked_for_by_month_stops_at_the_year_end(client: AsyncClient) -> None:
    project_id = await _project(client)
    await _spend(client, project_id, description="December sand", spent_on="2026-12-31")
    await _spend(client, project_id, description="January sand", spent_on="2027-01-01")

    page = (
        await client.get(f"/api/projects/{project_id}/expenses", params={"month": "2026-12"})
    ).json()

    assert page["total"] == 1
    assert page["items"][0]["description"] == "December sand"


async def test_a_month_that_is_not_a_month_is_refused(client: AsyncClient) -> None:
    project_id = await _project(client)
    resp = await client.get(f"/api/projects/{project_id}/expenses", params={"month": "2026-13"})
    assert resp.status_code == 422


async def test_the_spend_says_how_many_expenses_were_taken_off_the_record(
    client: AsyncClient,
) -> None:
    project_id = await _project(client)
    kept = await _spend(client, project_id, description="Cement", amount=10_000_00)
    gone = await _spend(client, project_id, description="Wrong project", amount=5_000_00)

    await client.delete(f"/api/expenses/{gone['id']}")

    spend = (await client.get(f"/api/projects/{project_id}/spend")).json()
    assert spend["removed_count"] == 1
    # What was taken off is in no total, which is the reason for saying so.
    assert spend["spent_amount"] == 10_000_00
    assert kept["id"] != gone["id"]


async def test_the_payments_on_every_agreement_can_be_read_at_once(client: AsyncClient) -> None:
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
    await _spend(client, project_id, description="Part payment", agreement_id=first["id"])
    await _spend(client, project_id, description="Roof payment", agreement_id=second["id"])
    await _spend(client, project_id, description="Cement, no agreement")

    page = (await client.get(f"/api/projects/{project_id}/expenses?agreement_only=true")).json()

    assert page["total"] == 2
    assert {row["agreement_id"] for row in page["items"]} == {first["id"], second["id"]}


async def test_the_spend_adds_up_the_same_however_many_rows_there_are(
    client: AsyncClient,
) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Concrete foundation")
    await client.post(
        f"/api/scopes/{scope['id']}/budget-items",
        json={"description": "Sand", "planned_amount": 50_000_00},
    )
    await client.post(
        f"/api/scopes/{scope['id']}/budget-items",
        json={"description": "Cement", "planned_amount": 30_000_00},
    )
    await _spend(client, project_id, amount=10_000_00, scope_id=scope["id"])
    await _spend(client, project_id, amount=5_000_00)
    gone = await _spend(client, project_id, amount=999_00)
    await client.delete(f"/api/expenses/{gone['id']}")

    spend = (await client.get(f"/api/projects/{project_id}/spend")).json()

    assert spend["planned_amount"] == 80_000_00
    assert spend["spent_amount"] == 15_000_00
    assert spend["unfiled_amount"] == 5_000_00
    assert spend["unfiled_count"] == 1
    assert spend["removed_count"] == 1


async def test_a_project_with_nothing_in_it_totals_zero_rather_than_nothing(
    client: AsyncClient,
) -> None:
    project_id = await _project(client)

    spend = (await client.get(f"/api/projects/{project_id}/spend")).json()

    assert spend["planned_amount"] == 0
    assert spend["spent_amount"] == 0
    assert spend["unfiled_amount"] == 0
    assert spend["variance_percent"] is None


async def test_deleting_an_expense_takes_its_delivery_and_files(client: AsyncClient) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id)
    await client.post(
        f"/api/projects/{project_id}/deliveries",
        json={"expense_id": spend["id"], "description": "17 bags"},
    )
    attached = await client.post(
        f"/api/projects/{project_id}/expenses/{spend['id']}/attachments",
        files={"file": ("receipt.jpg", b"\xff\xd8\xff\xd9", "image/jpeg")},
    )
    assert attached.status_code == 201, attached.text

    assert (await client.delete(f"/api/expenses/{spend['id']}")).status_code == 204

    assert await Delivery.filter(expense_id=spend["id"], deleted_at__isnull=True).count() == 0
    assert await Attachment.filter(expense_id=spend["id"], deleted_at__isnull=True).count() == 0


async def test_restoring_an_expense_brings_its_delivery_and_files_back(
    client: AsyncClient,
) -> None:
    project_id = await _project(client)
    spend = await _spend(client, project_id)
    await client.post(
        f"/api/projects/{project_id}/deliveries",
        json={"expense_id": spend["id"], "description": "17 bags"},
    )
    await client.post(
        f"/api/projects/{project_id}/expenses/{spend['id']}/attachments",
        files={"file": ("receipt.jpg", b"\xff\xd8\xff\xd9", "image/jpeg")},
    )

    await client.delete(f"/api/expenses/{spend['id']}")
    assert (await client.post(f"/api/expenses/{spend['id']}/restore")).status_code == 200

    assert await Delivery.filter(expense_id=spend["id"], deleted_at__isnull=True).count() == 1
    assert await Attachment.filter(expense_id=spend["id"], deleted_at__isnull=True).count() == 1


async def test_suggestion_from_item_history(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Concrete foundation")
    item = (await client.post("/api/items", json={"name": "Cement", "unit": "bag"})).json()

    await _spend(client, project_id, item_id=item["id"], scope_id=scope["id"])
    await _spend(client, project_id, item_id=item["id"], scope_id=scope["id"])

    resp = await client.get(
        f"/api/projects/{project_id}/suggest-scope", params={"item_id": item["id"]}
    )
    assert resp.status_code == 200
    assert resp.json()["scope_id"] == scope["id"]
    assert "item" in resp.json()["reason"].casefold()


async def test_suggestion_from_vendor_history(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Blockwork")
    vendor = (await client.post("/api/vendors", json={"name": "Segun Blocks"})).json()

    await _spend(client, project_id, vendor_id=vendor["id"], scope_id=scope["id"])
    await _spend(client, project_id, vendor_id=vendor["id"], scope_id=scope["id"])

    resp = await client.get(
        f"/api/projects/{project_id}/suggest-scope", params={"vendor_id": vendor["id"]}
    )
    assert resp.status_code == 200
    assert resp.json()["scope_id"] == scope["id"]
    assert "vendor" in resp.json()["reason"].casefold()


async def test_suggestion_prefers_item_over_vendor(client: AsyncClient) -> None:
    project_id = await _project(client)
    item_scope = await _scope(client, project_id, "Concrete foundation")
    vendor_scope = await _scope(client, project_id, "Blockwork")
    item = (await client.post("/api/items", json={"name": "Cement"})).json()
    vendor = (await client.post("/api/vendors", json={"name": "Segun Blocks"})).json()

    await _spend(
        client,
        project_id,
        item_id=item["id"],
        vendor_id=vendor["id"],
        scope_id=item_scope["id"],
    )
    await _spend(
        client,
        project_id,
        item_id=item["id"],
        vendor_id=vendor["id"],
        scope_id=item_scope["id"],
    )
    await _spend(client, project_id, vendor_id=vendor["id"], scope_id=vendor_scope["id"])

    resp = await client.get(
        f"/api/projects/{project_id}/suggest-scope",
        params={"item_id": item["id"], "vendor_id": vendor["id"]},
    )
    assert resp.json()["scope_id"] == item_scope["id"]


async def test_suggestion_tie_returns_null(client: AsyncClient) -> None:
    project_id = await _project(client)
    first = await _scope(client, project_id, "Concrete foundation")
    second = await _scope(client, project_id, "Blockwork")
    item = (await client.post("/api/items", json={"name": "Cement"})).json()

    await _spend(client, project_id, item_id=item["id"], scope_id=first["id"])
    await _spend(client, project_id, item_id=item["id"], scope_id=second["id"])

    resp = await client.get(
        f"/api/projects/{project_id}/suggest-scope", params={"item_id": item["id"]}
    )
    assert resp.status_code == 200
    assert resp.json()["scope_id"] is None
    assert resp.json()["reason"] is None


async def test_suggestion_empty_returns_null(client: AsyncClient) -> None:
    project_id = await _project(client)
    item = (await client.post("/api/items", json={"name": "Cement"})).json()

    resp = await client.get(
        f"/api/projects/{project_id}/suggest-scope", params={"item_id": item["id"]}
    )
    assert resp.status_code == 200
    assert resp.json()["scope_id"] is None
    assert resp.json()["reason"] is None


async def test_suggestion_missing_project_404(client: AsyncClient) -> None:
    await _project(client)
    resp = await client.get("/api/projects/nope/suggest-scope")
    assert resp.status_code == 404


async def test_auto_assigns_scope_from_strong_item_pattern(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Concrete foundation")
    item = (await client.post("/api/items", json={"name": "Cement"})).json()

    await _spend(client, project_id, item_id=item["id"], scope_id=scope["id"])
    await _spend(client, project_id, item_id=item["id"], scope_id=scope["id"])

    spend = await _spend(client, project_id, item_id=item["id"])
    assert spend["scope_id"] == scope["id"]


async def test_auto_assigns_scope_from_strong_vendor_pattern(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Blockwork")
    vendor = (await client.post("/api/vendors", json={"name": "Segun Blocks"})).json()

    await _spend(client, project_id, vendor_id=vendor["id"], scope_id=scope["id"])
    await _spend(client, project_id, vendor_id=vendor["id"], scope_id=scope["id"])

    spend = await _spend(client, project_id, vendor_id=vendor["id"])
    assert spend["scope_id"] == scope["id"]


async def test_auto_assign_prefers_item_over_vendor(client: AsyncClient) -> None:
    project_id = await _project(client)
    item_scope = await _scope(client, project_id, "Concrete foundation")
    vendor_scope = await _scope(client, project_id, "Blockwork")
    item = (await client.post("/api/items", json={"name": "Cement"})).json()
    vendor = (await client.post("/api/vendors", json={"name": "Segun Blocks"})).json()

    await _spend(
        client,
        project_id,
        item_id=item["id"],
        vendor_id=vendor["id"],
        scope_id=item_scope["id"],
    )
    await _spend(
        client,
        project_id,
        item_id=item["id"],
        vendor_id=vendor["id"],
        scope_id=item_scope["id"],
    )
    await _spend(client, project_id, vendor_id=vendor["id"], scope_id=vendor_scope["id"])

    spend = await _spend(client, project_id, item_id=item["id"], vendor_id=vendor["id"])
    assert spend["scope_id"] == item_scope["id"]


async def test_auto_assign_skips_split_history(client: AsyncClient) -> None:
    project_id = await _project(client)
    first = await _scope(client, project_id, "Concrete foundation")
    second = await _scope(client, project_id, "Blockwork")
    item = (await client.post("/api/items", json={"name": "Cement"})).json()

    await _spend(client, project_id, item_id=item["id"], scope_id=first["id"])
    await _spend(client, project_id, item_id=item["id"], scope_id=second["id"])

    spend = await _spend(client, project_id, item_id=item["id"])
    assert spend["scope_id"] is None


async def test_auto_assign_needs_at_least_two_purchases(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Concrete foundation")
    item = (await client.post("/api/items", json={"name": "Cement"})).json()

    await _spend(client, project_id, item_id=item["id"], scope_id=scope["id"])

    spend = await _spend(client, project_id, item_id=item["id"])
    assert spend["scope_id"] is None


async def test_auto_assign_can_be_disabled(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Concrete foundation")
    item = (await client.post("/api/items", json={"name": "Cement"})).json()

    await _spend(client, project_id, item_id=item["id"], scope_id=scope["id"])
    await _spend(client, project_id, item_id=item["id"], scope_id=scope["id"])

    spend = await _spend(client, project_id, item_id=item["id"], auto_scope=False)
    assert spend["scope_id"] is None
