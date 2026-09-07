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
    OWED_NOT_IMPORTABLE = "owed_not_importable"
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
    """What to do about everything the report raised."""

    model_config = ConfigDict(extra="forbid")

    create_missing_categories: bool = True
    skip_duplicates: bool = True
    take_unpaid: bool = True
    # Where a row names several cost codes: "first" files it under the first,
    # "uncategorized" leaves it against no category at all.
    several_codes: str = Field("first", pattern="^(first|uncategorized)$")


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
    spend_rows: int
    spend_amount: int
    vendors_new: int
    vendors_known: int
    owed_rows: int
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
    categories: int
    budget_items: int
    budgeted_amount: int
    expenses: int
    spend_amount: int
    vendors: int
    people: int
    skipped_duplicates: int
