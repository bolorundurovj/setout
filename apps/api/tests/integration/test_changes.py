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


async def test_archiving_a_project_records_each_cascaded_expense(client: AsyncClient) -> None:
    project_id = await _project(client)
    expense = await _post(
        client, f"/projects/{project_id}/expenses", {"description": "Cement", "amount": 100}
    )
    await client.patch(f"/api/projects/{project_id}", json={"status": "closed"})

    resp = await client.post(f"/api/projects/{project_id}/archive")
    assert resp.status_code == 204, resp.text

    assert (await _changes("project", project_id))[-1].action is ChangeAction.ARCHIVE
    archived = (await _changes("expense", expense["id"]))[-1]
    assert archived.action is ChangeAction.ARCHIVE
    assert archived.project_id == project_id

    await client.post(f"/api/projects/{project_id}/restore")
    assert (await _changes("expense", expense["id"]))[-1].action is ChangeAction.RESTORE


async def test_bulk_categorise_records_each_expense(client: AsyncClient) -> None:
    project_id = await _project(client)
    category = await _post(client, f"/projects/{project_id}/categories", {"name": "Foundation"})
    expenses = [
        await _post(
            client, f"/projects/{project_id}/expenses", {"description": name, "amount": 100}
        )
        for name in ("Cement", "Sand")
    ]

    resp = await client.patch(
        f"/api/projects/{project_id}/expenses",
        json={"category_id": category["id"], "expense_ids": [e["id"] for e in expenses]},
    )
    assert resp.status_code == 200, resp.text

    for expense in expenses:
        updated = (await _changes("expense", expense["id"]))[-1]
        assert updated.changed_fields == {"category_id": [None, category["id"]]}


async def test_deleting_a_vendor_records_cleared_links_and_deleted_agreements(
    client: AsyncClient,
) -> None:
    project_id = await _project(client)
    vendor = await _post(client, "/vendors", {"name": "Adebayo Blocks"})
    agreement = await _post(
        client,
        f"/projects/{project_id}/agreements",
        {"vendor_id": vendor["id"], "description": "Block work", "agreed_amount": 1000},
    )
    expense = await _post(
        client,
        f"/projects/{project_id}/expenses",
        {"description": "Blocks", "amount": 100, "vendor_id": vendor["id"]},
    )

    await client.post(f"/api/vendors/{vendor['id']}/archive")
    resp = await client.delete(f"/api/vendors/{vendor['id']}")
    assert resp.status_code == 204, resp.text

    cleared = (await _changes("expense", expense["id"]))[-1]
    assert cleared.changed_fields == {"vendor_id": [vendor["id"], None]}
    deleted = (await _changes("agreement", agreement["id"]))[-1]
    assert deleted.action is ChangeAction.DELETE
    assert deleted.changed_fields["description"] == ["Block work", None]
    assert (await _changes("vendor", vendor["id"]))[-1].action is ChangeAction.DELETE


async def test_an_import_records_one_change(client: AsyncClient) -> None:
    project_id = await _project(client)
    csv = b"Cost Code,Description,Labour Costs,Material Costs,Fixed Costs,Budget\n"
    csv += b"1000,Admin,,,,0\n1001,Beacons,,1000,,1000\n"
    before = await Change.all().count()

    resp = await client.post(
        "/api/import",
        files={"file": ("budget.csv", csv, "text/csv")},
        data={"project_id": project_id},
    )
    assert resp.status_code == 201, resp.text

    [imported] = await Change.all().offset(before).order_by("created_at", "id")
    assert imported.action is ChangeAction.IMPORT
    assert imported.project_id == project_id
    assert imported.changed_fields["budget_item_count"] == 1


async def test_a_backup_restore_keeps_change_rows_and_adds_none(client: AsyncClient) -> None:
    project_id = await _project(client)
    await _post(
        client, f"/projects/{project_id}/expenses", {"description": "Cement", "amount": 100}
    )
    backup = (await client.get("/api/install/export")).json()
    count = await Change.all().count()
    assert backup["row_counts"]["change"] == count

    resp = await client.post(
        "/api/install/restore", json={"backup": backup, "accept_version_change": True}
    )
    assert resp.status_code == 200, resp.text

    assert await Change.all().count() == count
