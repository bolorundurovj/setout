from __future__ import annotations

import io
from dataclasses import dataclass, field
from datetime import date
from functools import cache
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    CondPageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
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


# The light theme tokens from apps/web/src/styles.scss.
INK = colors.HexColor("#1e2226")
INK_2 = colors.HexColor("#5c646d")
INK_3 = colors.HexColor("#666e77")
ACCENT = colors.HexColor("#22797b")
DANGER = colors.HexColor("#c0614c")
HAIRLINE = colors.HexColor("#dfe3e8")
FIELD = colors.HexColor("#f1f3f6")
SURFACE = colors.HexColor("#fbfcfd")

FONTS = Path(__file__).resolve().parent.parent / "assets" / "fonts"
SANS, SANS_MEDIUM, MONO, MONO_MEDIUM = "DMSans", "DMSans-Medium", "DMMono", "DMMono-Medium"

MARGIN = 18 * mm
# SimpleDocTemplate's frame insets its content by 6pt on each side.
FRAME_PADDING = 6
HEADER_HEIGHT = 16 * mm
NUMERIC_WIDTH = 30 * mm


@cache
def register_fonts() -> None:
    for name, file in [
        (SANS, "DMSans-Regular.ttf"),
        (SANS_MEDIUM, "DMSans-Medium.ttf"),
        (MONO, "DMMono-Regular.ttf"),
        (MONO_MEDIUM, "DMMono-Medium.ttf"),
    ]:
        pdfmetrics.registerFont(TTFont(name, str(FONTS / file)))


def draw_logo(canvas: Canvas, x: float, y: float, size: float) -> None:
    """Draws apps/web/public/logo.svg with its bottom-left corner at (x, y)."""
    unit = size / 44
    canvas.saveState()
    canvas.setFillColor(ACCENT)
    canvas.roundRect(x, y, size, size, 14 * unit, stroke=0, fill=1)
    canvas.setStrokeColor(SURFACE)
    canvas.setLineWidth(2 * unit)
    # SVG y runs downwards: the frame spans 13.5 to 30.5 from the top.
    canvas.roundRect(
        x + 11 * unit, y + 13.5 * unit, 22 * unit, 17 * unit, 2 * unit, stroke=1, fill=0
    )
    canvas.setFillColor(DANGER)
    canvas.circle(x + 33 * unit, y + 13.5 * unit, 4 * unit, stroke=0, fill=1)
    canvas.restoreState()


class NumberedCanvas(Canvas):  # type: ignore[misc]  # reportlab ships no type hints
    """Holds every page until the end so each footer can show the page count."""

    project_name = ""
    generated_on = ""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._pages: list[dict[str, Any]] = []

    def showPage(self) -> None:  # noqa: N802
        self._pages.append(dict(self.__dict__))
        self._startPage()

    def save(self) -> None:
        total = len(self._pages)
        for number, state in enumerate(self._pages, start=1):
            self.__dict__.update(state)
            self._frame(number, total)
            super().showPage()
        super().save()

    def _frame(self, number: int, total: int) -> None:
        width, height = self._pagesize
        left, right = MARGIN + FRAME_PADDING, width - MARGIN - FRAME_PADDING
        top = height - MARGIN + 4 * mm
        draw_logo(self, left, top - 7 * mm, 7 * mm)
        self.setFillColor(INK)
        self.setFont(SANS_MEDIUM, 11)
        self.drawString(left + 9.5 * mm, top - 4.6 * mm, "Setout")
        self.setFillColor(INK_2)
        self.setFont(SANS, 9)
        self.drawRightString(right, top - 4.6 * mm, self.project_name)
        self.setStrokeColor(HAIRLINE)
        self.setLineWidth(0.6)
        self.line(left, top - 10 * mm, right, top - 10 * mm)

        bottom = MARGIN - 8 * mm
        self.line(left, bottom + 5 * mm, right, bottom + 5 * mm)
        self.setFillColor(INK_3)
        self.setFont(MONO, 8)
        self.drawString(left, bottom, f"Generated on {self.generated_on}")
        self.drawRightString(right, bottom, f"Page {number} of {total}")


def render(report: ProjectReport) -> bytes:
    register_fonts()
    out = io.BytesIO()
    doc = SimpleDocTemplate(
        out,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN + HEADER_HEIGHT - 6 * mm,
        bottomMargin=MARGIN + 2 * mm,
        title=f"{report.project_name}: project report",
        author="Setout",
        creator="Setout",
    )
    title = ParagraphStyle("Title", fontName=SANS_MEDIUM, fontSize=20, leading=24, textColor=INK)
    meta = ParagraphStyle("Meta", fontName=SANS, fontSize=9.5, leading=13, textColor=INK_2)
    heading = ParagraphStyle(
        "Heading",
        fontName=SANS_MEDIUM,
        fontSize=12,
        leading=15,
        textColor=INK,
        spaceBefore=8 * mm,
        spaceAfter=2.5 * mm,
    )
    body = ParagraphStyle("Body", fontName=SANS, fontSize=9, leading=12, textColor=INK)
    note = ParagraphStyle("Note", parent=body, textColor=INK_2, spaceBefore=2 * mm)
    cell = ParagraphStyle("Cell", parent=body)
    micro = ParagraphStyle("Micro", fontName=SANS_MEDIUM, fontSize=7, leading=9, textColor=INK_3)
    figure = ParagraphStyle("Figure", fontName=MONO, fontSize=13, leading=16, textColor=INK)

    width = doc.width - 2 * FRAME_PADDING

    def money(minor: int) -> str:
        return f"{major(minor, report.exponent):,.{report.exponent}f}"

    def table(
        head: list[str],
        rows: list[list[str]],
        numeric_from: int,
        negative: list[tuple[int, int]] | None = None,
    ) -> Table:
        numeric_count = len(head) - numeric_from
        text_width = (width - numeric_count * NUMERIC_WIDTH) / max(numeric_from, 1)
        widths = [text_width] * numeric_from + [NUMERIC_WIDTH] * numeric_count
        # Text columns are Paragraphs so that long descriptions wrap inside the page width.
        wrapped = [
            [
                Paragraph(escape(value), cell) if index < numeric_from else value
                for index, value in enumerate(row)
            ]
            for row in rows
        ]
        grid = Table(
            [[label.upper() for label in head], *wrapped],
            colWidths=widths,
            repeatRows=1,
            hAlign="LEFT",
        )
        style: list[tuple[Any, ...]] = [
            ("FONTNAME", (0, 0), (-1, 0), SANS_MEDIUM),
            ("FONTSIZE", (0, 0), (-1, 0), 7),
            ("TEXTCOLOR", (0, 0), (-1, 0), INK_3),
            ("BACKGROUND", (0, 0), (-1, 0), FIELD),
            ("FONTNAME", (numeric_from, 1), (-1, -1), MONO),
            ("FONTSIZE", (0, 1), (-1, -1), 9),
            ("TEXTCOLOR", (0, 1), (-1, -1), INK),
            ("LINEBELOW", (0, 0), (-1, -1), 0.6, HAIRLINE),
            ("ALIGN", (numeric_from, 0), (-1, -1), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]
        for column, row in negative or []:
            style.append(("TEXTCOLOR", (column, row + 1), (column, row + 1), DANGER))
        grid.setStyle(TableStyle(style))
        return grid

    def section(title_text: str, content: Flowable | None, empty: str) -> list[Flowable]:
        # Starts the section on a new page when too little room is left for its first rows.
        return [
            CondPageBreak(40 * mm),
            Paragraph(title_text, heading),
            content or Paragraph(empty, note),
        ]

    remaining = report.budgeted_amount - report.spent_amount
    used = f"{report.spent_amount / report.budgeted_amount:.0%}" if report.budgeted_amount else "-"
    tiles = [
        ("Budgeted", money(report.budgeted_amount), INK),
        ("Spent", money(report.spent_amount), INK),
        (
            "Remaining" if remaining >= 0 else "Over budget by",
            money(abs(remaining)),
            INK if remaining >= 0 else DANGER,
        ),
        ("Used", used, INK if remaining >= 0 else DANGER),
    ]
    summary = Table(
        [
            [Paragraph(label.upper(), micro) for label, _, _ in tiles],
            [
                Paragraph(value, ParagraphStyle("Tile", parent=figure, textColor=tint))
                for _, value, tint in tiles
            ],
        ],
        colWidths=[width / 4] * 4,
        hAlign="LEFT",
    )
    summary.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), FIELD),
                ("LINEAFTER", (0, 0), (-2, -1), 0.6, HAIRLINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, 0), 8),
                ("BOTTOMPADDING", (0, -1), (-1, -1), 9),
            ]
        )
    )

    land = f"Land record: {escape(report.land_name)} · " if report.land_name else ""
    story: list[Flowable] = [
        Paragraph(escape(report.project_name), title),
        Paragraph(f"{land}Project report · Amounts in {report.currency_code}", meta),
        Spacer(1, 6 * mm),
        summary,
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
            negative=[
                (2, index)
                for index, line in enumerate(report.categories)
                if line.spent_amount > line.budgeted_amount
            ],
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
    story += section(
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
            negative=[
                (3, index) for index, line in enumerate(report.advances) if line.balance_amount < 0
            ],
        )
        if report.advances
        else None,
        "No advances.",
    )
    if report.advances:
        story.append(
            Paragraph(
                "A positive balance is unspent money the person holds. "
                "A negative balance is money owed to the person.",
                note,
            )
        )
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
            numeric_from=2,
        )
        if report.outstanding
        else None,
        "No outstanding deliveries.",
    )

    class Frame(NumberedCanvas):
        project_name = report.project_name
        generated_on = f"{report.generated_on:%d %b %Y}"

    doc.build(story, canvasmaker=Frame)
    return out.getvalue()
