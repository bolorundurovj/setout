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
from setout.services.sheets.detect import Shape
from setout.services.sheets.parsed import BudgetRead, OwedRead, Problem, SpendRead, VendorsRead

# Columns Setout keeps nowhere, named in the report rather than dropped in silence.
LEFT_BEHIND = {
    Shape.BUDGET: [
        "Labor, Material and Fixed Costs: the plan holds one figure per line, not a split by kind",
        "Actual Cost, Under/Over and Delta: Setout works these out from the spend",
    ],
    Shape.EXPENSES: ["Documents: the file itself is not in the workbook, only its name"],
    Shape.OUTSTANDING: ["Location"],
}


@dataclass
class Gathered:
    """Everything the file holds, read but not yet written anywhere."""

    read: list[tuple[str, str, int]] = field(default_factory=list)
    skipped: list[tuple[str, str]] = field(default_factory=list)
    budget: BudgetRead = field(default_factory=BudgetRead)
    vendors: VendorsRead = field(default_factory=VendorsRead)
    spend: SpendRead = field(default_factory=SpendRead)
    owed: OwedRead = field(default_factory=OwedRead)
    left_behind: list[str] = field(default_factory=list)

    @property
    def problems(self) -> list[Problem]:
        return [
            *self.budget.problems,
            *self.vendors.problems,
            *self.spend.problems,
            *self.owed.problems,
        ]


def gather(sheets: list[workbook.Sheet], exponent: int) -> Gathered:
    """The plan comes only from a budget sheet and the spend only from an invoices one."""
    seen = detect.find(sheets)
    out = Gathered(skipped=list(seen.skipped))

    for hit in seen.found:
        rows = sum(
            1
            for row in hit.sheet.rows[hit.header_row + 1 :]
            if any(cell not in (None, "") for cell in row)
        )
        out.read.append((hit.sheet.name, str(hit.shape), rows))
        out.left_behind.extend(LEFT_BEHIND.get(hit.shape, []))

        if hit.shape is Shape.BUDGET:
            out.budget = read_budget.read(hit, exponent)
        elif hit.shape is Shape.VENDORS:
            out.vendors = read_vendors.read(hit)
        elif hit.shape is Shape.EXPENSES:
            out.spend = read_expenses.read(hit, exponent)
        elif hit.shape is Shape.OUTSTANDING:
            out.owed = read_outstanding.read(hit)

    return out
