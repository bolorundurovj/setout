from __future__ import annotations

from dataclasses import dataclass, field

from setout.services.sheets import (
    detect,
    read_budget,
    read_expenses,
    read_outstanding,
    read_vendors,
    workbook,
)
from setout.services.sheets.detect import SheetKind
from setout.services.sheets.parsed import (
    ParsedBudget,
    ParsedExpenses,
    ParsedOutstanding,
    ParsedVendors,
    Problem,
)

UNIMPORTED_COLUMNS = {
    SheetKind.BUDGET: [
        "Labour, Material and Fixed Costs: each budget line stores one amount, not a split",
        "Actual Cost, Under/Over and Delta: Setout calculates these from expenses",
    ],
    SheetKind.EXPENSES: ["Attachment: only the file name is imported, not the file"],
}
UNIMPORTED_IF_PRESENT = {
    SheetKind.OUTSTANDING: {"expected": "Expected", "location": "Location"},
}


@dataclass
class ParsedWorkbook:
    sheets_read: list[tuple[str, str, int]] = field(default_factory=list)
    skipped: list[tuple[str, str]] = field(default_factory=list)
    budget: ParsedBudget = field(default_factory=ParsedBudget)
    vendors: ParsedVendors = field(default_factory=ParsedVendors)
    expenses: ParsedExpenses = field(default_factory=ParsedExpenses)
    outstanding: ParsedOutstanding = field(default_factory=ParsedOutstanding)
    unimported_columns: list[str] = field(default_factory=list)

    @property
    def problems(self) -> list[Problem]:
        return [
            *self.budget.problems,
            *self.vendors.problems,
            *self.expenses.problems,
            *self.outstanding.problems,
        ]


def parse_workbook(sheets: list[workbook.Sheet], exponent: int) -> ParsedWorkbook:
    detection = detect.detect_sheets(sheets)
    out = ParsedWorkbook(skipped=list(detection.skipped))

    for hit in detection.detected:
        rows = sum(
            1
            for row in hit.sheet.rows[hit.header_row + 1 :]
            if any(cell not in (None, "") for cell in row)
        )
        out.sheets_read.append((hit.sheet.name, str(hit.kind), rows))
        out.unimported_columns.extend(UNIMPORTED_COLUMNS.get(hit.kind, []))
        out.unimported_columns.extend(
            label
            for name, label in UNIMPORTED_IF_PRESENT.get(hit.kind, {}).items()
            if name in hit.columns
        )

        if hit.kind is SheetKind.BUDGET:
            out.budget = read_budget.read(hit, exponent)
        elif hit.kind is SheetKind.VENDORS:
            out.vendors = read_vendors.read(hit)
        elif hit.kind is SheetKind.EXPENSES:
            out.expenses = read_expenses.read(hit, exponent)
        elif hit.kind is SheetKind.OUTSTANDING:
            out.outstanding = read_outstanding.read(hit)

    return out
