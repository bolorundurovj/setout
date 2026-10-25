from typing import Any

import pytest
from httpx import AsyncClient

from setout.currencies import CURRENCIES
from setout.models.change import Change, ChangeAction
from setout.models.currency import Currency

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def _post(client: AsyncClient, path: str, body: dict[str, Any]) -> dict[str, Any]:
    resp = await client.post(f"/api{path}", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _project(client: AsyncClient) -> str:
    await Currency.bulk_create(
        [Currency(code=c[0], name=c[1], exponent=c[2]) for c in CURRENCIES if c[0] == "NGN"]
    )
    await client.post("/api/auth/setup", json={"name": "Admin", "passphrase": "password123"})
    project = await _post(
        client, "/projects", {"name": "Jacaranda Close, Ewuru", "currency_code": "NGN"}
    )
    return str(project["id"])


async def _changes(entity: str, entity_id: str) -> list[Change]:
    return await Change.filter(entity=entity, entity_id=entity_id).order_by("created_at", "id")


async def test_creating_an_expense_records_the_signed_in_user(client: AsyncClient) -> None:
    project_id = await _project(client)
    user_id = (await client.get("/api/auth/me")).json()["id"]

    expense = await _post(
        client, f"/projects/{project_id}/expenses", {"description": "Cement", "amount": 100}
    )

    [created] = await _changes("expense", expense["id"])
    assert created.action is ChangeAction.CREATE
    assert created.user_id == user_id
    assert created.project_id == project_id
    assert created.changed_fields["amount"] == [None, 100]


async def test_updating_an_amount_records_only_that_field(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _post(
        client, f"/projects/{project_id}/expenses", {"description": "Cement", "amount": 100}
    )

    resp = await client.patch(f"/api/expenses/{expense['id']}", json={"amount": 150})
    assert resp.status_code == 200, resp.text

    updated = (await _changes("expense", expense["id"]))[-1]
    assert updated.action is ChangeAction.UPDATE
    assert updated.changed_fields == {"amount": [100, 150]}


async def test_saving_without_changes_records_nothing(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _post(
        client, f"/projects/{project_id}/expenses", {"description": "Cement", "amount": 100}
    )

    await client.patch(f"/api/expenses/{expense['id']}", json={"amount": 100})

    assert len(await _changes("expense", expense["id"])) == 1


async def test_a_budget_item_change_belongs_to_its_category_project(client: AsyncClient) -> None:
    project_id = await _project(client)
    category = await _post(client, f"/projects/{project_id}/categories", {"name": "Foundation"})
    item = await _post(
        client,
        f"/categories/{category['id']}/budget-items",
        {"description": "Blocks", "budgeted_amount": 500},
    )

    resp = await client.patch(f"/api/budget-items/{item['id']}", json={"budgeted_amount": 800})
    assert resp.status_code == 200, resp.text

    updated = (await _changes("budget_item", item["id"]))[-1]
    assert updated.changed_fields == {"budgeted_amount": [500, 800]}
    assert updated.project_id == project_id
