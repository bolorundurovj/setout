from __future__ import annotations

import pytest

from setout.services.sheets import (
    detect,
    read_budget,
    read_expenses,
    read_outstanding,
    read_vendors,
)
from setout.services.sheets.parsed import ProblemKind
from setout.services.sheets.workbook import Sheet

pytestmark = pytest.mark.unit

BUDGET_HEAD = [
    "Cost Code",
    "Description",
    "Labour Costs",
    "Material Costs",
    "Fixed Costs",
    "Budget",
    "Actual Cost",
]
EXPENSE_HEAD = [
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
VENDOR_HEAD = ["Company Name", "Photo", "Trade", "Point of Contact", "Phone", "Email", "Notes"]
OUTSTANDING_HEAD = ["Item", "Vendor", "Qty", "Location"]


def found(name: str, head: list[str], *rows: list[object]):
    sheet = Sheet(name=name, rows=[["Title"], head, *rows])
    hit = detect.detect_sheets([sheet])
    assert hit.detected, f"{name} was not recognised"
    return hit.detected[0]


class TestWorkingOutWhatASheetHolds:
    def test_each_shape_is_known_by_its_headings(self) -> None:
        for name, head, shape in (
            ("anything", BUDGET_HEAD, detect.SheetKind.BUDGET),
            ("anything", EXPENSE_HEAD, detect.SheetKind.EXPENSES),
            ("anything", VENDOR_HEAD, detect.SheetKind.VENDORS),
            ("anything", OUTSTANDING_HEAD, detect.SheetKind.OUTSTANDING),
        ):
            assert found(name, head).kind is shape

    def test_the_old_template_headings_are_still_known(self) -> None:
        old_budget = ["Cost Codes", "Activities", "Labor Costs", "Material Costs", "Budget"]
        old_expenses = ["Cost Code", "Description", "Total Cost", "Documents", "Purchased By"]

        budget = found(
            "Budget", old_budget, ["2000", "Masonry", "", "", 0], ["2001", "Blocks", 700, "", 700]
        )
        spend = found(
            "Invoices and Purchases", old_expenses, ["2001", "Cement", 900, "a.png", "Ayo"]
        )

        assert budget.kind is detect.SheetKind.BUDGET
        line = read_budget.read(budget, exponent=0).categories[0].lines[0]
        assert (line.description, line.cost_type) == ("Blocks", "labour")
        assert spend.kind is detect.SheetKind.EXPENSES
        row = read_expenses.read(spend, exponent=0).expenses[0]
        assert (row.amount, row.paid_by) == (900, "Ayo")
        assert "a.png" in row.notes

    def test_the_template_copy_is_left_out(self) -> None:
        real = Sheet(name="Budget", rows=[["t"], BUDGET_HEAD, ["1000", "Admin", "", "", "", 100]])
        template = Sheet(
            name="Budget - Base", rows=[["t"], BUDGET_HEAD, ["1000", "Example", "", "", "", 999]]
        )
        hit = detect.detect_sheets([real, template])

        assert [f.sheet.name for f in hit.detected] == ["Budget"]
        assert hit.skipped[0][0] == "Budget - Base"

    def test_a_sheet_of_something_else_is_reported_not_guessed(self) -> None:
        hit = detect.detect_sheets([Sheet(name="Notes", rows=[["hello"], ["world"]])])

        assert hit.detected == []
        assert hit.skipped == [("Notes", "No recognised header row")]


class TestReadingThePlan:
    def test_the_category_heading_total_is_not_counted_again(self) -> None:
        f = found(
            "Budget",
            BUDGET_HEAD,
            ["1000", "Administrative Expenses", "", "", "", 68500],
            ["1001", "Beacons", "", 1000, "", 1000],
            ["1002", "Drawings", "", "", 20000, 20000],
        )
        read = read_budget.read(f, exponent=2)

        assert [s.code for s in read.categories] == ["1000"]
        # 68,500 is the heading's own total. Only the two lines are counted.
        assert read.budgeted_amount == 21_000_00
        assert len(read.categories[0].lines) == 2

    def test_lines_sit_under_the_category_above_them(self) -> None:
        f = found(
            "Budget",
            BUDGET_HEAD,
            ["1000", "Admin", "", "", "", 0],
            ["1001", "Rent", "", "", "", 500],
            ["3000", "Concrete Foundation", "", "", "", 0],
            ["3001", "Pegging", 37500, "", "", 37500],
        )
        read = read_budget.read(f, exponent=2)

        assert [s.name for s in read.categories] == ["Admin", "Concrete Foundation"]
        assert [line.description for line in read.categories[1].lines] == ["Pegging"]

    def test_a_line_with_nothing_budgeted_is_left_out(self) -> None:
        f = found(
            "Budget",
            BUDGET_HEAD,
            ["2000", "Equipment Rentals", "", "", "", 0],
            ["2001", "Vehicles", "", "", "", ""],
        )
        read = read_budget.read(f, exponent=2)

        assert read.categories[0].lines == []
        assert read.budgeted_amount == 0

    def test_a_figure_with_no_words_comes_in_as_missing(self) -> None:
        f = found(
            "Budget", BUDGET_HEAD, ["1000", "Admin", "", "", "", 0], ["1001", "", "", "", "", 500]
        )
        read = read_budget.read(f, exponent=2)

        assert read.categories[0].lines[0].description == read_budget.NO_DESCRIPTION_PLACEHOLDER
        assert read.problems[0].kind is ProblemKind.NO_DESCRIPTION

    def test_a_line_before_any_category_is_reported(self) -> None:
        f = found("Budget", BUDGET_HEAD, ["1001", "Orphan", "", "", "", 500])
        read = read_budget.read(f, exponent=2)

        assert read.categories == []
        assert read.problems[0].kind is ProblemKind.BEFORE_FIRST_CATEGORY


class TestReadingSpend:
    def test_the_vendor_and_invoice_name_the_purchase(self) -> None:
        row = [3835, "Bright Star Aluminium", 1001, 44691, 500000, "image.png", "Me", 1, 44691]
        f = found("Invoices", EXPENSE_HEAD, [*row, "@4200"])
        read = read_expenses.read(f, exponent=2)

        assert read.expenses[0].description == "Bright Star Aluminium invoice 3835"
        # The sheet's own note is kept as a note, not mistaken for a description.
        assert "@4200" in read.expenses[0].notes
        assert "image.png" in read.expenses[0].notes
        assert read.amount == 500_000_00

    def test_a_row_naming_several_cost_codes_is_flagged(self) -> None:
        row = ["1", "V", "2003, 2005, 3000", 44691, 2000, "", "", 1, "", ""]
        f = found("Invoices", EXPENSE_HEAD, row)
        read = read_expenses.read(f, exponent=2)

        assert read.expenses[0].codes == ["2003", "2005", "3000"]
        assert read.problems[0].kind is ProblemKind.MULTIPLE_CODES

    def test_an_unpaid_invoice_is_flagged_but_still_read(self) -> None:
        f = found("Invoices", EXPENSE_HEAD, ["1", "V", 1001, 44691, 2000, "", "", 0, "", ""])
        read = read_expenses.read(f, exponent=2)

        assert len(read.expenses) == 1
        assert read.problems[0].kind is ProblemKind.NOT_PAID

    def test_a_row_with_no_money_is_not_spend(self) -> None:
        f = found(
            "Invoices", EXPENSE_HEAD, ["", "Kunle Bricklaying", "", "", "", "", "", "", "", ""]
        )
        assert read_expenses.read(f, exponent=2).expenses == []


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


class TestReadingWhatIsOutstanding:
    def test_the_quantity_joins_the_item(self) -> None:
        f = found(
            "Outstanding",
            OUTSTANDING_HEAD,
            ["Bags Of Cement", "Mrs Bisi Ade", 17, "Jacaranda Close", "Resolved"],
        )
        row = read_outstanding.read(f).outstanding[0]

        assert row.description == "17 Bags Of Cement"
        assert row.vendor == "Mrs Bisi Ade"
        assert row.received is True

    def test_the_expected_column_is_read(self) -> None:
        head = ["Item", "Vendor", "Qty", "Expected", "Status"]
        f = found("Outstanding", head, ["Blocks", "Segun", "", "this week", "Not Delivered"])
        row = read_outstanding.read(f).outstanding[0]

        assert row.expected == "this week"
        assert row.received is False

    def test_a_legacy_location_column_is_still_read(self) -> None:
        f = found("Outstanding", OUTSTANDING_HEAD, ["Blocks", "Segun", 200, "this week", ""])
        assert read_outstanding.read(f).outstanding[0].expected == "this week"

    def test_anything_not_marked_done_is_still_outstanding(self) -> None:
        f = found("Outstanding", OUTSTANDING_HEAD, ["Blocks", "Segun", 200, "Site", ""])
        assert read_outstanding.read(f).outstanding[0].received is False


class TestWhetherSomethingArrived:
    def test_a_status_naming_the_day_it_came_still_counts_as_arrived(self) -> None:
        assert read_outstanding.is_received("Delivered 14 Aug 2026") is True
        assert read_outstanding.is_received("Received 14 Aug 2026") is True
        assert read_outstanding.is_received("yes") is True

    def test_anything_else_is_still_waiting(self) -> None:
        assert read_outstanding.is_received("Waiting") is False
        assert read_outstanding.is_received("") is False
        assert read_outstanding.is_received("not delivered") is False
        assert read_outstanding.is_received("Not received") is False
