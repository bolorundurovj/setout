"""Back up every table, change the data, restore, and compare the database with the backup."""

import json
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient

from setout.currencies import CURRENCIES
from setout.models.advance import Advance
from setout.models.agreement import Agreement
from setout.models.attachment import Attachment
from setout.models.budget import BudgetItem
from setout.models.category import Category
from setout.models.category_preset import CategoryPreset
from setout.models.change import Change, ChangeAction
from setout.models.country import Country, State
from setout.models.currency import Currency
from setout.models.delivery import Delivery
from setout.models.expense import Expense
from setout.models.item import Item
from setout.models.land import Land
from setout.models.land_document import LandDocument
from setout.models.land_valuation import LandValuation
from setout.models.person import Person
from setout.models.project import Project
from setout.models.vendor import Vendor
from setout.utils.backup import TABLES, read_all

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def _seed_every_table(client: AsyncClient) -> None:
    await Currency.bulk_create(
        [Currency(code=c[0], name=c[1], exponent=c[2]) for c in CURRENCIES if c[0] == "NGN"]
    )
    setup = await client.post(
        "/api/auth/setup", json={"name": "Admin", "passphrase": "password123"}
    )
    assert setup.status_code == 200, setup.text

    country = await Country.create(code="NG", name="Nigeria")
    await State.create(code="NG-LA", country=country, name="Lagos")
    await CategoryPreset.create(name="Foundation")
    await Change.create(
        entity="project",
        entity_id="p1",
        action=ChangeAction.UPDATE,
        changed_fields={"name": {"old": "Plot 4", "new": "Plot 4, Ewuru"}, "notes": None},
    )
    land = await Land.create(
        name="Plot 4",
        latitude=Decimal("6.5244000"),
        longitude=Decimal("3.3792000"),
        size_value=Decimal("648.00"),
        purchased_on=date(2025, 1, 31),
    )
    project = await Project.create(name="Jacaranda Close, Ewuru", currency_id="NGN", land=land)
    walls = await Category.create(project=project, name="Superstructure")
    blockwork = await Category.create(project=project, name="Blockwork", parent=walls)
    await BudgetItem.create(
        category=blockwork,
        description="Cement",
        budgeted_amount=300_000_00,
        set_at=datetime(2026, 3, 15, 9, 30, tzinfo=UTC),
    )
    await Item.create(name="Cement")
    vendor = await Vendor.create(name="Dangote Depot")
    person = await Person.create(name="Tunde")
    await Agreement.create(
        project=project, vendor=vendor, description="Blockwork labour", agreed_amount=450_000_00
    )
    expense = await Expense.create(
        project=project,
        category=blockwork,
        spent_on=date(2026, 3, 16),
        description="Cement, 50 bags",
        amount=275_000_00,
        quantity=Decimal("50.500"),
    )
    await Advance.create(
        person=person, project=project, given_on=date(2026, 3, 1), amount=10_000_00
    )
    await Delivery.create(
        project=project, expense=expense, description="Cement", expected=date(2026, 3, 20)
    )
    await Attachment.create(
        project=project,
        filename="receipt.pdf",
        content_type="application/pdf",
        byte_size=1024,
        checksum="a" * 64,
        storage_key="aa/receipt",
    )
    await LandDocument.create(
        land=land,
        filename="survey.pdf",
        content_type="application/pdf",
        byte_size=2048,
        checksum="b" * 64,
        storage_key="bb/survey",
    )
    await LandValuation.create(
        land=land, amount=12_000_000_00, currency_id="NGN", valued_on=date(2025, 1, 31)
    )


def _sorted(tables: dict[str, list[dict[str, Any]]]) -> dict[str, list[dict[str, Any]]]:
    return {
        name: sorted(rows, key=lambda row: json.dumps(row, sort_keys=True, default=str))
        for name, rows in tables.items()
    }


async def test_a_backup_of_every_table_restores_exactly(client: AsyncClient) -> None:
    await _seed_every_table(client)
    export = await client.post("/api/install/export", json={"passphrase": "password123"})
    assert export.status_code == 200, export.text
    backup = export.json()
    assert [table for table in TABLES if not backup["tables"][table]] == []
    before = _sorted(await read_all())

    await Project.create(name="Added after the backup", currency_id="NGN")
    resp = await client.post(
        "/api/install/restore", json={"passphrase": "password123", "backup": backup}
    )
    assert resp.status_code == 200, resp.text

    after = _sorted(await read_all())
    for table in TABLES:
        assert after[table] == before[table], table
