from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from enum import StrEnum


class ProblemKind(StrEnum):
    BEFORE_FIRST_CATEGORY = "before_first_category"
    NO_DESCRIPTION = "no_description"
    MULTIPLE_CODES = "multiple_codes"
    NOT_PAID = "not_paid"


@dataclass
class Problem:
    kind: ProblemKind
    row: int
    detail: str


@dataclass
class BudgetedLine:
    row: int
    code: str
    description: str
    budgeted_amount: int
    cost_type: str | None = None


@dataclass
class BudgetedCategory:
    row: int
    code: str
    name: str
    lines: list[BudgetedLine] = field(default_factory=list)
    parent_code: str = ""

    @property
    def budgeted_amount(self) -> int:
        return sum(line.budgeted_amount for line in self.lines)


@dataclass
class ParsedBudget:
    categories: list[BudgetedCategory] = field(default_factory=list)
    problems: list[Problem] = field(default_factory=list)
    # Rows with a cost code and nothing else: placeholder lines in the source sheet.
    blank_rows: int = 0

    @property
    def budgeted_amount(self) -> int:
        return sum(category.budgeted_amount for category in self.categories)


@dataclass
class VendorLine:
    row: int
    name: str
    trade: str
    contact_name: str
    phone: str
    email: str
    notes: str


@dataclass
class ParsedVendors:
    vendors: list[VendorLine] = field(default_factory=list)
    problems: list[Problem] = field(default_factory=list)


@dataclass
class ExpenseLine:
    row: int
    description: str
    amount: int
    spent_on: date | None
    codes: list[str]
    vendor: str
    paid_by: str
    paid: bool
    notes: str
    cost_type: str | None = None
    quantity: Decimal | None = None
    unit_rate: int | None = None
    item: str = ""
    unit: str = ""


@dataclass
class ParsedExpenses:
    expenses: list[ExpenseLine] = field(default_factory=list)
    problems: list[Problem] = field(default_factory=list)

    @property
    def amount(self) -> int:
        return sum(line.amount for line in self.expenses)


@dataclass
class OutstandingLine:
    row: int
    description: str
    vendor: str
    quantity: str
    received: bool
    expected: str = ""


@dataclass
class ParsedOutstanding:
    outstanding: list[OutstandingLine] = field(default_factory=list)
    problems: list[Problem] = field(default_factory=list)
