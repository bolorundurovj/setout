from __future__ import annotations

import io

import pytest
from httpx import AsyncClient
from openpyxl import Workbook

from setout.currencies import CURRENCIES
from setout.models.currency import Currency
from setout.services.sheets.write import XLSX_TYPE as XLSX

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]

BUDGET_HEAD = ["Cost Codes", "Activities", "Labor Costs", "Material Costs", "Fixed Costs", "Budget"]
SPEND_HEAD = [
    "Invoice No.",
    "Subcontractors & Vendors",
    "Cost Code",
    "Date Invoiced",
    "Total Cost",
    "Documents",
    "Purchased By",
    "Paid",
    "Date Paid",
    "Notes",
]
VENDOR_HEAD = ["Company Name", "Photo", "Trade", "Point of Contact", "Phone", "Email", "Notes"]


def book(**sheets: list[list[object]]) -> bytes:
    wb = Workbook()
    wb.remove(wb.active)
    for name, rows in sheets.items():
        ws = wb.create_sheet(title=name.replace("_", " "))
        ws.append(["A title"])
        for row in rows:
            ws.append(row)
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def sample() -> bytes:
    return book(
        Budget=[
            BUDGET_HEAD,
            ["1000", "Administrative Expenses", "", "", "", 68500],
            ["1001", "Beacons", "", 1000, "", 1000],
            ["1002", "Drawings", "", "", 20000, 20000],
            ["3000", "Concrete Foundation", "", "", "", 0],
            ["3001", "Pegging", 37500, "", "", 37500],
        ],
        Vendors=[
            VENDOR_HEAD,
            ["Bright Star Aluminium", "", "Roofing", "Mr Sola", "0800 000 0001", "a@b.com", ""],
        ],
        Invoices=[
            SPEND_HEAD,
            [3835, "Bright Star Aluminium", 3001, 44691, 500000, "", "Ayo", 1, 44691, "@4200"],
        ],
    )


async def setup(client: AsyncClient) -> None:
    await Currency.bulk_create(
        [Currency(code=c[0], name=c[1], exponent=c[2]) for c in CURRENCIES if c[0] == "NGN"]
    )
    await client.post("/api/auth/setup", json={"name": "Admin", "password": "password123"})


async def preview(client: AsyncClient, data: bytes, **form: object) -> dict:
    name = "sheet.csv" if data[:2] != b"PK" else "sheet.xlsx"
    resp = await client.post(
        "/api/import/preview",
        files={"file": (name, data, "application/vnd.ms-excel")},
        data={"name": "Jacaranda Close", "currency_code": "NGN"} | form,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def run(client: AsyncClient, data: bytes, **form: object) -> dict:
    name = "sheet.csv" if data[:2] != b"PK" else "sheet.xlsx"
    resp = await client.post(
        "/api/import",
        files={"file": (name, data, "application/vnd.ms-excel")},
        data={"name": "Jacaranda Close", "currency_code": "NGN"} | form,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_import_requires_authentication(client: AsyncClient) -> None:
    resp = await client.post("/api/import/preview", files={"file": ("a.csv", b"x", "text/csv")})
    assert resp.status_code == 401


async def test_the_report_says_what_the_file_holds(client: AsyncClient) -> None:
    await setup(client)

    body = await preview(client, sample())

    assert {s["holds"] for s in body["read"]} == {"budget", "vendors", "expenses"}
    assert body["planned_amount"] == 58_500_00
    assert body["planned_lines"] == 3
    assert body["spend_rows"] == 1
    assert body["spend_amount"] == 500_000_00
    assert body["vendors_new"] == 1


async def test_looking_at_a_file_writes_nothing(client: AsyncClient) -> None:
    await setup(client)

    await preview(client, sample())

    assert (await client.get("/api/projects")).json()["total"] == 0
    assert (await client.get("/api/vendors")).json()["total"] == 0


async def test_the_scope_heading_total_is_not_counted_twice(client: AsyncClient) -> None:
    await setup(client)

    body = await run(client, sample())

    # 68,500 heads the admin scope and 58,500 is the sum of the three lines.
    assert body["planned_amount"] == 58_500_00
    assert body["scopes"] == 2
    assert body["budget_items"] == 3


async def test_it_brings_in_the_plan_the_spend_and_the_vendors(client: AsyncClient) -> None:
    await setup(client)

    body = await run(client, sample())
    project_id = body["project_id"]

    spend = (await client.get(f"/api/projects/{project_id}/spend")).json()
    assert spend["planned_amount"] == 58_500_00
    assert spend["spent_amount"] == 500_000_00

    scopes = (await client.get(f"/api/projects/{project_id}/scopes")).json()
    assert {s["code"] for s in scopes} == {"1000", "3000"}

    vendor = (await client.get("/api/vendors")).json()["items"][0]
    assert vendor["name"] == "Bright Star Aluminium"
    assert vendor["email"] == "a@b.com"


async def test_the_spend_lands_against_the_scope_its_cost_code_names(client: AsyncClient) -> None:
    await setup(client)

    project_id = (await run(client, sample()))["project_id"]

    scopes = (await client.get(f"/api/projects/{project_id}/scopes")).json()
    foundation = next(s for s in scopes if s["code"] == "3000")
    assert foundation["spent_amount"] == 500_000_00


async def test_a_second_run_does_not_double_the_spend(client: AsyncClient) -> None:
    await setup(client)
    project_id = (await run(client, sample()))["project_id"]

    again = await run(client, sample(), project_id=project_id)

    assert again["skipped_duplicates"] == 1
    assert again["expenses"] == 0
    spend = (await client.get(f"/api/projects/{project_id}/spend")).json()
    assert spend["spent_amount"] == 500_000_00


async def test_a_sheet_of_spending_can_never_write_a_budget(client: AsyncClient) -> None:
    await setup(client)
    only_spend = book(
        Invoices=[
            SPEND_HEAD,
            [1, "Someone", 1001, 44691, 900000, "", "Me", 1, 44691, "should not become a plan"],
        ]
    )

    body = await run(client, only_spend)

    assert body["spend_amount"] == 900_000_00
    assert body["planned_amount"] == 0
    assert body["budget_items"] == 0


async def test_a_plan_sheet_records_no_spending(client: AsyncClient) -> None:
    await setup(client)
    only_plan = book(
        Budget=[BUDGET_HEAD, ["1000", "Admin", "", "", "", 0], ["1001", "Rent", "", "", "", 500]]
    )

    body = await run(client, only_plan)

    assert body["planned_amount"] == 500_00
    assert body["expenses"] == 0
    assert body["spend_amount"] == 0


async def test_the_template_sheet_a_workbook_carries_is_left_out(client: AsyncClient) -> None:
    await setup(client)
    with_template = book(
        Budget=[BUDGET_HEAD, ["1000", "Admin", "", "", "", 0], ["1001", "Real", "", "", "", 500]],
        Budget___Base=[
            BUDGET_HEAD,
            ["1000", "Example", "", "", "", 0],
            ["1001", "Fake", "", "", "", 99999],
        ],
    )

    body = await preview(client, with_template)

    assert body["planned_amount"] == 500_00
    assert any("Base" in s["name"] for s in body["skipped"])


async def test_a_file_that_is_not_a_spreadsheet_is_refused(client: AsyncClient) -> None:
    await setup(client)

    resp = await client.post(
        "/api/import/preview",
        files={"file": ("notes.xlsx", b"not a spreadsheet at all", "application/vnd.ms-excel")},
        data={"name": "X", "currency_code": "NGN"},
    )

    assert resp.status_code == 422


async def test_a_new_project_needs_a_name_and_a_currency(client: AsyncClient) -> None:
    await setup(client)

    nameless = await client.post(
        "/api/import/preview",
        files={"file": ("s.xlsx", sample(), "application/vnd.ms-excel")},
        data={"currency_code": "NGN"},
    )
    assert nameless.status_code == 422

    unknown = await client.post(
        "/api/import/preview",
        files={"file": ("s.xlsx", sample(), "application/vnd.ms-excel")},
        data={"name": "X", "currency_code": "ZZZ"},
    )
    assert unknown.status_code == 422


async def test_the_vendor_count_is_vendors_not_lookup_names(client: AsyncClient) -> None:
    await setup(client)

    body = await run(client, sample())

    # One vendor, whose contact also answers to their name when spend is matched.
    assert body["vendors"] == 1
    assert (await client.get("/api/vendors")).json()["total"] == 1


async def test_a_person_comes_from_who_bought_it(client: AsyncClient) -> None:
    await setup(client)

    body = await run(client, sample())

    assert body["people"] == 1
    assert (await client.get("/api/people")).json()["items"][0]["name"] == "Ayo"


async def test_a_csv_of_one_sheet_is_read_too(client: AsyncClient) -> None:
    await setup(client)
    csv = b"Cost Codes,Activities,Labor Costs,Material Costs,Fixed Costs,Budget\n"
    csv += b"1000,Admin,,,,0\n1001,Beacons,,1000,,1000\n"

    resp = await client.post(
        "/api/import",
        files={"file": ("plan.csv", csv, "text/csv")},
        data={"name": "From a csv", "currency_code": "NGN"},
    )

    assert resp.status_code == 201, resp.text
    assert resp.json()["planned_amount"] == 1_000_00


async def test_the_report_shows_the_first_rows_as_they_would_be_filed(
    client: AsyncClient,
) -> None:
    await setup(client)

    body = await preview(client, sample())

    assert len(body["sample"]) == 1
    row = body["sample"][0]
    assert row["description"] == "Bright Star Aluminium invoice 3835"
    assert row["scope"] == "Concrete Foundation"
    assert row["amount"] == 500_000_00
    assert row["spent_on"] == "2022-05-10"


async def _project_with(client: AsyncClient) -> dict:
    """A project imported from the sample, so there is something to export."""
    await setup(client)
    return await run(client, sample())


async def test_a_project_comes_back_out_as_a_workbook(client: AsyncClient) -> None:
    made = await _project_with(client)

    resp = await client.get(f"/api/projects/{made['project_id']}/export")

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith(XLSX)
    assert ".xlsx" in resp.headers["content-disposition"]
    assert resp.content[:2] == b"PK"


async def test_exporting_a_project_that_is_not_there_says_so(client: AsyncClient) -> None:
    await setup(client)
    assert (await client.get("/api/projects/nope/export")).status_code == 404


async def test_what_comes_out_goes_back_in_with_the_same_totals(client: AsyncClient) -> None:
    made = await _project_with(client)
    before = (await client.get(f"/api/projects/{made['project_id']}/spend")).json()

    book = (await client.get(f"/api/projects/{made['project_id']}/export")).content
    again = await run(client, book, name="Round trip")

    after = (await client.get(f"/api/projects/{again['project_id']}/spend")).json()
    assert after["planned_amount"] == before["planned_amount"]
    assert after["spent_amount"] == before["spent_amount"]
    assert again["scopes"] == made["scopes"]
    assert again["budget_items"] == made["budget_items"]


async def test_the_workbook_says_what_each_expense_was_for(client: AsyncClient) -> None:
    made = await _project_with(client)

    book = (await client.get(f"/api/projects/{made['project_id']}/export")).content
    again = await run(client, book, name="Round trip")

    listing = (await client.get(f"/api/projects/{again['project_id']}/expenses")).json()
    # Without a description column the reader would name rows after the vendor.
    assert [row["description"] for row in listing["items"]] == [
        "Bright Star Aluminium invoice 3835"
    ]


async def test_the_spending_lands_under_the_same_scope_it_came_from(client: AsyncClient) -> None:
    await setup(client)
    made = await run(
        client,
        book(
            Budget=[
                BUDGET_HEAD,
                ["3000", "Concrete Foundation", "", "", "", 0],
                ["3001", "Pegging", "", "", 37500, 37500],
            ],
            Invoices=[
                SPEND_HEAD,
                [11, "Bright Star Aluminium", 3001, 44691, 500000, "", "Ayo", 1, 44691, ""],
            ],
        ),
    )

    filed = (await client.get(f"/api/projects/{made['project_id']}/expenses")).json()["items"][0]
    assert filed["scope_id"] is not None

    round_trip = await run(
        client,
        (await client.get(f"/api/projects/{made['project_id']}/export")).content,
        name="Round trip",
    )
    landed = (await client.get(f"/api/projects/{round_trip['project_id']}/expenses")).json()
    assert landed["items"][0]["scope_id"] is not None


async def test_a_blank_sheet_can_be_had_to_start_from(client: AsyncClient) -> None:
    await setup(client)

    resp = await client.get("/api/import/sample")

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith(XLSX)
    assert "setout-blank-sheet.xlsx" in resp.headers["content-disposition"]


async def test_the_blank_sheet_reads_back_as_nothing_rather_than_as_junk(
    client: AsyncClient,
) -> None:
    await setup(client)
    blank = (await client.get("/api/import/sample?kind=blank")).content

    report = await preview(client, blank)

    assert {s["holds"] for s in report["read"]} == {
        "budget",
        "vendors",
        "expenses",
        "outstanding",
    }
    assert report["planned_amount"] == 0
    assert report["spend_rows"] == 0
    assert report["decisions"] == []


async def test_the_plan_keeps_which_of_the_three_a_figure_was_under(client: AsyncClient) -> None:
    await setup(client)
    made = await run(
        client,
        book(
            Budget=[
                BUDGET_HEAD,
                ["3000", "Concrete Foundation", "", "", "", 0],
                ["3001", "Pegging", 37500, "", "", 37500],
                ["3002", "Cement", "", 12000, "", 12000],
                ["3003", "Permit", "", "", 5000, 5000],
            ]
        ),
    )

    scopes = (await client.get(f"/api/projects/{made['project_id']}/scopes")).json()
    lines = (await client.get(f"/api/scopes/{scopes[0]['id']}/budget-items")).json()["items"]

    assert {line["description"]: line["cost_type"] for line in lines} == {
        "Pegging": "labour",
        "Cement": "material",
        "Permit": "fixed",
    }


async def test_the_three_columns_survive_the_round_trip(client: AsyncClient) -> None:
    await setup(client)
    made = await run(
        client,
        book(
            Budget=[
                BUDGET_HEAD,
                ["3000", "Concrete Foundation", "", "", "", 0],
                ["3001", "Pegging", 37500, "", "", 37500],
                ["3002", "Cement", "", 12000, "", 12000],
            ]
        ),
    )

    again = await run(
        client,
        (await client.get(f"/api/projects/{made['project_id']}/export")).content,
        name="Round trip",
    )

    scopes = (await client.get(f"/api/projects/{again['project_id']}/scopes")).json()
    lines = (await client.get(f"/api/scopes/{scopes[0]['id']}/budget-items")).json()["items"]
    assert {line["description"]: line["cost_type"] for line in lines} == {
        "Pegging": "labour",
        "Cement": "material",
    }


@pytest.mark.parametrize(
    ("kind", "filename"),
    [
        ("blank", "setout-blank-sheet.xlsx"),
        ("example", "setout-example-sheet.xlsx"),
        ("budget-csv", "setout-budget-example.csv"),
        ("spending-csv", "setout-spending-example.csv"),
    ],
)
async def test_every_sample_can_be_had_and_names_itself(
    client: AsyncClient, kind: str, filename: str
) -> None:
    await setup(client)

    resp = await client.get(f"/api/import/sample?kind={kind}")

    assert resp.status_code == 200
    assert filename in resp.headers["content-disposition"]


async def test_a_sample_nobody_asked_for_is_refused(client: AsyncClient) -> None:
    await setup(client)
    assert (await client.get("/api/import/sample?kind=whatever")).status_code == 422


async def test_the_filled_example_brings_in_what_it_shows(client: AsyncClient) -> None:
    await setup(client)
    filled = (await client.get("/api/import/sample?kind=example")).content

    # It names its own currency, so nothing has to be chosen for it.
    made = await run(client, filled, name="From the example", currency_code="")

    assert made["scopes"] == 2
    assert made["budget_items"] == 4
    assert made["planned_amount"] == 780_000_00
    assert made["expenses"] == 3
    assert made["spend_amount"] == 144_900_00
    assert made["vendors"] == 2


async def test_a_csv_sample_holds_the_one_sheet_a_csv_can(client: AsyncClient) -> None:
    await setup(client)
    budget_only = (await client.get("/api/import/sample?kind=budget-csv")).content

    report = await preview(client, budget_only)

    assert [s["holds"] for s in report["read"]] == ["budget"]
    assert report["planned_amount"] == 780_000_00
    assert report["spend_rows"] == 0


async def test_the_workbook_says_what_currency_its_figures_are(client: AsyncClient) -> None:
    made = await _project_with(client)

    book = (await client.get(f"/api/projects/{made['project_id']}/export")).content
    again = await run(client, book, name="No currency chosen", currency_code="")

    assert (await client.get(f"/api/projects/{again['project_id']}")).json()[
        "currency_code"
    ] == "NGN"


async def test_a_sheet_that_names_no_currency_asks_for_one(client: AsyncClient) -> None:
    await setup(client)

    resp = await client.post(
        "/api/import/preview",
        files={"file": ("sheet.xlsx", sample(), "application/vnd.ms-excel")},
        data={"name": "Nameless", "currency_code": ""},
    )

    assert resp.status_code == 422
    assert "does not say what currency" in resp.json()["detail"]


async def test_importing_the_same_sheet_twice_says_how_many_scopes_there_are(
    client: AsyncClient,
) -> None:
    await setup(client)
    first = await run(client, sample())

    again = await run(client, sample(), project_id=first["project_id"])

    scopes = (await client.get(f"/api/projects/{first['project_id']}/scopes")).json()
    assert first["scopes"] == len(scopes)
    assert again["scopes"] == len(scopes)


async def test_what_has_arrived_survives_being_exported_and_read_again(
    client: AsyncClient,
) -> None:
    await setup(client)
    made = await run(client, sample())
    spend = (await client.get(f"/api/projects/{made['project_id']}/expenses")).json()["items"][0]
    owed = await client.post(
        f"/api/projects/{made['project_id']}/deliveries",
        json={"expense_id": spend["id"], "description": "20 rods"},
    )

    waiting = await preview(
        client,
        (await client.get(f"/api/projects/{made['project_id']}/export")).content,
        name="Still waiting",
        currency_code="",
    )
    assert waiting["owed_rows"] == 1
    assert "owed_not_importable" in [d["kind"] for d in waiting["decisions"]]

    await client.post(f"/api/deliveries/{owed.json()['id']}/received")

    arrived = await preview(
        client,
        (await client.get(f"/api/projects/{made['project_id']}/export")).content,
        name="Arrived",
        currency_code="",
    )
    assert arrived["owed_rows"] == 0
    assert "owed_not_importable" not in [d["kind"] for d in arrived["decisions"]]


async def test_a_sheet_past_the_limit_is_refused_before_it_is_read(
    client: AsyncClient, monkeypatch
) -> None:
    from setout.config import get_settings

    monkeypatch.setattr(get_settings(), "max_import_bytes", 1024)
    await setup(client)

    resp = await client.post(
        "/api/import/preview",
        files={"file": ("big.csv", b"x" * 2048, "text/csv")},
        data={"name": "Too big", "currency_code": "NGN"},
    )

    assert resp.status_code == 413
    assert "larger than" in resp.json()["detail"]
    assert (await client.get("/api/projects")).json()["total"] == 0
