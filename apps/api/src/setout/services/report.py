from __future__ import annotations

import io
from dataclasses import dataclass, field
from datetime import date
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.platypus.flowables import Flowable

from setout.services.sheets.write import major


@dataclass
class CategoryLine:
    name: str
    budgeted_amount: int
    spent_amount: int


@dataclass
class CostTypeLine:
    name: str
    budgeted_amount: int
    spent_amount: int


@dataclass
class MonthLine:
    month: str
    amount: int
    expense_count: int


@dataclass
class AgreementLine:
    vendor_name: str
    description: str
    agreed_amount: int
    paid_amount: int
    balance_amount: int


@dataclass
class AdvanceLine:
    person_name: str
    advanced_amount: int
    spent_amount: int
    balance_amount: int


@dataclass
class OutstandingLine:
    description: str
    vendor_name: str
    expected: date | None
    amount: int


@dataclass
class ProjectReport:
    project_name: str
    land_name: str | None
    currency_code: str
    exponent: int
    generated_on: date
    budgeted_amount: int
    spent_amount: int
    categories: list[CategoryLine] = field(default_factory=list)
    cost_types: list[CostTypeLine] = field(default_factory=list)
    months: list[MonthLine] = field(default_factory=list)
    agreements: list[AgreementLine] = field(default_factory=list)
    advances: list[AdvanceLine] = field(default_factory=list)
    outstanding: list[OutstandingLine] = field(default_factory=list)


GRID = colors.HexColor("#d9d9d9")
HEAD = colors.HexColor("#f2f2f2")
NUMERIC_WIDTH = 30 * mm


def render(report: ProjectReport) -> bytes:
    out = io.BytesIO()
    doc = SimpleDocTemplate(
        out,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=f"{report.project_name}: project report",
        author="Setout",
    )
    styles = getSampleStyleSheet()
    heading = ParagraphStyle("Section", parent=styles["Heading2"], spaceBefore=8 * mm)
    body = styles["BodyText"]

    def money(minor: int) -> str:
        return f"{major(minor, report.exponent):,.{report.exponent}f}"

    cell = ParagraphStyle("Cell", parent=body, fontSize=9, leading=11)

    def table(head: list[str], rows: list[list[str]], numeric_from: int) -> Table:
        numeric_count = len(head) - numeric_from
        text_width = (doc.width - numeric_count * NUMERIC_WIDTH) / max(numeric_from, 1)
        widths = [text_width] * numeric_from + [NUMERIC_WIDTH] * numeric_count
        # Text columns are Paragraphs so that long descriptions wrap inside the page width.
        wrapped = [
            [
                Paragraph(escape(value), cell) if index < numeric_from else value
                for index, value in enumerate(row)
            ]
            for row in rows
        ]
        grid = Table([head, *wrapped], colWidths=widths, repeatRows=1, hAlign="LEFT")
        grid.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("BACKGROUND", (0, 0), (-1, 0), HEAD),
                    ("LINEBELOW", (0, 0), (-1, -1), 0.5, GRID),
                    ("ALIGN", (numeric_from, 0), (-1, -1), "RIGHT"),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        return grid

    def section(title: str, content: Flowable | None, empty: str) -> list[Flowable]:
        return [Paragraph(title, heading), content or Paragraph(empty, body)]

    remaining = report.budgeted_amount - report.spent_amount
    used = f"{report.spent_amount / report.budgeted_amount:.0%}" if report.budgeted_amount else "-"
    land = f"Land record: {escape(report.land_name)}. " if report.land_name else ""
    story: list[Flowable] = [
        Paragraph(escape(report.project_name), styles["Title"]),
        Paragraph(
            f"{land}Amounts in {report.currency_code}. "
            f"Generated on {report.generated_on:%d %b %Y}.",
            body,
        ),
        Spacer(1, 4 * mm),
        table(
            ["Budgeted", "Spent", "Remaining" if remaining >= 0 else "Over budget by", "Used"],
            [
                [
                    money(report.budgeted_amount),
                    money(report.spent_amount),
                    money(abs(remaining)),
                    used,
                ]
            ],
            numeric_from=0,
        ),
    ]

    story += section(
        "Budgeted and Spent by Category",
        table(
            ["Category", "Budgeted", "Spent"],
            [
                [line.name, money(line.budgeted_amount), money(line.spent_amount)]
                for line in report.categories
            ],
            numeric_from=1,
        )
        if report.categories
        else None,
        "No categories.",
    )
    story += section(
        "Budgeted and Spent by Cost Type",
        table(
            ["Cost Type", "Budgeted", "Spent"],
            [
                [line.name, money(line.budgeted_amount), money(line.spent_amount)]
                for line in report.cost_types
            ],
            numeric_from=1,
        )
        if report.cost_types
        else None,
        "No budget items or expenses.",
    )
    story += section(
        "Expenses by Month",
        table(
            ["Month", "Expenses", "Spent"],
            [
                [
                    date.fromisoformat(f"{line.month}-01").strftime("%b %Y"),
                    str(line.expense_count),
                    money(line.amount),
                ]
                for line in report.months
            ],
            numeric_from=1,
        )
        if report.months
        else None,
        "No expenses.",
    )
    story += section(
        "Agreements",
        table(
            ["Vendor", "Description", "Agreed Amount", "Paid", "Balance"],
            [
                [
                    line.vendor_name,
                    line.description,
                    money(line.agreed_amount),
                    money(line.paid_amount),
                    money(line.balance_amount),
                ]
                for line in report.agreements
            ],
            numeric_from=2,
        )
        if report.agreements
        else None,
        "No agreements.",
    )
    advances: list[Flowable] = section(
        "Advances",
        table(
            ["Person", "Advanced", "Spent", "Balance"],
            [
                [
                    line.person_name,
                    money(line.advanced_amount),
                    money(line.spent_amount),
                    money(line.balance_amount),
                ]
                for line in report.advances
            ],
            numeric_from=1,
        )
        if report.advances
        else None,
        "No advances.",
    )
    if report.advances:
        advances.append(
            Paragraph(
                "A positive balance is unspent money the person holds. "
                "A negative balance is money owed to the person.",
                styles["Italic"],
            )
        )
    story += advances
    story += section(
        "Outstanding Deliveries",
        table(
            ["Description", "Vendor", "Expected", "Amount"],
            [
                [
                    line.description,
                    line.vendor_name,
                    f"{line.expected:%d %b %Y}" if line.expected else "",
                    money(line.amount),
                ]
                for line in report.outstanding
            ],
            numeric_from=3,
        )
        if report.outstanding
        else None,
        "No outstanding deliveries.",
    )

    doc.build(story)
    return out.getvalue()
