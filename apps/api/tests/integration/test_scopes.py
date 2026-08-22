import pytest
from httpx import AsyncClient

from setout.currencies import CURRENCIES
from setout.models.budget import BudgetItem
from setout.models.currency import Currency
from setout.models.scope_preset import ScopePreset
from setout.utils.scope_presets import SCOPE_PRESETS

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]

# The six scopes a build starts with.
DEFAULT_SCOPES = [
    "Administrative expenses",
    "Equipment rentals",
    "Concrete foundation",
    "Structure and exterior",
    "Interior work",
    "Finalization and inspections",
]


async def _project(client: AsyncClient) -> str:
    wanted = {"NGN"}
    await Currency.bulk_create(
        [Currency(code=c[0], name=c[1], exponent=c[2]) for c in CURRENCIES if c[0] in wanted]
    )
    await ScopePreset.bulk_create(
        [ScopePreset(name=name, sort_order=order) for order, name in enumerate(SCOPE_PRESETS)]
    )
    await client.post("/api/auth/setup", json={"name": "Admin", "password": "password123"})
    resp = await client.post(
        "/api/projects",
        json={"name": "Jacaranda Close, Ewuru", "currency_code": "NGN"},
    )
    return str(resp.json()["id"])


async def _scope(client: AsyncClient, project_id: str, name: str, **extra: object) -> dict:
    resp = await client.post(f"/api/projects/{project_id}/scopes", json={"name": name, **extra})
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_scopes_require_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/projects/nope/scopes")).status_code == 401


async def test_the_six_starting_scopes_can_be_created(client: AsyncClient) -> None:
    project_id = await _project(client)
    for order, name in enumerate(DEFAULT_SCOPES):
        await _scope(client, project_id, name, sort_order=order)

    listed = (await client.get(f"/api/projects/{project_id}/scopes")).json()
    assert [s["name"] for s in listed] == DEFAULT_SCOPES
    assert all(s["planned_amount"] == 0 for s in listed)


async def test_a_budget_item_adds_to_its_scope(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Concrete foundation")

    resp = await client.post(
        f"/api/scopes/{scope['id']}/budget-items",
        json={"description": "600 nine inch blocks", "planned_amount": 150_000_00},
    )
    assert resp.status_code == 201
    assert resp.json()["planned_amount"] == 150_000_00

    listed = (await client.get(f"/api/projects/{project_id}/scopes")).json()
    assert listed[0]["planned_amount"] == 150_000_00
    assert listed[0]["own_planned_amount"] == 150_000_00


async def test_a_total_rolls_up_to_the_group(client: AsyncClient) -> None:
    project_id = await _project(client)
    group = await _scope(client, project_id, "Structure and exterior")
    child = await _scope(client, project_id, "Blockwork", parent_id=group["id"])

    await client.post(
        f"/api/scopes/{child['id']}/budget-items",
        json={"description": "Blocks", "planned_amount": 200_000},
    )

    scopes = {s["id"]: s for s in (await client.get(f"/api/projects/{project_id}/scopes")).json()}
    assert scopes[group["id"]]["is_group"] is True
    assert scopes[group["id"]]["planned_amount"] == 200_000
    assert scopes[group["id"]]["own_planned_amount"] == 0
    assert scopes[child["id"]]["planned_amount"] == 200_000


async def test_a_group_scope_holds_no_budget_of_its_own(client: AsyncClient) -> None:
    project_id = await _project(client)
    group = await _scope(client, project_id, "Structure and exterior")
    await _scope(client, project_id, "Blockwork", parent_id=group["id"])

    resp = await client.post(
        f"/api/scopes/{group['id']}/budget-items",
        json={"description": "Nope", "planned_amount": 100},
    )
    assert resp.status_code == 409


async def test_the_project_budget_totals_every_scope(client: AsyncClient) -> None:
    project_id = await _project(client)
    admin = await _scope(client, project_id, "Administrative expenses")
    concrete = await _scope(client, project_id, "Concrete foundation")
    for scope_id, amount in ((admin["id"], 28_300), (concrete["id"], 3_800_000)):
        await client.post(
            f"/api/scopes/{scope_id}/budget-items",
            json={"description": "Planned", "planned_amount": amount},
        )

    budget = (await client.get(f"/api/projects/{project_id}/budget")).json()
    assert budget["planned_amount"] == 3_828_300
    assert budget["currency_code"] == "NGN"
    assert budget["currency_exponent"] == 2
    assert len(budget["scopes"]) == 2


async def test_changing_the_amount_moves_set_at(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Interior work")
    created = (
        await client.post(
            f"/api/scopes/{scope['id']}/budget-items",
            json={"description": "Tiles", "planned_amount": 1000},
        )
    ).json()

    same = (
        await client.patch(
            f"/api/budget-items/{created['id']}", json={"description": "Floor tiles"}
        )
    ).json()
    assert same["set_at"] == created["set_at"]

    changed = (
        await client.patch(f"/api/budget-items/{created['id']}", json={"planned_amount": 2000})
    ).json()
    assert changed["set_at"] != created["set_at"]


async def test_a_deleted_scope_is_hidden_and_restorable(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Equipment rentals")

    assert (await client.delete(f"/api/scopes/{scope['id']}")).status_code == 204
    assert (await client.get(f"/api/projects/{project_id}/scopes")).json() == []

    restored = await client.post(f"/api/scopes/{scope['id']}/restore")
    assert restored.status_code == 200
    assert restored.json()["deleted_at"] is None


async def test_a_scope_cannot_be_its_own_parent(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Interior work")
    resp = await client.patch(f"/api/scopes/{scope['id']}", json={"parent_id": scope["id"]})
    assert resp.status_code == 409


async def test_budget_items_are_paginated(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Interior work")
    for index in range(3):
        await client.post(
            f"/api/scopes/{scope['id']}/budget-items",
            json={"description": f"Item {index}", "planned_amount": 100},
        )

    page = (await client.get(f"/api/scopes/{scope['id']}/budget-items", params={"limit": 2})).json()
    assert page["total"] == 3
    assert len(page["items"]) == 2


async def test_scope_presets_are_seeded(client: AsyncClient) -> None:
    await _project(client)
    resp = await client.get("/api/scope-presets")
    assert resp.status_code == 200
    names = [p["name"] for p in resp.json()]
    assert set(DEFAULT_SCOPES) <= set(names)
    assert names == sorted(names, key=lambda n: names.index(n))
    assert len(names) >= len(DEFAULT_SCOPES)


async def test_a_scope_can_be_named_anything(client: AsyncClient) -> None:
    project_id = await _project(client)
    made_up = await _scope(client, project_id, "Borehole and water tank")
    assert made_up["name"] == "Borehole and water tank"


async def test_missing_things_answer_404(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Interior work")

    assert (await client.get("/api/projects/nope/scopes")).status_code == 404
    assert (await client.get("/api/projects/nope/budget")).status_code == 404
    assert (await client.patch("/api/scopes/nope", json={"name": "x"})).status_code == 404
    assert (await client.delete("/api/scopes/nope")).status_code == 404
    assert (await client.post("/api/scopes/nope/restore")).status_code == 404
    assert (await client.get("/api/scopes/nope/budget-items")).status_code == 404
    assert (await client.delete("/api/budget-items/nope")).status_code == 404
    assert (
        await client.patch("/api/budget-items/nope", json={"planned_amount": 1})
    ).status_code == 404
    assert (
        await client.post(
            "/api/scopes/nope/budget-items",
            json={"description": "x", "planned_amount": 1},
        )
    ).status_code == 404
    assert (
        await client.post(
            f"/api/projects/{project_id}/scopes",
            json={"name": "Orphan", "parent_id": "nope"},
        )
    ).status_code == 404
    assert scope["id"] != "nope"


async def test_a_budget_item_is_soft_deleted(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Roofing")
    item = (
        await client.post(
            f"/api/scopes/{scope['id']}/budget-items",
            json={"description": "Roofing sheets", "planned_amount": 750_000_00},
        )
    ).json()

    assert (await client.delete(f"/api/budget-items/{item['id']}")).status_code == 204

    page = (await client.get(f"/api/scopes/{scope['id']}/budget-items")).json()
    assert page["items"] == []
    assert page["total"] == 0

    # The row is hidden, not gone, and the scope total drops with it.
    from setout.models.budget import BudgetItem

    row = await BudgetItem.get(id=item["id"])
    assert row.deleted_at is not None

    scopes = (await client.get(f"/api/projects/{project_id}/scopes")).json()
    assert scopes[0]["planned_amount"] == 0


async def test_a_scope_can_be_moved_under_another(client: AsyncClient) -> None:
    project_id = await _project(client)
    parent = await _scope(client, project_id, "Structure and exterior")
    child = await _scope(client, project_id, "Blockwork")

    moved = await client.patch(f"/api/scopes/{child['id']}", json={"parent_id": parent["id"]})
    assert moved.status_code == 200
    assert moved.json()["parent_id"] == parent["id"]

    scopes = {s["id"]: s for s in (await client.get(f"/api/projects/{project_id}/scopes")).json()}
    assert scopes[parent["id"]]["is_group"] is True


async def test_a_scope_cannot_be_reparented_across_projects(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Interior work")

    other = (
        await client.post(
            "/api/projects",
            json={"name": "Owode Bungalow", "currency_code": "NGN"},
        )
    ).json()
    stranger = await _scope(client, other["id"], "Interior work")

    resp = await client.patch(f"/api/scopes/{scope['id']}", json={"parent_id": stranger["id"]})
    assert resp.status_code == 404


async def test_the_project_carries_its_planned_total(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Concrete foundation")

    listed = (await client.get("/api/projects")).json()["items"]
    assert listed[0]["planned_amount"] == 0

    await client.post(
        f"/api/scopes/{scope['id']}/budget-items",
        json={"description": "Blocks", "planned_amount": 382_830_000},
    )

    listed = (await client.get("/api/projects")).json()["items"]
    assert listed[0]["planned_amount"] == 382_830_000
    assert (await client.get(f"/api/projects/{project_id}")).json()["planned_amount"] == 382_830_000


async def test_a_planned_total_stays_with_its_own_project(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Concrete foundation")
    await client.post(
        f"/api/scopes/{scope['id']}/budget-items",
        json={"description": "Blocks", "planned_amount": 500_000},
    )

    other = (
        await client.post("/api/projects", json={"name": "Owode Bungalow", "currency_code": "NGN"})
    ).json()

    by_id = {p["id"]: p for p in (await client.get("/api/projects")).json()["items"]}
    assert by_id[project_id]["planned_amount"] == 500_000
    assert by_id[other["id"]]["planned_amount"] == 0


async def test_a_deleted_budget_item_leaves_the_project_total(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Roofing")
    item = (
        await client.post(
            f"/api/scopes/{scope['id']}/budget-items",
            json={"description": "Sheets", "planned_amount": 750_000},
        )
    ).json()

    await client.delete(f"/api/budget-items/{item['id']}")
    listed = (await client.get("/api/projects")).json()["items"]
    assert listed[0]["planned_amount"] == 0


async def test_a_scope_with_expenses_cannot_be_deleted(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Interior work")
    await client.post(
        f"/api/projects/{project_id}/expenses",
        json={"description": "Tiles", "amount": 340_000_00, "scope_id": scope["id"]},
    )

    resp = await client.delete(f"/api/scopes/{scope['id']}")

    assert resp.status_code == 409
    assert resp.json()["detail"] == "A scope with expenses cannot be deleted, only renamed"


async def test_a_scope_with_nothing_spent_on_it_can_be_deleted(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Landscaping")

    assert (await client.delete(f"/api/scopes/{scope['id']}")).status_code == 204


async def test_a_group_cannot_be_deleted_over_spend_beneath_it(client: AsyncClient) -> None:
    project_id = await _project(client)
    parent = await _scope(client, project_id, "Structure")
    child = await _scope(client, project_id, "Roof", parent_id=parent["id"])
    await client.post(
        f"/api/projects/{project_id}/expenses",
        json={"description": "Sheets", "amount": 820_000_00, "scope_id": child["id"]},
    )

    assert (await client.delete(f"/api/scopes/{parent['id']}")).status_code == 409


async def test_a_deleted_expense_no_longer_holds_its_scope(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Interior work")
    spend = (
        await client.post(
            f"/api/projects/{project_id}/expenses",
            json={"description": "Tiles", "amount": 340_000_00, "scope_id": scope["id"]},
        )
    ).json()

    await client.delete(f"/api/expenses/{spend['id']}")

    assert (await client.delete(f"/api/scopes/{scope['id']}")).status_code == 204


async def test_a_scope_can_be_renamed_whatever_was_spent_on_it(client: AsyncClient) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Interior work")
    await client.post(
        f"/api/projects/{project_id}/expenses",
        json={"description": "Tiles", "amount": 340_000_00, "scope_id": scope["id"]},
    )

    resp = await client.patch(f"/api/scopes/{scope['id']}", json={"name": "Inside work"})

    assert resp.status_code == 200
    assert resp.json()["name"] == "Inside work"


async def test_deleting_a_scope_takes_its_budget_items_and_restore_brings_them_back(
    client: AsyncClient,
) -> None:
    project_id = await _project(client)
    scope = await _scope(client, project_id, "Foundation")
    await client.post(
        f"/api/scopes/{scope['id']}/budget-items",
        json={"description": "Sand", "planned_amount": 100_000_00},
    )

    assert (await client.delete(f"/api/scopes/{scope['id']}")).status_code == 204
    assert await BudgetItem.filter(scope_id=scope["id"], deleted_at__isnull=True).count() == 0

    assert (await client.post(f"/api/scopes/{scope['id']}/restore")).status_code == 200
    back = (await client.get(f"/api/scopes/{scope['id']}/budget-items")).json()
    assert [row["description"] for row in back["items"]] == ["Sand"]
