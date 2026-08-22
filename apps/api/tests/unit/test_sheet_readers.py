from __future__ import annotations

import pytest

from setout.services.sheets import (
    detect,
    read_budget,
    read_expenses,
    read_outstanding,
    read_vendors,
)
from setout.services.sheets.parsed import Trouble
from setout.services.sheets.workbook import Sheet

pytestmark = pytest.mark.unit

BUDGET_HEAD = [
    "Cost Codes",
    "Activities",
    "Labor Costs",
    "Material Costs",
    "Fixed Costs",
    "Budget",
    "Actual Cost",
]
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
OWED_HEAD = ["Item", "Vendor", "Qty", "Location"]


def found(name: str, head: list[str], *rows: list[object]):
    sheet = Sheet(name=name, rows=[["Title"], head, *rows])
    hit = detect.find([sheet])
    assert hit.found, f"{name} was not recognised"
    return hit.found[0]


class TestWorkingOutWhatASheetHolds:
    def test_each_shape_is_known_by_its_headings(self) -> None:
        for name, head, shape in (
            ("anything", BUDGET_HEAD, detect.Shape.BUDGET),
            ("anything", SPEND_HEAD, detect.Shape.EXPENSES),
            ("anything", VENDOR_HEAD, detect.Shape.VENDORS),
            ("anything", OWED_HEAD, detect.Shape.OUTSTANDING),
        ):
            assert found(name, head).shape is shape

    def test_the_template_copy_is_left_out(self) -> None:
        real = Sheet(name="Budget", rows=[["t"], BUDGET_HEAD, ["1000", "Admin", "", "", "", 100]])
        template = Sheet(
            name="Budget - Base", rows=[["t"], BUDGET_HEAD, ["1000", "Example", "", "", "", 999]]
        )
        hit = detect.find([real, template])

        assert [f.sheet.name for f in hit.found] == ["Budget"]
        assert hit.skipped[0][0] == "Budget - Base"

    def test_a_sheet_of_something_else_is_reported_not_guessed(self) -> None:
        hit = detect.find([Sheet(name="Notes", rows=[["hello"], ["world"]])])

        assert hit.found == []
        assert hit.skipped == [("Notes", "no headings Setout recognises")]


class TestReadingThePlan:
    def test_the_scope_heading_total_is_not_counted_again(self) -> None:
        f = found(
            "Budget",
            BUDGET_HEAD,
            ["1000", "Administrative Expenses", "", "", "", 68500],
            ["1001", "Beacons", "", 1000, "", 1000],
            ["1002", "Drawings", "", "", 20000, 20000],
        )
        read = read_budget.read(f, exponent=2)

        assert [s.code for s in read.scopes] == ["1000"]
        # 68,500 is the heading's own total. Only the two lines are counted.
        assert read.planned_amount == 21_000_00
        assert len(read.scopes[0].lines) == 2

    def test_lines_sit_under_the_scope_above_them(self) -> None:
        f = found(
            "Budget",
            BUDGET_HEAD,
            ["1000", "Admin", "", "", "", 0],
            ["1001", "Rent", "", "", "", 500],
            ["3000", "Concrete Foundation", "", "", "", 0],
            ["3001", "Pegging", 37500, "", "", 37500],
        )
        read = read_budget.read(f, exponent=2)

        assert [s.name for s in read.scopes] == ["Admin", "Concrete Foundation"]
        assert [line.description for line in read.scopes[1].lines] == ["Pegging"]

    def test_a_line_with_nothing_planned_is_left_out(self) -> None:
        f = found(
            "Budget",
            BUDGET_HEAD,
            ["2000", "Equipment Rentals", "", "", "", 0],
            ["2001", "Vehicles", "", "", "", ""],
        )
        read = read_budget.read(f, exponent=2)

        assert read.scopes[0].lines == []
        assert read.planned_amount == 0

    def test_a_figure_with_no_words_comes_in_as_missing(self) -> None:
        f = found(
            "Budget", BUDGET_HEAD, ["1000", "Admin", "", "", "", 0], ["1001", "", "", "", "", 500]
        )
        read = read_budget.read(f, exponent=2)

        assert read.scopes[0].lines[0].description == read_budget.MISSING
        assert read.problems[0].kind is Trouble.NO_DESCRIPTION

    def test_a_line_before_any_scope_is_reported(self) -> None:
        f = found("Budget", BUDGET_HEAD, ["1001", "Orphan", "", "", "", 500])
        read = read_budget.read(f, exponent=2)

        assert read.scopes == []
        assert read.problems[0].kind is Trouble.NO_SCOPE_YET


class TestReadingSpend:
    def test_the_vendor_and_invoice_name_the_purchase(self) -> None:
        row = [3835, "Bright Star Aluminium", 1001, 44691, 500000, "image.png", "Me", 1, 44691]
        f = found("Invoices", SPEND_HEAD, [*row, "@4200"])
        read = read_expenses.read(f, exponent=2)

        assert read.spend[0].description == "Bright Star Aluminium invoice 3835"
        # The sheet's own note is kept as a note, not mistaken for a description.
        assert "@4200" in read.spend[0].notes
        assert "image.png" in read.spend[0].notes
        assert read.amount == 500_000_00

    def test_a_row_naming_several_cost_codes_is_flagged(self) -> None:
        row = ["1", "V", "2003, 2005, 3000", 44691, 2000, "", "", 1, "", ""]
        f = found("Invoices", SPEND_HEAD, row)
        read = read_expenses.read(f, exponent=2)

        assert read.spend[0].codes == ["2003", "2005", "3000"]
        assert read.problems[0].kind is Trouble.SEVERAL_CODES

    def test_an_unpaid_invoice_is_flagged_but_still_read(self) -> None:
        f = found("Invoices", SPEND_HEAD, ["1", "V", 1001, 44691, 2000, "", "", 0, "", ""])
        read = read_expenses.read(f, exponent=2)

        assert len(read.spend) == 1
        assert read.problems[0].kind is Trouble.NOT_PAID

    def test_a_row_with_no_money_is_not_spend(self) -> None:
        f = found("Invoices", SPEND_HEAD, ["", "Kunle Bricklaying", "", "", "", "", "", "", "", ""])
        assert read_expenses.read(f, exponent=2).spend == []


class TestReadingVendors:
    def test_the_columns_land_where_they_belong(self) -> None:
        f = found(
            "Vendors",
            VENDOR_HEAD,
            [
                "Corner Depot Cement",
                "",
                "Consultant",
                "Mr Femi",
                8000000001.0,
                "a@b.com",
                "No longer trading",
            ],
        )
        row = read_vendors.read(f).vendors[0]

        assert row.name == "Corner Depot Cement"
        assert (row.trade, row.contact_name) == ("Consultant", "Mr Femi")
        assert row.phone == "8000000001"
        assert (row.email, row.notes) == ("a@b.com", "No longer trading")

    def test_the_same_vendor_twice_comes_in_once(self) -> None:
        f = found(
            "Vendors",
            VENDOR_HEAD,
            ["Folly Blocks", "", "Blocks", "", "", "", ""],
            ["folly blocks", "", "Blocks", "", "", "", ""],
        )
        assert len(read_vendors.read(f).vendors) == 1


class TestReadingWhatIsOwed:
    def test_the_quantity_joins_the_item(self) -> None:
        f = found(
            "Outstanding",
            OWED_HEAD,
            ["Bags Of Cement", "Mrs Bisi Ade", 17, "Jacaranda Close", "Resolved"],
        )
        row = read_outstanding.read(f).owed[0]

        assert row.description == "17 Bags Of Cement"
        assert row.vendor == "Mrs Bisi Ade"
        assert row.resolved is True

    def test_anything_not_marked_done_is_still_owed(self) -> None:
        f = found("Outstanding", OWED_HEAD, ["Blocks", "Segun", 200, "Site", ""])
        assert read_outstanding.read(f).owed[0].resolved is False


class TestWhetherSomethingArrived:
    def test_a_status_naming_the_day_it_came_still_counts_as_arrived(self) -> None:
        assert read_outstanding.has_arrived("Delivered 14 Aug 2026") is True
        assert read_outstanding.has_arrived("Received") is True
        assert read_outstanding.has_arrived("yes") is True

    def test_anything_else_is_still_waiting(self) -> None:
        assert read_outstanding.has_arrived("Waiting") is False
        assert read_outstanding.has_arrived("") is False
        assert read_outstanding.has_arrived("not delivered") is False
