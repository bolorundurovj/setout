from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from enum import StrEnum


class Trouble(StrEnum):
    NO_CATEGORY_YET = "no_category_yet"
    NO_DESCRIPTION = "no_description"
    SEVERAL_CODES = "several_codes"
    NOT_PAID = "not_paid"


@dataclass
class Problem:
    kind: Trouble
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

    @property
    def budgeted_amount(self) -> int:
        return sum(line.budgeted_amount for line in self.lines)


@dataclass
class BudgetRead:
    categories: list[BudgetedCategory] = field(default_factory=list)
    problems: list[Problem] = field(default_factory=list)
    # Rows carrying nothing but a code, which the sheet keeps as spare lines.
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
class VendorsRead:
    vendors: list[VendorLine] = field(default_factory=list)
    problems: list[Problem] = field(default_factory=list)


@dataclass
class SpendLine:
    row: int
    description: str
    amount: int
    spent_on: date | None
    codes: list[str]
    vendor: str
    paid_by: str
    paid: bool
    notes: str


@dataclass
class SpendRead:
    spend: list[SpendLine] = field(default_factory=list)
    problems: list[Problem] = field(default_factory=list)

    @property
    def amount(self) -> int:
        return sum(line.amount for line in self.spend)


@dataclass
class OwedLine:
    row: int
    description: str
    vendor: str
    quantity: str
    resolved: bool


@dataclass
class OwedRead:
    owed: list[OwedLine] = field(default_factory=list)
    problems: list[Problem] = field(default_factory=list)
