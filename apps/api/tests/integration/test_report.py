from datetime import date

import pytest
from httpx import AsyncClient

from setout.controllers.report import ReportController
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


async def _post(client: AsyncClient, path: str, body: dict) -> dict:
    resp = await client.post(f"/api{path}", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _filled_project(client: AsyncClient) -> str:
    project_id = await _project(client)
    category = await _post(client, f"/projects/{project_id}/categories", {"name": "Foundation"})
    await _post(
        client,
        f"/categories/{category['id']}/budget-items",
        {"description": "Blocks", "budgeted_amount": 500_000_00, "cost_type": "material"},
    )
    vendor = await _post(client, "/vendors", {"name": "Adebayo Blocks"})
    agreement = await _post(
        client,
        f"/projects/{project_id}/agreements",
        {"vendor_id": vendor["id"], "description": "Block work", "agreed_amount": 300_000_00},
    )
    await _post(
        client,
        f"/projects/{project_id}/expenses",
        {
            "description": "First payment",
            "amount": 100_000_00,
            "spent_on": "2026-08-14",
            "category_id": category["id"],
            "vendor_id": vendor["id"],
            "agreement_id": agreement["id"],
            "cost_type": "material",
        },
    )
    unfiled = await _post(
        client,
        f"/projects/{project_id}/expenses",
        {"description": "17 bags of cement", "amount": 76_500_00, "spent_on": "2026-09-02"},
    )
    await _post(
        client,
        f"/projects/{project_id}/deliveries",
        {"expense_id": unfiled["id"], "expected": "2026-10-30"},
    )
    return project_id


async def test_report_downloads_as_a_pdf(client: AsyncClient) -> None:
    project_id = await _filled_project(client)

    resp = await client.get(f"/api/projects/{project_id}/report.pdf")

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert "setout-jacaranda-close-ewuru-report-" in resp.headers["content-disposition"]
    assert resp.content.startswith(b"%PDF")


async def test_report_of_unknown_project_returns_404(client: AsyncClient) -> None:
    await _project(client)
    assert (await client.get("/api/projects/nope/report.pdf")).status_code == 404


async def test_report_of_an_empty_project_renders(client: AsyncClient) -> None:
    project_id = await _project(client)

    resp = await client.get(f"/api/projects/{project_id}/report.pdf")

    assert resp.status_code == 200
    assert resp.content.startswith(b"%PDF")


async def test_report_gathers_the_project_figures(client: AsyncClient) -> None:
    project_id = await _filled_project(client)

    report = await ReportController().gather(project_id, date(2026, 10, 25))

    assert report.budgeted_amount == 500_000_00
    assert report.spent_amount == 176_500_00
    assert [(line.name, line.budgeted_amount, line.spent_amount) for line in report.categories] == [
        ("Foundation", 500_000_00, 100_000_00),
        ("Uncategorised", 0, 76_500_00),
    ]
    assert [(line.name, line.budgeted_amount, line.spent_amount) for line in report.cost_types] == [
        ("Material", 500_000_00, 100_000_00),
        ("Not set", 0, 76_500_00),
    ]
    assert [(line.month, line.amount) for line in report.months] == [
        ("2026-08", 100_000_00),
        ("2026-09", 76_500_00),
    ]
    assert [
        (line.vendor_name, line.agreed_amount, line.paid_amount, line.balance_amount)
        for line in report.agreements
    ] == [("Adebayo Blocks", 300_000_00, 100_000_00, 200_000_00)]
    assert [(line.description, line.amount) for line in report.outstanding] == [
        ("17 bags of cement", 76_500_00)
    ]


async def test_the_report_reads_each_table_once(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Every section is computed from one read of each table, not one per section."""
    from tortoise import Tortoise

    project_id = await _filled_project(client)
    connection = Tortoise.get_connection("default")
    queries: list[str] = []

    for name in ("execute_query", "execute_query_dict"):
        original = getattr(connection, name)

        async def counting(query: object, values: object = None, _original=original):  # type: ignore[no-untyped-def]
            queries.append(str(query))
            return await _original(query, values)  # type: ignore[arg-type]

        monkeypatch.setattr(connection, name, counting)

    await ReportController().gather(project_id, date(2026, 10, 25))

    reads = [query for query in queries if " FROM " in query]
    for table in ("expense", "project", "budget_item"):
        assert len([query for query in reads if f'FROM "{table}"' in query]) == 1, table
    assert len(reads) <= 12
