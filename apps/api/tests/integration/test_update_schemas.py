"""PATCH bodies against the real database columns and endpoints."""

import pytest
from httpx import AsyncClient
from tortoise import Tortoise

from setout.currencies import CURRENCIES
from setout.models.currency import Currency
from setout.schemas.base import UpdateModel
from tests.unit.test_update_models import UPDATE_MODELS

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]

MODEL_FOR = {
    "AdvanceUpdate": "Advance",
    "AgreementUpdate": "Agreement",
    "AccountUpdate": "User",
    "BudgetItemUpdate": "BudgetItem",
    "CategoryUpdate": "Category",
    "DeliveryUpdate": "Delivery",
    "ExpenseUpdate": "Expense",
    "ItemUpdate": "Item",
    "LandUpdate": "Land",
    "LandDocumentUpdate": "LandDocument",
    "LandValuationUpdate": "LandValuation",
    "PersonUpdate": "Person",
    "ProjectUpdate": "Project",
    "VendorUpdate": "Vendor",
}


# Required columns where null in a PATCH body means something other than "clear it".
NULL_HANDLED_ELSEWHERE = {
    # The router refuses a null name with its own documented message.
    "AccountUpdate": {"name"},
    # A null amount asks for it to be recalculated from quantity and unit rate.
    "ExpenseUpdate": {"amount"},
}


async def test_not_null_lists_match_the_database_columns(client: AsyncClient) -> None:
    models = {model.__name__: model for model in Tortoise.apps.get_models_iterable()}

    def not_null(schema: type[UpdateModel]) -> set[str]:
        fields = models[MODEL_FOR[schema.__name__]]._meta.fields_map
        return {
            name
            for name in schema.model_fields
            if (column := fields.get(name) or fields.get(name.removesuffix("_id"))) is not None
            and not column.null
        }

    assert {s.__name__: set(s.NOT_NULL) for s in UPDATE_MODELS} == {
        s.__name__: not_null(s) - NULL_HANDLED_ELSEWHERE.get(s.__name__, set())
        for s in UPDATE_MODELS
    }


async def _project(client: AsyncClient) -> dict:
    await Currency.bulk_create(
        [Currency(code=c[0], name=c[1], exponent=c[2]) for c in CURRENCIES if c[0] == "NGN"]
    )
    await client.post("/api/auth/setup", json={"name": "Admin", "passphrase": "password123"})
    resp = await client.post("/api/projects", json={"name": "Owode", "currency_code": "NGN"})
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_clearing_a_project_name_is_refused_not_a_server_error(client: AsyncClient) -> None:
    project = await _project(client)

    for body in ({"name": None}, {"status": None}, {"name": "   "}):
        resp = await client.patch(f"/api/projects/{project['id']}", json=body)
        assert resp.status_code == 422, (body, resp.text)


async def test_clearing_an_expense_description_or_date_is_refused(client: AsyncClient) -> None:
    project = await _project(client)
    expense = await client.post(
        f"/api/projects/{project['id']}/expenses",
        json={"description": "Cement", "amount": 500000, "spent_on": "2026-03-01"},
    )
    assert expense.status_code == 201, expense.text

    for field in ("description", "spent_on"):
        resp = await client.patch(f"/api/expenses/{expense.json()['id']}", json={field: None})
        assert resp.status_code == 422, (field, resp.text)


async def test_clearing_a_category_sort_order_is_refused(client: AsyncClient) -> None:
    project = await _project(client)
    created = await client.post(
        f"/api/projects/{project['id']}/categories", json={"name": "Foundation"}
    )

    resp = await client.patch(f"/api/categories/{created.json()['id']}", json={"sort_order": None})

    assert resp.status_code == 422
    assert "sort_order cannot be null" in resp.text
