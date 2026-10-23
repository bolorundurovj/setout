from __future__ import annotations

import io

import pytest
from httpx import AsyncClient
from openpyxl import Workbook

from setout.currencies import CURRENCIES
from setout.models.currency import Currency
from setout.services.sheets.write import XLSX_TYPE as XLSX

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]

BUDGET_HEADERS = [
    "Cost Code",
    "Description",
    "Labour Costs",
    "Material Costs",
    "Fixed Costs",
    "Budget",
]
OLD_BUDGET_HEADERS = [
    "Cost Codes",
    "Activities",
    "Labor Costs",
    "Material Costs",
    "Fixed Costs",
    "Budget",
]
EXPENSE_HEADERS = [
    "Invoice No.",
    "Subcontractors & Vendors",
    "Cost Code",
    "Date Invoiced",
    "Amount",
    "Attachment",
    "Paid By",
    "Paid",
    "Date Paid",
    "Notes",
]
OLD_EXPENSE_HEADERS = [
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
VENDOR_HEADERS = ["Company Name", "Photo", "Trade", "Point of Contact", "Phone", "Email", "Notes"]


def workbook(**sheets: list[list[object]]) -> bytes:
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


def sample_workbook() -> bytes:
    return workbook(
        Budget=[
            BUDGET_HEADERS,
            ["1000", "Administrative Expenses", "", "", "", 68500],
            ["1001", "Beacons", "", 1000, "", 1000],
            ["1002", "Drawings", "", "", 20000, 20000],
            ["3000", "Concrete Foundation", "", "", "", 0],
            ["3001", "Pegging", 37500, "", "", 37500],
        ],
        Vendors=[
            VENDOR_HEADERS,
            ["Bright Star Aluminium", "", "Roofing", "Mr Sola", "0800 000 0001", "a@b.com", ""],
        ],
        Invoices=[
            EXPENSE_HEADERS,
            [3835, "Bright Star Aluminium", 3001, 44691, 500000, "", "Ayo", 1, 44691, "@4200"],
        ],
    )


async def set_up_admin(client: AsyncClient) -> None:
    await Currency.bulk_create(
        [Currency(code=c[0], name=c[1], exponent=c[2]) for c in CURRENCIES if c[0] == "NGN"]
    )
    await client.post("/api/auth/setup", json={"name": "Admin", "passphrase": "password123"})


async def preview_import(client: AsyncClient, data: bytes, **form: object) -> dict:
    name = "sheet.csv" if data[:2] != b"PK" else "sheet.xlsx"
    resp = await client.post(
        "/api/import/preview",
        files={"file": (name, data, "application/vnd.ms-excel")},
        data={"name": "Jacaranda Close", "currency_code": "NGN"} | form,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def run_import(client: AsyncClient, data: bytes, **form: object) -> dict:
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


async def test_preview_reports_sheet_contents_and_totals(client: AsyncClient) -> None:
    await set_up_admin(client)

    body = await preview_import(client, sample_workbook())

    assert {s["holds"] for s in body["read"]} == {"budget", "vendors", "expenses"}
    assert body["budgeted_amount"] == 58_500_00
    assert body["budgeted_lines"] == 3
    assert body["expense_rows"] == 1
    assert body["spent_amount"] == 500_000_00
    assert body["vendors_new"] == 1


async def test_preview_writes_nothing(client: AsyncClient) -> None:
    await set_up_admin(client)

    await preview_import(client, sample_workbook())

    assert (await client.get("/api/projects")).json()["total"] == 0
    assert (await client.get("/api/vendors")).json()["total"] == 0


async def test_category_subtotal_row_is_not_counted_twice(client: AsyncClient) -> None:
    await set_up_admin(client)

    body = await run_import(client, sample_workbook())

    # 68,500 is the category subtotal row; the three items sum to 58,500.
    assert body["budgeted_amount"] == 58_500_00
    assert body["category_count"] == 2
    assert body["budget_item_count"] == 3


async def test_import_creates_budget_expenses_and_vendors(client: AsyncClient) -> None:
    await set_up_admin(client)

    body = await run_import(client, sample_workbook())
    project_id = body["project_id"]

    summary = (await client.get(f"/api/projects/{project_id}/expense-summary")).json()
    assert summary["budgeted_amount"] == 58_500_00
    assert summary["spent_amount"] == 500_000_00

    categories = (await client.get(f"/api/projects/{project_id}/categories")).json()
    assert {s["code"] for s in categories} == {"1000", "3000"}

    vendor = (await client.get("/api/vendors")).json()["items"][0]
    assert vendor["name"] == "Bright Star Aluminium"
    assert vendor["email"] == "a@b.com"


async def test_expense_category_follows_its_cost_code(
    client: AsyncClient,
) -> None:
    await set_up_admin(client)

    project_id = (await run_import(client, sample_workbook()))["project_id"]

    categories = (await client.get(f"/api/projects/{project_id}/categories")).json()
    foundation = next(s for s in categories if s["code"] == "3000")
    assert foundation["spent_amount"] == 500_000_00


async def test_reimport_skips_duplicate_expenses(client: AsyncClient) -> None:
    await set_up_admin(client)
    project_id = (await run_import(client, sample_workbook()))["project_id"]

    again = await run_import(client, sample_workbook(), project_id=project_id)

    assert again["skipped_duplicates"] == 1
    assert again["expense_count"] == 0
    summary = (await client.get(f"/api/projects/{project_id}/expense-summary")).json()
    assert summary["spent_amount"] == 500_000_00


async def test_expense_sheet_creates_no_budget(client: AsyncClient) -> None:
    await set_up_admin(client)
    expenses_only = workbook(
        Invoices=[
            EXPENSE_HEADERS,
            [1, "Someone", 1001, 44691, 900000, "", "Me", 1, 44691, "should not become a budget"],
        ]
    )

    body = await run_import(client, expenses_only)

    assert body["spent_amount"] == 900_000_00
    assert body["budgeted_amount"] == 0
    assert body["budget_item_count"] == 0


async def test_budget_sheet_creates_no_expenses(client: AsyncClient) -> None:
    await set_up_admin(client)
    budget_only_workbook = workbook(
        Budget=[BUDGET_HEADERS, ["1000", "Admin", "", "", "", 0], ["1001", "Rent", "", "", "", 500]]
    )

    body = await run_import(client, budget_only_workbook)

    assert body["budgeted_amount"] == 500_00
    assert body["expense_count"] == 0
    assert body["spent_amount"] == 0


async def test_template_sheet_is_skipped(client: AsyncClient) -> None:
    await set_up_admin(client)
    with_template = workbook(
        Budget=[
            BUDGET_HEADERS,
            ["1000", "Admin", "", "", "", 0],
            ["1001", "Real", "", "", "", 500],
        ],
        Budget___Base=[
            BUDGET_HEADERS,
            ["1000", "Example", "", "", "", 0],
            ["1001", "Fake", "", "", "", 99999],
        ],
    )

    body = await preview_import(client, with_template)

    assert body["budgeted_amount"] == 500_00
    assert any("Base" in s["name"] for s in body["skipped"])


async def test_non_spreadsheet_file_is_rejected(client: AsyncClient) -> None:
    await set_up_admin(client)

    resp = await client.post(
        "/api/import/preview",
        files={"file": ("notes.xlsx", b"not a spreadsheet at all", "application/vnd.ms-excel")},
        data={"name": "X", "currency_code": "NGN"},
    )

    assert resp.status_code == 422


async def test_new_project_requires_name_and_known_currency(client: AsyncClient) -> None:
    await set_up_admin(client)

    nameless = await client.post(
        "/api/import/preview",
        files={"file": ("s.xlsx", sample_workbook(), "application/vnd.ms-excel")},
        data={"currency_code": "NGN"},
    )
    assert nameless.status_code == 422

    unknown = await client.post(
        "/api/import/preview",
        files={"file": ("s.xlsx", sample_workbook(), "application/vnd.ms-excel")},
        data={"name": "X", "currency_code": "ZZZ"},
    )
    assert unknown.status_code == 422


async def test_vendor_count_excludes_contact_aliases(client: AsyncClient) -> None:
    await set_up_admin(client)

    body = await run_import(client, sample_workbook())

    # The contact name is an alias for vendor matching, not a second vendor.
    assert body["vendor_count"] == 1
    assert (await client.get("/api/vendors")).json()["total"] == 1


async def test_person_is_created_from_paid_by(client: AsyncClient) -> None:
    await set_up_admin(client)

    body = await run_import(client, sample_workbook())

    assert body["person_count"] == 1
    assert (await client.get("/api/people")).json()["items"][0]["name"] == "Ayo"


async def test_single_sheet_csv_is_imported(client: AsyncClient) -> None:
    await set_up_admin(client)
    csv = b"Cost Codes,Activities,Labor Costs,Material Costs,Fixed Costs,Budget\n"
    csv += b"1000,Admin,,,,0\n1001,Beacons,,1000,,1000\n"

    resp = await client.post(
        "/api/import",
        files={"file": ("budget.csv", csv, "text/csv")},
        data={"name": "From a csv", "currency_code": "NGN"},
    )

    assert resp.status_code == 201, resp.text
    assert resp.json()["budgeted_amount"] == 1_000_00


async def test_preview_shows_first_rows_with_categories(
    client: AsyncClient,
) -> None:
    await set_up_admin(client)

    body = await preview_import(client, sample_workbook())

    assert len(body["sample"]) == 1
    row = body["sample"][0]
    assert row["description"] == "Bright Star Aluminium invoice 3835"
    assert row["category"] == "Concrete Foundation"
    assert row["amount"] == 500_000_00
    assert row["spent_on"] == "2022-05-10"


async def _imported_project(client: AsyncClient) -> dict:
    """A project imported from the sample workbook, so there is something to export."""
    await set_up_admin(client)
    return await run_import(client, sample_workbook())


async def test_project_exports_as_xlsx(client: AsyncClient) -> None:
    imported = await _imported_project(client)

    resp = await client.get(f"/api/projects/{imported['project_id']}/export")

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith(XLSX)
    assert ".xlsx" in resp.headers["content-disposition"]
    assert resp.content[:2] == b"PK"


async def test_export_of_unknown_project_returns_404(client: AsyncClient) -> None:
    await set_up_admin(client)
    assert (await client.get("/api/projects/nope/export")).status_code == 404


async def test_export_import_round_trip_keeps_totals(client: AsyncClient) -> None:
    imported = await _imported_project(client)
    before = (await client.get(f"/api/projects/{imported['project_id']}/expense-summary")).json()

    exported = (await client.get(f"/api/projects/{imported['project_id']}/export")).content
    again = await run_import(client, exported, name="Round trip")

    after = (await client.get(f"/api/projects/{again['project_id']}/expense-summary")).json()
    assert after["budgeted_amount"] == before["budgeted_amount"]
    assert after["spent_amount"] == before["spent_amount"]
    assert again["category_count"] == imported["category_count"]
    assert again["budget_item_count"] == imported["budget_item_count"]


async def test_export_round_trip_keeps_expense_descriptions(client: AsyncClient) -> None:
    imported = await _imported_project(client)

    exported = (await client.get(f"/api/projects/{imported['project_id']}/export")).content
    again = await run_import(client, exported, name="Round trip")

    listing = (await client.get(f"/api/projects/{again['project_id']}/expenses")).json()
    # Without a description column the reader would name rows after the vendor.
    assert [row["description"] for row in listing["items"]] == [
        "Bright Star Aluminium invoice 3835"
    ]


async def test_export_round_trip_keeps_expense_categories(client: AsyncClient) -> None:
    await set_up_admin(client)
    imported = await run_import(
        client,
        workbook(
            Budget=[
                BUDGET_HEADERS,
                ["3000", "Concrete Foundation", "", "", "", 0],
                ["3001", "Pegging", "", "", 37500, 37500],
            ],
            Invoices=[
                EXPENSE_HEADERS,
                [11, "Bright Star Aluminium", 3001, 44691, 500000, "", "Ayo", 1, 44691, ""],
            ],
        ),
    )

    categorised = (await client.get(f"/api/projects/{imported['project_id']}/expenses")).json()[
        "items"
    ][0]
    assert categorised["category_id"] is not None

    round_trip = await run_import(
        client,
        (await client.get(f"/api/projects/{imported['project_id']}/export")).content,
        name="Round trip",
    )
    reimported = (await client.get(f"/api/projects/{round_trip['project_id']}/expenses")).json()
    assert reimported["items"][0]["category_id"] is not None


async def test_blank_template_download(client: AsyncClient) -> None:
    await set_up_admin(client)

    resp = await client.get("/api/import/sample")

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith(XLSX)
    assert "setout-blank-sheet.xlsx" in resp.headers["content-disposition"]


async def test_blank_template_previews_empty(
    client: AsyncClient,
) -> None:
    await set_up_admin(client)
    blank = (await client.get("/api/import/sample?kind=blank")).content

    report = await preview_import(client, blank)

    assert {s["holds"] for s in report["read"]} == {
        "budget",
        "vendors",
        "expenses",
        "outstanding",
    }
    assert report["budgeted_amount"] == 0
    assert report["expense_rows"] == 0
    assert report["decisions"] == []


async def test_budget_items_keep_their_cost_type(client: AsyncClient) -> None:
    await set_up_admin(client)
    imported = await run_import(
        client,
        workbook(
            Budget=[
                BUDGET_HEADERS,
                ["3000", "Concrete Foundation", "", "", "", 0],
                ["3001", "Pegging", 37500, "", "", 37500],
                ["3002", "Cement", "", 12000, "", 12000],
                ["3003", "Permit", "", "", 5000, 5000],
            ]
        ),
    )

    categories = (await client.get(f"/api/projects/{imported['project_id']}/categories")).json()
    lines = (await client.get(f"/api/categories/{categories[0]['id']}/budget-items")).json()[
        "items"
    ]

    assert {line["description"]: line["cost_type"] for line in lines} == {
        "Pegging": "labour",
        "Cement": "material",
        "Permit": "fixed",
    }


async def test_export_round_trip_keeps_cost_types(client: AsyncClient) -> None:
    await set_up_admin(client)
    imported = await run_import(
        client,
        workbook(
            Budget=[
                BUDGET_HEADERS,
                ["3000", "Concrete Foundation", "", "", "", 0],
                ["3001", "Pegging", 37500, "", "", 37500],
                ["3002", "Cement", "", 12000, "", 12000],
            ]
        ),
    )

    again = await run_import(
        client,
        (await client.get(f"/api/projects/{imported['project_id']}/export")).content,
        name="Round trip",
    )

    categories = (await client.get(f"/api/projects/{again['project_id']}/categories")).json()
    lines = (await client.get(f"/api/categories/{categories[0]['id']}/budget-items")).json()[
        "items"
    ]
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
async def test_each_template_download_filename(
    client: AsyncClient, kind: str, filename: str
) -> None:
    await set_up_admin(client)

    resp = await client.get(f"/api/import/sample?kind={kind}")

    assert resp.status_code == 200
    assert filename in resp.headers["content-disposition"]


async def test_unknown_template_kind_is_rejected(client: AsyncClient) -> None:
    await set_up_admin(client)
    assert (await client.get("/api/import/sample?kind=whatever")).status_code == 422


async def test_example_template_imports_its_rows(client: AsyncClient) -> None:
    await set_up_admin(client)
    filled = (await client.get("/api/import/sample?kind=example")).content

    # The example workbook specifies its currency.
    imported = await run_import(client, filled, name="From the example", currency_code="")

    assert imported["category_count"] == 2
    assert imported["budget_item_count"] == 4
    assert imported["budgeted_amount"] == 780_000_00
    assert imported["expense_count"] == 3
    assert imported["spent_amount"] == 144_900_00
    assert imported["vendor_count"] == 2


async def test_csv_template_contains_only_the_budget_sheet(client: AsyncClient) -> None:
    await set_up_admin(client)
    budget_only = (await client.get("/api/import/sample?kind=budget-csv")).content

    report = await preview_import(client, budget_only)

    assert [s["holds"] for s in report["read"]] == ["budget"]
    assert report["budgeted_amount"] == 780_000_00
    assert report["expense_rows"] == 0


async def test_export_records_its_currency(client: AsyncClient) -> None:
    imported = await _imported_project(client)

    exported = (await client.get(f"/api/projects/{imported['project_id']}/export")).content
    again = await run_import(client, exported, name="No currency chosen", currency_code="")

    assert (await client.get(f"/api/projects/{again['project_id']}")).json()[
        "currency_code"
    ] == "NGN"


async def test_workbook_without_currency_requires_one(client: AsyncClient) -> None:
    await set_up_admin(client)

    resp = await client.post(
        "/api/import/preview",
        files={"file": ("sheet.xlsx", sample_workbook(), "application/vnd.ms-excel")},
        data={"name": "Nameless", "currency_code": ""},
    )

    assert resp.status_code == 422
    assert "does not specify a currency" in resp.json()["detail"]


async def test_reimport_reports_category_count(
    client: AsyncClient,
) -> None:
    await set_up_admin(client)
    first = await run_import(client, sample_workbook())

    again = await run_import(client, sample_workbook(), project_id=first["project_id"])

    categories = (await client.get(f"/api/projects/{first['project_id']}/categories")).json()
    assert first["category_count"] == len(categories)
    assert again["category_count"] == len(categories)


async def test_outstanding_deliveries_are_reported_on_reimport(
    client: AsyncClient,
) -> None:
    await set_up_admin(client)
    imported = await run_import(client, sample_workbook())
    expense = (await client.get(f"/api/projects/{imported['project_id']}/expenses")).json()[
        "items"
    ][0]
    delivery = await client.post(
        f"/api/projects/{imported['project_id']}/deliveries",
        json={"expense_id": expense["id"], "description": "20 rods"},
    )

    outstanding_preview = await preview_import(
        client,
        (await client.get(f"/api/projects/{imported['project_id']}/export")).content,
        name="Still outstanding",
        currency_code="",
    )
    assert outstanding_preview["outstanding_rows"] == 1
    assert "outstanding_not_importable" in [d["kind"] for d in outstanding_preview["decisions"]]

    await client.post(f"/api/deliveries/{delivery.json()['id']}/received")

    received_preview = await preview_import(
        client,
        (await client.get(f"/api/projects/{imported['project_id']}/export")).content,
        name="Received",
        currency_code="",
    )
    assert received_preview["outstanding_rows"] == 0
    assert "outstanding_not_importable" not in [d["kind"] for d in received_preview["decisions"]]


async def test_oversized_file_is_rejected_before_reading(client: AsyncClient, monkeypatch) -> None:
    from setout.config import get_settings

    monkeypatch.setattr(get_settings(), "max_import_bytes", 1024)
    await set_up_admin(client)

    resp = await client.post(
        "/api/import/preview",
        files={"file": ("big.csv", b"x" * 2048, "text/csv")},
        data={"name": "Too big", "currency_code": "NGN"},
    )

    assert resp.status_code == 413
    assert "larger than" in resp.json()["detail"]
    assert (await client.get("/api/projects")).json()["total"] == 0


async def test_workbook_with_old_headers_and_sheet_names_imports(
    client: AsyncClient,
) -> None:
    await set_up_admin(client)
    data = workbook(
        **{
            "Budget": [OLD_BUDGET_HEADERS, ["3000", "Foundation", "", "", "", 0]]
            + [["3001", "Pegging", 37500, "", "", 37500]],
            "Vendors & Subcontractors": [
                VENDOR_HEADERS,
                ["Bright Star Aluminium", "", "Roofing", "", "", "", ""],
            ],
            "Invoices and Purchases": [
                OLD_EXPENSE_HEADERS,
                [3835, "Bright Star Aluminium", 3001, 44691, 500000, "", "Ayo", 1, 44691, ""],
            ],
        }
    )

    imported = await run_import(client, data)

    assert imported["category_count"] == 1
    assert imported["budget_item_count"] == 1
    assert imported["budgeted_amount"] == 37_500_00
    assert imported["expense_count"] == 1
    assert imported["spent_amount"] == 500_000_00
    assert imported["vendor_count"] == 1
    assert imported["person_count"] == 1
    expense = (await client.get(f"/api/projects/{imported['project_id']}/expenses")).json()[
        "items"
    ][0]
    assert expense["paid_by_id"] is not None
    assert expense["category_id"] is not None
