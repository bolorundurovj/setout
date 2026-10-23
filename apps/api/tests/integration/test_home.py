import pytest
from httpx import AsyncClient

from setout.currencies import CURRENCIES
from setout.models.currency import Currency

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def _set_up_admin(client: AsyncClient) -> None:
    await Currency.bulk_create(
        [
            Currency(code=c[0], name=c[1], exponent=c[2])
            for c in CURRENCIES
            if c[0] in ("NGN", "USD")
        ]
    )
    await client.post("/api/auth/setup", json={"name": "Admin", "passphrase": "password123"})


async def _project(client: AsyncClient, name: str, currency: str = "NGN") -> str:
    resp = await client.post("/api/projects", json={"name": name, "currency_code": currency})
    return str(resp.json()["id"])


async def _expense(client: AsyncClient, project_id: str, **body: object) -> dict:
    payload = {"description": "Cement", "amount": 10_000_00} | body
    resp = await client.post(f"/api/projects/{project_id}/expenses", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _read(client: AsyncClient, section: str, currency: str | None = None) -> dict:
    query = f"?currency={currency}" if currency else ""
    resp = await client.get(f"/api/home/{section}{query}")
    assert resp.status_code == 200, resp.text
    return dict(resp.json())


SECTIONS = ("summary", "months", "projects", "latest")


@pytest.mark.parametrize("section", SECTIONS)
async def test_every_section_requires_authentication(client: AsyncClient, section: str) -> None:
    assert (await client.get(f"/api/home/{section}")).status_code == 401


async def test_new_install_returns_empty_sections(client: AsyncClient) -> None:
    await _set_up_admin(client)

    summary = await _read(client, "summary")

    assert summary["project_count"] == 0
    assert summary["currencies"] == []
    assert summary["currency_code"] is None
    assert summary["budgeted_amount"] == 0
    assert summary["alerts"] == []
    assert (await _read(client, "months"))["months"] == []
    assert (await _read(client, "projects"))["rows"] == []
    assert (await _read(client, "latest"))["rows"] == []


async def test_summary_totals_every_project_in_the_currency(client: AsyncClient) -> None:
    await _set_up_admin(client)
    first = await _project(client, "Jacaranda Close")
    second = await _project(client, "Palm Ridge")
    category = (
        await client.post(f"/api/projects/{first}/categories", json={"name": "Foundation"})
    ).json()
    await client.post(
        f"/api/categories/{category['id']}/budget-items",
        json={"description": "Sand", "budgeted_amount": 100_000_00},
    )
    await _expense(client, first, amount=40_000_00, category_id=category["id"])
    await _expense(client, second, amount=5_000_00)

    summary = await _read(client, "summary")

    assert summary["project_count"] == 2
    assert summary["currency_code"] == "NGN"
    assert summary["currency_exponent"] == 2
    assert summary["currency_project_count"] == 2
    assert summary["budgeted_amount"] == 100_000_00
    assert summary["spent_amount"] == 45_000_00


async def test_summary_lists_each_currency_with_project_count(client: AsyncClient) -> None:
    await _set_up_admin(client)
    await _project(client, "Jacaranda Close", "NGN")
    await _project(client, "Palm Ridge", "NGN")
    await _project(client, "Somewhere Else", "USD")

    summary = await _read(client, "summary")

    assert summary["currencies"] == [
        {"currency_code": "NGN", "currency_exponent": 2, "project_count": 2},
        {"currency_code": "USD", "currency_exponent": 2, "project_count": 1},
    ]
    assert summary["project_count"] == 3


async def test_currency_parameter_filters_every_section(client: AsyncClient) -> None:
    await _set_up_admin(client)
    naira = await _project(client, "Jacaranda Close", "NGN")
    dollars = await _project(client, "Somewhere Else", "USD")
    await _expense(client, naira, amount=40_000_00, description="Cement")
    await _expense(client, dollars, amount=1_000_00, description="Survey")

    summary = await _read(client, "summary", "USD")
    projects = await _read(client, "projects", "USD")
    latest = await _read(client, "latest", "USD")

    assert summary["currency_code"] == "USD"
    assert summary["spent_amount"] == 1_000_00
    assert summary["currency_project_count"] == 1
    assert [row["name"] for row in projects["rows"]] == ["Somewhere Else"]
    assert [row["description"] for row in latest["rows"]] == ["Survey"]


async def test_summary_defaults_to_the_account_base_currency(client: AsyncClient) -> None:
    await _set_up_admin(client)
    await _project(client, "Jacaranda Close", "NGN")
    dollars = await _project(client, "Somewhere Else", "USD")
    await _expense(client, dollars, amount=1_000_00)
    await client.patch("/api/auth/me", json={"base_currency": "USD"})

    summary = await _read(client, "summary")

    assert summary["currency_code"] == "USD"
    assert summary["spent_amount"] == 1_000_00


async def test_unused_currency_falls_back_to_the_first(client: AsyncClient) -> None:
    await _set_up_admin(client)
    await _project(client, "Jacaranda Close", "NGN")

    assert (await _read(client, "summary", "USD"))["currency_code"] == "NGN"


async def test_currency_parameter_is_case_insensitive(client: AsyncClient) -> None:
    await _set_up_admin(client)
    await _project(client, "Jacaranda Close", "NGN")
    await _project(client, "Somewhere Else", "USD")

    assert (await _read(client, "summary", "usd"))["currency_code"] == "USD"


async def test_project_rows_report_budgeted_spent_and_expense_count(client: AsyncClient) -> None:
    await _set_up_admin(client)
    project_id = await _project(client, "Jacaranda Close")
    await _expense(client, project_id, amount=10_000_00)
    await _expense(client, project_id, amount=2_500_00, description="Nails")

    row = (await _read(client, "projects"))["rows"][0]

    assert row["name"] == "Jacaranda Close"
    assert row["spent_amount"] == 12_500_00
    assert row["expense_count"] == 2
    assert row["budgeted_amount"] == 0


async def test_project_without_expenses_reports_zero_spent(client: AsyncClient) -> None:
    await _set_up_admin(client)
    await _project(client, "Jacaranda Close")

    row = (await _read(client, "projects"))["rows"][0]

    assert row["spent_amount"] == 0
    assert row["expense_count"] == 0


async def test_months_are_the_last_eight_with_expenses(client: AsyncClient) -> None:
    await _set_up_admin(client)
    project_id = await _project(client, "Jacaranda Close")
    for month in range(1, 11):
        await _expense(client, project_id, amount=month * 1_000_00, spent_on=f"2026-{month:02d}-05")

    body = await _read(client, "months")

    assert [row["month"] for row in body["months"]] == [f"2026-{m:02d}" for m in range(3, 11)]
    assert body["months"][-1]["amount"] == 10_000_00
    assert body["highest_month"] == "2026-10"
    assert body["currency_code"] == "NGN"


async def test_months_include_only_the_requested_currency(client: AsyncClient) -> None:
    await _set_up_admin(client)
    naira = await _project(client, "Jacaranda Close", "NGN")
    dollars = await _project(client, "Somewhere Else", "USD")
    await _expense(client, naira, amount=40_000_00, spent_on="2026-08-05")
    await _expense(client, dollars, amount=1_000_00, spent_on="2026-08-06")

    body = await _read(client, "months", "USD")

    assert body["months"] == [{"month": "2026-08", "amount": 1_000_00}]


async def test_latest_returns_the_newest_six_expenses(client: AsyncClient) -> None:
    await _set_up_admin(client)
    first = await _project(client, "Jacaranda Close")
    second = await _project(client, "Palm Ridge")
    for day in range(1, 6):
        await _expense(client, first, description=f"First {day}", spent_on=f"2026-08-{day:02d}")
    for day in range(6, 10):
        await _expense(client, second, description=f"Second {day}", spent_on=f"2026-08-{day:02d}")

    rows = (await _read(client, "latest"))["rows"]

    assert len(rows) == 6
    assert rows[0]["description"] == "Second 9"
    assert rows[0]["project_name"] == "Palm Ridge"
    assert [row["spent_on"] for row in rows] == sorted(
        (row["spent_on"] for row in rows), reverse=True
    )


async def test_latest_row_category_name_is_null_when_uncategorised(client: AsyncClient) -> None:
    await _set_up_admin(client)
    project_id = await _project(client, "Jacaranda Close")
    category = (
        await client.post(f"/api/projects/{project_id}/categories", json={"name": "Foundation"})
    ).json()
    await _expense(client, project_id, description="Categorised", category_id=category["id"])
    await _expense(client, project_id, description="Uncategorised")

    latest = (await _read(client, "latest"))["rows"]
    rows = {row["description"]: row["category_name"] for row in latest}

    assert rows["Categorised"] == "Foundation"
    assert rows["Uncategorised"] is None


async def test_uncategorised_alert_spans_projects(client: AsyncClient) -> None:
    await _set_up_admin(client)
    first = await _project(client, "Jacaranda Close")
    second = await _project(client, "Palm Ridge")
    await _expense(client, first, amount=30_000_00)
    await _expense(client, second, amount=23_000_00)

    alert = [a for a in (await _read(client, "summary"))["alerts"] if a["kind"] == "uncategorised"][
        0
    ]

    assert alert["title"] == "Uncategorised Expenses"
    assert alert["detail"] == "2 expenses across 2 projects"
    assert alert["amount"] == 53_000_00
    assert alert["urgent"] is True


async def test_outstanding_deliveries_alert(client: AsyncClient) -> None:
    await _set_up_admin(client)
    project_id = await _project(client, "Jacaranda Close")
    expense = await _expense(client, project_id, amount=76_500_00)
    await client.post(
        f"/api/projects/{project_id}/deliveries",
        json={"expense_id": expense["id"], "description": "17 bags"},
    )

    alert = [a for a in (await _read(client, "summary"))["alerts"] if a["kind"] == "deliveries"][0]

    assert alert["detail"] == "1 paid expense outstanding"
    assert alert["amount"] == 76_500_00
    assert alert["urgent"] is False


async def test_no_alerts_when_nothing_needs_attention(client: AsyncClient) -> None:
    await _set_up_admin(client)
    project_id = await _project(client, "Jacaranda Close")
    category = (
        await client.post(f"/api/projects/{project_id}/categories", json={"name": "Foundation"})
    ).json()
    await _expense(client, project_id, category_id=category["id"])

    assert (await _read(client, "summary"))["alerts"] == []


async def test_alert_counts_only_the_requested_currency(client: AsyncClient) -> None:
    await _set_up_admin(client)
    naira = await _project(client, "Jacaranda Close", "NGN")
    dollars = await _project(client, "Somewhere Else", "USD")
    await _expense(client, naira, amount=30_000_00)
    await _expense(client, dollars, amount=1_000_00)

    alerts = (await _read(client, "summary", "USD"))["alerts"]
    alert = [a for a in alerts if a["kind"] == "uncategorised"][0]

    assert alert["detail"] == "1 expense across 1 project"
    assert alert["amount"] == 1_000_00


async def test_archived_project_is_excluded_from_home(client: AsyncClient) -> None:
    await _set_up_admin(client)
    active_project = await _project(client, "Jacaranda Close")
    archived_project = await _project(client, "Palm Ridge")
    await _expense(client, active_project, amount=10_000_00)
    await _expense(client, archived_project, amount=99_000_00)
    await client.patch(f"/api/projects/{archived_project}", json={"status": "closed"})
    await client.post(f"/api/projects/{archived_project}/archive")

    summary = await _read(client, "summary")

    assert summary["project_count"] == 1
    assert summary["spent_amount"] == 10_000_00
    assert summary["alerts"][0]["detail"] == "1 expense across 1 project"
    assert [row["name"] for row in (await _read(client, "projects"))["rows"]] == ["Jacaranda Close"]
    assert [row["project_name"] for row in (await _read(client, "latest"))["rows"]] == [
        "Jacaranda Close"
    ]
