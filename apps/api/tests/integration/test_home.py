import pytest
from httpx import AsyncClient

from setout.currencies import CURRENCIES
from setout.models.currency import Currency

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def _signed_in(client: AsyncClient) -> None:
    wanted = ("NGN", "USD")
    await Currency.bulk_create(
        [Currency(code=c[0], name=c[1], exponent=c[2]) for c in CURRENCIES if c[0] in wanted]
    )
    await client.post("/api/auth/setup", json={"name": "Admin", "password": "password123"})


async def _project(client: AsyncClient, name: str, currency: str = "NGN") -> str:
    resp = await client.post("/api/projects", json={"name": name, "currency_code": currency})
    return str(resp.json()["id"])


async def _spend(client: AsyncClient, project_id: str, **body: object) -> dict:
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


async def test_a_fresh_install_has_nothing_to_show(client: AsyncClient) -> None:
    await _signed_in(client)

    summary = await _read(client, "summary")

    assert summary["projects"] == 0
    assert summary["currencies"] == []
    assert summary["currency_code"] is None
    assert summary["planned_amount"] == 0
    assert summary["alerts"] == []
    assert (await _read(client, "months"))["months"] == []
    assert (await _read(client, "projects"))["rows"] == []
    assert (await _read(client, "latest"))["rows"] == []


async def test_it_totals_every_project_that_shares_a_currency(client: AsyncClient) -> None:
    await _signed_in(client)
    first = await _project(client, "Jacaranda Close")
    second = await _project(client, "Palm Ridge")
    scope = (await client.post(f"/api/projects/{first}/scopes", json={"name": "Foundation"})).json()
    await client.post(
        f"/api/scopes/{scope['id']}/budget-items",
        json={"description": "Sand", "planned_amount": 100_000_00},
    )
    await _spend(client, first, amount=40_000_00, scope_id=scope["id"])
    await _spend(client, second, amount=5_000_00)

    summary = await _read(client, "summary")

    assert summary["projects"] == 2
    assert summary["currency_code"] == "NGN"
    assert summary["currency_exponent"] == 2
    assert summary["currency_projects"] == 2
    assert summary["planned_amount"] == 100_000_00
    assert summary["spent_amount"] == 45_000_00


async def test_it_lists_every_currency_in_use_with_its_project_count(client: AsyncClient) -> None:
    await _signed_in(client)
    await _project(client, "Jacaranda Close", "NGN")
    await _project(client, "Palm Ridge", "NGN")
    await _project(client, "Somewhere Else", "USD")

    summary = await _read(client, "summary")

    assert summary["currencies"] == [
        {"currency_code": "NGN", "currency_exponent": 2, "projects": 2},
        {"currency_code": "USD", "currency_exponent": 2, "projects": 1},
    ]
    assert summary["projects"] == 3


async def test_asking_for_a_currency_scopes_the_whole_screen(client: AsyncClient) -> None:
    await _signed_in(client)
    naira = await _project(client, "Jacaranda Close", "NGN")
    dollars = await _project(client, "Somewhere Else", "USD")
    await _spend(client, naira, amount=40_000_00, description="Cement")
    await _spend(client, dollars, amount=1_000_00, description="Survey")

    summary = await _read(client, "summary", "USD")
    projects = await _read(client, "projects", "USD")
    latest = await _read(client, "latest", "USD")

    assert summary["currency_code"] == "USD"
    assert summary["spent_amount"] == 1_000_00
    assert summary["currency_projects"] == 1
    assert [row["name"] for row in projects["rows"]] == ["Somewhere Else"]
    assert [row["description"] for row in latest["rows"]] == ["Survey"]


async def test_it_opens_on_the_currency_the_account_chose(client: AsyncClient) -> None:
    await _signed_in(client)
    await _project(client, "Jacaranda Close", "NGN")
    dollars = await _project(client, "Somewhere Else", "USD")
    await _spend(client, dollars, amount=1_000_00)
    await client.patch("/api/auth/me", json={"base_currency": "USD"})

    summary = await _read(client, "summary")

    assert summary["currency_code"] == "USD"
    assert summary["spent_amount"] == 1_000_00


async def test_a_currency_nothing_is_kept_in_falls_back_to_the_first(client: AsyncClient) -> None:
    await _signed_in(client)
    await _project(client, "Jacaranda Close", "NGN")

    assert (await _read(client, "summary", "USD"))["currency_code"] == "NGN"


async def test_a_currency_is_read_however_it_is_typed(client: AsyncClient) -> None:
    await _signed_in(client)
    await _project(client, "Jacaranda Close", "NGN")
    await _project(client, "Somewhere Else", "USD")

    assert (await _read(client, "summary", "usd"))["currency_code"] == "USD"


async def test_each_project_says_what_it_planned_spent_and_holds(client: AsyncClient) -> None:
    await _signed_in(client)
    project_id = await _project(client, "Jacaranda Close")
    await _spend(client, project_id, amount=10_000_00)
    await _spend(client, project_id, amount=2_500_00, description="Nails")

    row = (await _read(client, "projects"))["rows"][0]

    assert row["name"] == "Jacaranda Close"
    assert row["spent_amount"] == 12_500_00
    assert row["expense_count"] == 2
    assert row["planned_amount"] == 0


async def test_a_project_with_no_spend_still_reads_as_nothing_spent(client: AsyncClient) -> None:
    await _signed_in(client)
    await _project(client, "Jacaranda Close")

    row = (await _read(client, "projects"))["rows"][0]

    assert row["spent_amount"] == 0
    assert row["expense_count"] == 0


async def test_the_months_are_the_last_eight_with_spending_in_them(client: AsyncClient) -> None:
    await _signed_in(client)
    project_id = await _project(client, "Jacaranda Close")
    for month in range(1, 11):
        await _spend(client, project_id, amount=month * 1_000_00, spent_on=f"2026-{month:02d}-05")

    body = await _read(client, "months")

    assert [row["month"] for row in body["months"]] == [f"2026-{m:02d}" for m in range(3, 11)]
    assert body["months"][-1]["amount"] == 10_000_00
    assert body["busiest_month"] == "2026-10"
    assert body["currency_code"] == "NGN"


async def test_the_months_hold_only_the_currency_asked_for(client: AsyncClient) -> None:
    await _signed_in(client)
    naira = await _project(client, "Jacaranda Close", "NGN")
    dollars = await _project(client, "Somewhere Else", "USD")
    await _spend(client, naira, amount=40_000_00, spent_on="2026-08-05")
    await _spend(client, dollars, amount=1_000_00, spent_on="2026-08-06")

    body = await _read(client, "months", "USD")

    assert body["months"] == [{"month": "2026-08", "amount": 1_000_00}]


async def test_the_latest_spend_is_the_newest_six(client: AsyncClient) -> None:
    await _signed_in(client)
    first = await _project(client, "Jacaranda Close")
    second = await _project(client, "Palm Ridge")
    for day in range(1, 6):
        await _spend(client, first, description=f"First {day}", spent_on=f"2026-08-{day:02d}")
    for day in range(6, 10):
        await _spend(client, second, description=f"Second {day}", spent_on=f"2026-08-{day:02d}")

    rows = (await _read(client, "latest"))["rows"]

    assert len(rows) == 6
    assert rows[0]["description"] == "Second 9"
    assert rows[0]["project_name"] == "Palm Ridge"
    assert [row["spent_on"] for row in rows] == sorted(
        (row["spent_on"] for row in rows), reverse=True
    )


async def test_a_latest_row_names_the_scope_or_says_there_is_none(client: AsyncClient) -> None:
    await _signed_in(client)
    project_id = await _project(client, "Jacaranda Close")
    scope = (
        await client.post(f"/api/projects/{project_id}/scopes", json={"name": "Foundation"})
    ).json()
    await _spend(client, project_id, description="Filed", scope_id=scope["id"])
    await _spend(client, project_id, description="Unfiled")

    latest = (await _read(client, "latest"))["rows"]
    rows = {row["description"]: row["scope_name"] for row in latest}

    assert rows["Filed"] == "Foundation"
    assert rows["Unfiled"] is None


async def test_it_names_spend_with_no_scope_across_projects(client: AsyncClient) -> None:
    await _signed_in(client)
    first = await _project(client, "Jacaranda Close")
    second = await _project(client, "Palm Ridge")
    await _spend(client, first, amount=30_000_00)
    await _spend(client, second, amount=23_000_00)

    alert = [a for a in (await _read(client, "summary"))["alerts"] if a["kind"] == "unfiled"][0]

    assert alert["title"] == "Spend with no scope"
    assert alert["detail"] == "2 receipts across 2 projects"
    assert alert["amount"] == 53_000_00
    assert alert["urgent"] is True


async def test_it_names_what_is_paid_for_and_not_delivered(client: AsyncClient) -> None:
    await _signed_in(client)
    project_id = await _project(client, "Jacaranda Close")
    spend = await _spend(client, project_id, amount=76_500_00)
    await client.post(
        f"/api/projects/{project_id}/deliveries",
        json={"expense_id": spend["id"], "description": "17 bags"},
    )

    alert = [a for a in (await _read(client, "summary"))["alerts"] if a["kind"] == "deliveries"][0]

    assert alert["detail"] == "1 thing owed by a vendor"
    assert alert["amount"] == 76_500_00
    assert alert["urgent"] is False


async def test_nothing_wrong_means_nothing_to_say(client: AsyncClient) -> None:
    await _signed_in(client)
    project_id = await _project(client, "Jacaranda Close")
    scope = (
        await client.post(f"/api/projects/{project_id}/scopes", json={"name": "Foundation"})
    ).json()
    await _spend(client, project_id, scope_id=scope["id"])

    assert (await _read(client, "summary"))["alerts"] == []


async def test_an_alert_counts_only_the_currency_it_is_read_in(client: AsyncClient) -> None:
    await _signed_in(client)
    naira = await _project(client, "Jacaranda Close", "NGN")
    dollars = await _project(client, "Somewhere Else", "USD")
    await _spend(client, naira, amount=30_000_00)
    await _spend(client, dollars, amount=1_000_00)

    alerts = (await _read(client, "summary", "USD"))["alerts"]
    alert = [a for a in alerts if a["kind"] == "unfiled"][0]

    assert alert["detail"] == "1 receipt across 1 project"
    assert alert["amount"] == 1_000_00


async def test_a_deleted_project_is_left_out_of_everything(client: AsyncClient) -> None:
    await _signed_in(client)
    kept = await _project(client, "Jacaranda Close")
    gone = await _project(client, "Palm Ridge")
    await _spend(client, kept, amount=10_000_00)
    await _spend(client, gone, amount=99_000_00)
    await client.patch(f"/api/projects/{gone}", json={"status": "archived"})
    await client.delete(f"/api/projects/{gone}")

    summary = await _read(client, "summary")

    assert summary["projects"] == 1
    assert summary["spent_amount"] == 10_000_00
    assert summary["alerts"][0]["detail"] == "1 receipt across 1 project"
    assert [row["name"] for row in (await _read(client, "projects"))["rows"]] == ["Jacaranda Close"]
    assert [row["project_name"] for row in (await _read(client, "latest"))["rows"]] == [
        "Jacaranda Close"
    ]
