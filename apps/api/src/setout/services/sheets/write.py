from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet

TITLE_FONT = Font(name="Calibri", size=14, bold=True, color="1E2226")
HEAD_FONT = Font(name="Calibri", size=11, bold=True, color="1E2226")
HEAD_FILL = PatternFill("solid", fgColor="ECEFF3")
CATEGORY_FONT = Font(name="Calibri", size=11, bold=True)
MONEY_FORMAT = "#,##0.00"
XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
DATE_FORMAT = "dd mmm yyyy"

BUDGET_HEAD = [
    "Cost Code",
    "Description",
    "Labour Costs",
    "Material Costs",
    "Fixed Costs",
    "Budget",
]
VENDOR_HEAD = ["Company Name", "Trade", "Point of Contact", "Phone", "Email", "Notes"]
EXPENSE_HEAD = [
    "Invoice No.",
    "Subcontractors & Vendors",
    "Cost Code",
    "Description",
    "Date Invoiced",
    "Amount",
    "Attachment",
    "Paid By",
    "Paid",
    "Date Paid",
    "Notes",
]
OUTSTANDING_HEAD = ["Item", "Vendor", "Qty", "Expected", "Status"]
PEOPLE_HEAD = ["Person", "Role", "Phone", "Notes"]
AGREEMENT_HEAD = ["Vendor", "Description", "Agreed Amount", "Paid", "Balance", "Notes"]
PRICE_HEAD = ["Item Name", "Unit", "Latest Unit Rate", "Vendor", "Date"]
ATTACHMENT_HEAD = ["File", "Attached To", "Size in Bytes", "Checksum"]

VENDORS_SHEET = "Vendors and subcontractors"
EXPENSES_SHEET = "Expenses"
OUTSTANDING_SHEET = "Outstanding deliveries"


COST_COLUMN = {"labour": 0, "material": 1, "fixed": 2}


@dataclass
class BudgetLine:
    code: str
    name: str
    budgeted_amount: int
    cost_type: str | None = None


@dataclass
class BudgetCategory:
    code: str
    name: str
    lines: list[BudgetLine] = field(default_factory=list)

    @property
    def budgeted_amount(self) -> int:
        return sum(line.budgeted_amount for line in self.lines)


@dataclass
class ExpenseRow:
    vendor: str
    code: str
    description: str
    spent_on: date | None
    amount: int
    attachment: str
    paid_by: str
    notes: str


@dataclass
class VendorRow:
    name: str
    trade: str
    contact_name: str
    phone: str
    email: str
    notes: str


@dataclass
class OutstandingRow:
    description: str
    vendor: str
    expected: date | str | None
    received_on: date | None


@dataclass
class PersonRow:
    name: str
    role: str
    phone: str
    notes: str


@dataclass
class AgreementRow:
    vendor: str
    description: str
    agreed_amount: int
    paid_amount: int


@dataclass
class PriceRow:
    name: str
    unit: str
    unit_rate: int | None
    vendor: str
    spent_on: date | None


@dataclass
class AttachmentRow:
    filename: str
    expense_description: str
    byte_size: int
    checksum: str


@dataclass
class ExportWorkbook:
    project_name: str
    exponent: int
    currency_code: str = ""
    categories: list[BudgetCategory] = field(default_factory=list)
    vendors: list[VendorRow] = field(default_factory=list)
    expenses: list[ExpenseRow] = field(default_factory=list)
    outstanding: list[OutstandingRow] = field(default_factory=list)
    people: list[PersonRow] = field(default_factory=list)
    agreements: list[AgreementRow] = field(default_factory=list)
    prices: list[PriceRow] = field(default_factory=list)
    attachments: list[AttachmentRow] = field(default_factory=list)


def major(minor: int, exponent: int) -> Decimal:
    return Decimal(minor).scaleb(-exponent)


def compose(book: ExportWorkbook) -> Workbook:
    wb = Workbook()
    wb.remove(wb.active)

    _project(wb.create_sheet("Project"), book)
    _budget(wb.create_sheet("Budget"), book)
    _vendors(wb.create_sheet(VENDORS_SHEET), book)
    _expenses(wb.create_sheet(EXPENSES_SHEET), book)
    _outstanding(wb.create_sheet(OUTSTANDING_SHEET), book)
    _people(wb.create_sheet("People"), book)
    _agreements(wb.create_sheet("Agreements"), book)
    _prices(wb.create_sheet("Item prices"), book)
    _attachments(wb.create_sheet("Attachments"), book)
    return wb


def as_bytes(wb: Workbook) -> bytes:
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def build(book: ExportWorkbook) -> bytes:
    return as_bytes(compose(book))


CURRENCY_LABEL = "Currency code"


def _project(sheet: Worksheet, book: ExportWorkbook) -> None:
    sheet.append([f"{book.project_name}"])
    sheet.append([])
    for label, value in [
        ("Project", book.project_name),
        (CURRENCY_LABEL, book.currency_code),
        ("Amounts", "Whole currency units, for example 1,500.00, not cents or kobo"),
    ]:
        sheet.append([label, value])
    sheet["A1"].font = TITLE_FONT
    for row in sheet.iter_rows(min_row=3):
        row[0].font = HEAD_FONT
    _widths(sheet, [26, 44])


def _money_format(book: ExportWorkbook) -> str:
    return f'"{book.currency_code} "#,##0.00' if book.currency_code else MONEY_FORMAT


def _title(sheet: Worksheet, name: str, head: list[str]) -> None:
    sheet.append([name])
    sheet.append([])
    sheet.append(head)
    sheet["A1"].font = TITLE_FONT
    for column in range(1, len(head) + 1):
        cell = sheet.cell(row=3, column=column)
        cell.font = HEAD_FONT
        cell.fill = HEAD_FILL
        cell.alignment = Alignment(horizontal="left", vertical="center")
    sheet.freeze_panes = "A4"
    sheet.auto_filter.ref = f"A3:{get_column_letter(len(head))}3"


def _widths(sheet: Worksheet, widths: list[int]) -> None:
    for index, width in enumerate(widths, start=1):
        sheet.column_dimensions[get_column_letter(index)].width = width


def _format(
    sheet: Worksheet,
    money: list[int],
    dates: list[int] | None = None,
    money_format: str = MONEY_FORMAT,
) -> None:
    for row in sheet.iter_rows(min_row=4):
        for column in money:
            row[column].number_format = money_format
        for column in dates or []:
            row[column].number_format = DATE_FORMAT


def _budget(sheet: Worksheet, book: ExportWorkbook) -> None:
    _title(sheet, f"{book.project_name}: budget", BUDGET_HEAD)

    def to_major(minor: int) -> Decimal:
        return major(minor, book.exponent)

    for category in book.categories:
        totals = _by_cost_type(category.lines)
        sheet.append(
            [
                category.code,
                category.name,
                to_major(totals["labour"]) if totals["labour"] else "",
                to_major(totals["material"]) if totals["material"] else "",
                to_major(totals["fixed"]) if totals["fixed"] else "",
                to_major(category.budgeted_amount),
            ]
        )
        sheet.cell(row=sheet.max_row, column=1).font = CATEGORY_FONT
        sheet.cell(row=sheet.max_row, column=2).font = CATEGORY_FONT
        sheet.cell(row=sheet.max_row, column=6).font = CATEGORY_FONT
        for line in category.lines:
            cost_type_cells: list[object] = ["", "", ""]
            if line.cost_type in COST_COLUMN:
                cost_type_cells[COST_COLUMN[line.cost_type]] = to_major(line.budgeted_amount)
            sheet.append([line.code, line.name, *cost_type_cells, to_major(line.budgeted_amount)])

    _widths(sheet, [14, 40, 15, 15, 15, 16])
    _format(sheet, money=[2, 3, 4, 5], money_format=_money_format(book))


def _by_cost_type(lines: list[BudgetLine]) -> dict[str, int]:
    totals = {"labour": 0, "material": 0, "fixed": 0}
    for line in lines:
        if line.cost_type in totals:
            totals[line.cost_type] += line.budgeted_amount
    return totals


def _vendors(sheet: Worksheet, book: ExportWorkbook) -> None:
    _title(sheet, VENDORS_SHEET, VENDOR_HEAD)
    for vendor in book.vendors:
        sheet.append(
            [
                vendor.name,
                vendor.trade,
                vendor.contact_name,
                vendor.phone,
                vendor.email,
                vendor.notes,
            ]
        )
    _widths(sheet, [28, 20, 22, 18, 26, 30])


def _expenses(sheet: Worksheet, book: ExportWorkbook) -> None:
    _title(sheet, EXPENSES_SHEET, EXPENSE_HEAD)
    for row in book.expenses:
        sheet.append(
            [
                "",
                row.vendor,
                row.code,
                row.description,
                row.spent_on,
                major(row.amount, book.exponent),
                row.attachment,
                row.paid_by,
                "Yes",
                row.spent_on,
                row.notes,
            ]
        )
    _widths(sheet, [12, 28, 12, 34, 14, 14, 18, 18, 8, 14, 30])
    _format(sheet, money=[5], dates=[4, 9], money_format=_money_format(book))


def _outstanding(sheet: Worksheet, book: ExportWorkbook) -> None:
    _title(sheet, OUTSTANDING_SHEET, OUTSTANDING_HEAD)
    for row in book.outstanding:
        status = f"Received {row.received_on:%d %b %Y}" if row.received_on else "Not received"
        expected_str = (
            row.expected.isoformat() if isinstance(row.expected, date) else (row.expected or "")
        )
        sheet.append([row.description, row.vendor, "", expected_str, status])
    _widths(sheet, [34, 26, 10, 22, 22])


def _people(sheet: Worksheet, book: ExportWorkbook) -> None:
    _title(sheet, "People", PEOPLE_HEAD)
    for person in book.people:
        sheet.append([person.name, person.role, person.phone, person.notes])
    _widths(sheet, [26, 20, 18, 30])


def _agreements(sheet: Worksheet, book: ExportWorkbook) -> None:
    _title(sheet, "Agreements", AGREEMENT_HEAD)
    for row in book.agreements:
        balance = row.agreed_amount - row.paid_amount
        sheet.append(
            [
                row.vendor,
                row.description,
                major(row.agreed_amount, book.exponent),
                major(row.paid_amount, book.exponent),
                major(balance, book.exponent),
                "",
            ]
        )
    _widths(sheet, [26, 34, 15, 15, 15, 30])
    _format(sheet, money=[2, 3, 4], money_format=_money_format(book))


def _prices(sheet: Worksheet, book: ExportWorkbook) -> None:
    _title(sheet, "Item prices", PRICE_HEAD)
    for row in book.prices:
        rate = "" if row.unit_rate is None else major(row.unit_rate, book.exponent)
        sheet.append([row.name, row.unit, rate, row.vendor, row.spent_on])
    _widths(sheet, [28, 16, 15, 26, 16])
    _format(sheet, money=[2], dates=[4], money_format=_money_format(book))


def _attachments(sheet: Worksheet, book: ExportWorkbook) -> None:
    _title(sheet, "Attachments (files are not included in this workbook)", ATTACHMENT_HEAD)
    for row in book.attachments:
        sheet.append([row.filename, row.expense_description, row.byte_size, row.checksum])
    _widths(sheet, [30, 34, 16, 66])


INSTRUCTIONS = [
    "Setout import template",
    "",
    "Setout recognises each sheet by its header row. Do not change the header rows.",
    "Add rows below the header row. Delete any sheet you do not need.",
    "",
    "Budget: a cost code ending in 000 is a category. Any other cost code is a budget line",
    "in the category above it. For example, 3000 is a category and 3001 is a line in it.",
    "Category rows create categories. Their amounts are ignored: each category total is",
    "calculated from its lines.",
    "",
    "The Budget column is the amount that is imported. To set a cost type, also enter",
    "the amount in the Labour Costs, Material Costs or Fixed Costs column.",
    "",
    "Expenses: each row is one expense. The cost code sets the category.",
    "A row with no cost code is imported as uncategorised.",
    "",
    "Enter amounts as plain numbers, without currency symbols or thousands separators.",
    "Enter dates in any format the spreadsheet recognises.",
    "",
    "Budget rows do not create expenses, and expense rows do not create budget lines.",
    "",
    "The last four sheets are included in Setout exports for reference only.",
    "They are not imported, so leave them empty.",
]


def example_book(currency_code: str = "NGN") -> ExportWorkbook:
    return ExportWorkbook(
        project_name="Jacaranda Close, Ewuru",
        exponent=2,
        currency_code=currency_code,
        categories=[
            BudgetCategory(
                code="1000",
                name="Administrative expenses",
                lines=[
                    BudgetLine("1001", "Drawings and permits", 120_000_00, "fixed"),
                    BudgetLine("1002", "Beacons", 30_000_00, "material"),
                ],
            ),
            BudgetCategory(
                code="2000",
                name="Concrete foundation",
                lines=[
                    BudgetLine("2001", "Sand and cement", 450_000_00, "material"),
                    BudgetLine("2002", "Block work", 180_000_00, "labour"),
                ],
            ),
        ],
        vendors=[
            VendorRow(
                name="Corner Depot Cement",
                trade="Building materials",
                contact_name="Mr Sola",
                phone="0800 000 0002",
                email="sales@cornerdepot.example",
                notes="Same-day delivery",
            ),
            VendorRow(
                name="Kunle Bricklaying",
                trade="Block work",
                contact_name="Kunle",
                phone="0800 000 0001",
                email="",
                notes="Fixed price for the whole job",
            ),
        ],
        expenses=[
            ExpenseRow(
                vendor="Corner Depot Cement",
                code="2001",
                description="17 bags of cement",
                spent_on=date(2026, 6, 11),
                amount=76_500_00,
                attachment="receipt-11jun.jpg",
                paid_by="Aunty Ngozi",
                notes="Bought on site",
            ),
            ExpenseRow(
                vendor="Kunle Bricklaying",
                code="2002",
                description="Block work, first payment",
                spent_on=date(2026, 7, 2),
                amount=60_000_00,
                attachment="",
                paid_by="",
                notes="",
            ),
            ExpenseRow(
                vendor="",
                code="",
                description="Nails and sundries",
                spent_on=date(2026, 7, 18),
                amount=8_400_00,
                attachment="",
                paid_by="",
                notes="No cost code, so this is imported as uncategorised",
            ),
        ],
        outstanding=[
            OutstandingRow(
                description="20 lengths of reinforcement",
                vendor="Corner Depot Cement",
                expected="this week",
                received_on=None,
            )
        ],
        people=[
            PersonRow(
                name="Aunty Ngozi",
                role="Site purchasing",
                phone="0800 000 0003",
                notes="Receives advances for small purchases",
            )
        ],
        agreements=[
            AgreementRow(
                vendor="Kunle Bricklaying",
                description="Block work, whole job",
                agreed_amount=180_000_00,
                paid_amount=60_000_00,
            )
        ],
        prices=[
            PriceRow(
                name="Cement",
                unit="per bag",
                unit_rate=4_500_00,
                vendor="Corner Depot Cement",
                spent_on=date(2026, 6, 11),
            )
        ],
        attachments=[
            AttachmentRow(
                filename="receipt-11jun.jpg",
                expense_description="17 bags of cement",
                byte_size=248_512,
                checksum="0" * 64,
            )
        ],
    )


def template(filled: bool = False) -> bytes:
    book = (
        example_book()
        if filled
        else ExportWorkbook(
            project_name="Your project", exponent=2, currency_code="Enter a currency code"
        )
    )
    wb = compose(book)

    instructions_sheet = wb.create_sheet("Instructions", 0)
    for line in INSTRUCTIONS:
        instructions_sheet.append([line])
    instructions_sheet["A1"].font = TITLE_FONT
    _widths(instructions_sheet, [96])

    return as_bytes(wb)


def as_csv(rows: list[list[object]]) -> bytes:
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    for row in rows:
        writer.writerow(["" if cell is None else cell for cell in row])
    return out.getvalue().encode("utf-8-sig")


def budget_csv(filled: bool = False) -> bytes:
    rows: list[list[object]] = [list(BUDGET_HEAD)]
    if filled:
        for category in example_book().categories:
            rows.append(
                [category.code, category.name, "", "", "", major(category.budgeted_amount, 2)]
            )
            for line in category.lines:
                cost_type_cells: list[object] = ["", "", ""]
                if line.cost_type in COST_COLUMN:
                    cost_type_cells[COST_COLUMN[line.cost_type]] = major(line.budgeted_amount, 2)
                rows.append(
                    [line.code, line.name, *cost_type_cells, major(line.budgeted_amount, 2)]
                )
    return as_csv(rows)


def expenses_csv(filled: bool = False) -> bytes:
    rows: list[list[object]] = [list(EXPENSE_HEAD)]
    if filled:
        for row in example_book().expenses:
            rows.append(
                [
                    "",
                    row.vendor,
                    row.code,
                    row.description,
                    row.spent_on,
                    major(row.amount, 2),
                    row.attachment,
                    row.paid_by,
                    "Yes",
                    row.spent_on,
                    row.notes,
                ]
            )
    return as_csv(rows)


def filename_for(project_name: str, when: datetime) -> str:
    keep = [c if c.isalnum() or c in " -_" else "" for c in project_name]
    stem = "".join(keep).strip().replace(" ", "-").lower() or "project"
    return f"setout-{stem}-{when:%Y%m%d}.xlsx"


SAMPLES: dict[str, tuple[str, str]] = {
    "blank": ("setout-blank-sheet.xlsx", XLSX_TYPE),
    "example": ("setout-example-sheet.xlsx", XLSX_TYPE),
    "budget-csv": ("setout-budget-example.csv", "text/csv"),
    "spending-csv": ("setout-spending-example.csv", "text/csv"),
}


def sample(kind: str) -> bytes:
    if kind == "example":
        return template(filled=True)
    if kind == "budget-csv":
        return budget_csv(filled=True)
    if kind == "spending-csv":
        return expenses_csv(filled=True)
    return template()
