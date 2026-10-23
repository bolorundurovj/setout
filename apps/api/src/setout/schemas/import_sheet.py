from __future__ import annotations

from datetime import date
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class DecisionKind(StrEnum):
    NEW_CATEGORIES = "new_categories"
    SEVERAL_CODES = "several_codes"
    UNPAID = "unpaid"
    NO_DESCRIPTION = "no_description"
    ABOVE_ANY_CATEGORY = "above_any_category"
    OUTSTANDING_NOT_IMPORTABLE = "outstanding_not_importable"
    DUPLICATES = "duplicates"


class SheetSeen(BaseModel):
    name: str
    holds: str
    rows: int


class SheetSkipped(BaseModel):
    name: str
    why: str


class CategoryMatch(BaseModel):
    code: str
    name: str
    lines: int
    budgeted_amount: int
    matched_to: str | None = Field(None, description="Name of the existing category, if any")


class Decision(BaseModel):
    kind: DecisionKind
    count: int
    detail: str
    amount: int = 0
    blocking: bool = False


class SampleRow(BaseModel):
    spent_on: date | None
    description: str
    category: str
    amount: int


class Answers(BaseModel):
    """Choices for the issues raised in the import preview."""

    model_config = ConfigDict(extra="forbid")

    create_missing_categories: bool = True
    skip_duplicates: bool = True
    take_unpaid: bool = True
    # For rows with several cost codes: "first" uses the first code, "uncategorised"
    # leaves the row without a category.
    several_codes: str = Field("first", pattern="^(first|uncategorised)$")


class ImportReport(BaseModel):
    project_id: str | None
    project_name: str
    currency_code: str
    currency_exponent: int
    read: list[SheetSeen]
    skipped: list[SheetSkipped]
    categories: list[CategoryMatch]
    budgeted_amount: int
    budgeted_lines: int
    expense_rows: int
    spent_amount: int
    vendors_new: int
    vendors_known: int
    outstanding_rows: int
    decisions: list[Decision]
    sample: list[SampleRow] = Field(
        ..., description="The first expense rows as they would be imported"
    )
    left_behind: list[str] = Field(
        ..., description="Columns in the spreadsheet that Setout does not store"
    )


class ImportResult(BaseModel):
    project_id: str
    project_name: str
    category_count: int
    budget_item_count: int
    budgeted_amount: int
    expense_count: int
    spent_amount: int
    vendor_count: int
    person_count: int
    skipped_duplicates: int
