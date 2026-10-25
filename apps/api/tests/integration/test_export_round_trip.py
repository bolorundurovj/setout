"""Export a project, delete it, import the export, and compare the database before and after."""

from typing import Any

import pytest
from httpx import AsyncClient

from setout.currencies import CURRENCIES
from setout.models.budget import BudgetItem
from setout.models.category import Category
from setout.models.currency import Currency
from setout.models.expense import Expense
from setout.models.item import Item
from setout.models.person import Person
from setout.models.project import Project
from setout.models.vendor import Vendor

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def _post(client: AsyncClient, path: str, body: dict[str, Any]) -> dict[str, Any]:
    resp = await client.post(f"/api{path}", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _seed(client: AsyncClient) -> str:
    await Currency.bulk_create(
        [Currency(code=c[0], name=c[1], exponent=c[2]) for c in CURRENCIES if c[0] == "NGN"]
    )
    await client.post("/api/auth/setup", json={"name": "Admin", "passphrase": "password123"})
    project = await _post(
        client, "/projects", {"name": "Jacaranda Close, Ewuru", "currency_code": "NGN"}
    )
    project_id = project["id"]

    admin = await _post(client, f"/projects/{project_id}/categories", {"name": "Administration"})
    foundation = await _post(client, f"/projects/{project_id}/categories", {"name": "Foundation"})
    walls = await _post(client, f"/projects/{project_id}/categories", {"name": "Superstructure"})
    blockwork = await _post(
        client,
        f"/projects/{project_id}/categories",
        {"name": "Blockwork", "parent_id": walls["id"]},
    )
    for category, description, amount, cost_type in [
        (admin, "Beacons", 1_000_00, "fixed"),
        (admin, "Drawings", 20_000_00, None),
        (foundation, "Pegging", 37_500_00, "labour"),
        (foundation, "Blocks", 500_000_00, "material"),
        (blockwork, "Cement", 300_000_00, "material"),
    ]:
        await _post(
            client,
            f"/categories/{category['id']}/budget-items",
            {"description": description, "budgeted_amount": amount, "cost_type": cost_type},
        )

    vendor = await _post(
        client,
        "/vendors",
        {
            "name": "Adebayo Blocks",
            "trade": "Blockmaker",
            "contact_name": "Mr Adebayo",
            "phone": "0800 000 0001",
            "email": "sales@adebayo.example",
            "notes": "Delivers on Saturdays",
        },
    )
    person = await _post(client, "/people", {"name": "Ayo"})
    cement = await _post(client, "/items", {"name": "Cement", "unit": "bag"})

    for body in [
        {
            "description": "Survey beacons",
            "amount": 1_000_00,
            "spent_on": "2026-08-01",
            "category_id": admin["id"],
        },
        {
            "description": "First load of blocks",
            "amount": 250_000_00,
            "spent_on": "2026-08-14",
            "category_id": foundation["id"],
            "vendor_id": vendor["id"],
            "paid_by_id": person["id"],
            "notes": "Half of the agreed load",
        },
        {"description": "17 bags of cement", "amount": 76_500_00, "spent_on": "2026-09-02"},
        {
            "description": "Cement for the ground floor",
            "amount": None,
            "spent_on": "2026-09-10",
            "category_id": blockwork["id"],
            "cost_type": "material",
            "item_id": cement["id"],
            "quantity": 10,
            "unit_rate": 7_650_00,
            "notes": "Delivered to site",
        },
    ]:
        expense = await _post(client, f"/projects/{project_id}/expenses", body)

    attached = await client.post(
        f"/api/projects/{project_id}/expenses/{expense['id']}/attachments",
        files={"file": ("receipt.jpg", b"\xff\xd8 receipt", "image/jpeg")},
    )
    assert attached.status_code == 201, attached.text
    return str(project_id)


async def _snapshot() -> dict[str, Any]:
    """The rows the import format carries, keyed by name rather than by generated id."""
    project = await Project.get()
    categories = await Category.filter(project_id=project.id).order_by("sort_order", "id")
    category_names = {category.id: category.name for category in categories}
    catalogue = await Item.all().order_by("name")
    item_names = {item.id: item.name for item in catalogue}
    vendors = await Vendor.all().order_by("name")
    vendor_names = {vendor.id: vendor.name for vendor in vendors}
    people = await Person.all().order_by("name")
    person_names = {person.id: person.name for person in people}
    items = await BudgetItem.filter(category__project_id=project.id)
    expenses = await Expense.filter(project_id=project.id)
    return {
        "project": (project.name, project.currency_id),
        "categories": [
            (category.name, category_names.get(category.parent_id or "")) for category in categories
        ],
        "budget_items": sorted(
            (
                category_names[item.category_id],
                item.description,
                item.budgeted_amount,
                item.cost_type,
            )
            for item in items
        ),
        "vendors": [(v.name, v.trade, v.contact_name, v.phone, v.email, v.notes) for v in vendors],
        "people": [person.name for person in people],
        "items": [(item.name, item.unit) for item in catalogue],
        "expenses": sorted(
            (
                expense.description,
                expense.amount,
                expense.spent_on,
                category_names.get(expense.category_id or ""),
                vendor_names.get(expense.vendor_id or ""),
                person_names.get(expense.paid_by_id or ""),
                expense.notes,
                expense.cost_type,
                expense.quantity,
                expense.unit_rate,
                item_names.get(expense.item_id or ""),
            )
            for expense in expenses
        ),
    }


def _assert_seeded(snapshot: dict[str, Any]) -> None:
    assert len(snapshot["categories"]) == 4
    assert ("Blockwork", "Superstructure") in snapshot["categories"]
    assert len(snapshot["budget_items"]) == 5
    assert len(snapshot["expenses"]) == 4
    assert len(snapshot["vendors"]) == 1
    assert snapshot["items"] == [("Cement", "bag")]


async def _delete_everything() -> None:
    await Project.all().delete()
    await Vendor.all().delete()
    await Person.all().delete()
    await Item.all().delete()


async def _import(client: AsyncClient, name: str, data: bytes, **form: str) -> dict[str, Any]:
    resp = await client.post(
        "/api/import",
        files={"file": (name, data, "application/octet-stream")},
        data={"name": "Jacaranda Close, Ewuru", "currency_code": "NGN"} | form,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_workbook_export_restores_the_same_rows_after_deletion(client: AsyncClient) -> None:
    project_id = await _seed(client)
    before = await _snapshot()
    _assert_seeded(before)
    exported = await client.get(f"/api/projects/{project_id}/export")
    assert exported.status_code == 200

    await _delete_everything()
    await _import(client, "export.xlsx", exported.content)

    assert await _snapshot() == before


async def test_csv_export_restores_the_same_project_rows_after_deletion(
    client: AsyncClient,
) -> None:
    project_id = await _seed(client)
    before = await _snapshot()
    _assert_seeded(before)
    budget = await client.get(f"/api/projects/{project_id}/export.csv", params={"sheet": "budget"})
    expenses = await client.get(
        f"/api/projects/{project_id}/export.csv", params={"sheet": "expenses"}
    )

    # The CSVs carry no vendor sheet, so vendors and people stay and are matched by name.
    await Project.all().delete()
    imported = await _import(client, "budget.csv", budget.content)
    await _import(client, "expenses.csv", expenses.content, project_id=imported["project_id"])

    assert await _snapshot() == before
