from __future__ import annotations

from datetime import date
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class DecisionKind(StrEnum):
    NEW_SCOPES = "new_scopes"
    SEVERAL_CODES = "several_codes"
    UNPAID = "unpaid"
    NO_DESCRIPTION = "no_description"
    ABOVE_ANY_SCOPE = "above_any_scope"
    OWED_NOT_IMPORTABLE = "owed_not_importable"
    DUPLICATES = "duplicates"


class SheetSeen(BaseModel):
    name: str
    holds: str
    rows: int


class SheetSkipped(BaseModel):
    name: str
    why: str


class ScopeMatch(BaseModel):
    code: str
    name: str
    lines: int
    planned_amount: int
    matched_to: str | None = Field(None, description="Name of the scope already here, if any")


class Decision(BaseModel):
    kind: DecisionKind
    count: int
    detail: str
    amount: int = 0
    blocking: bool = False


class SampleRow(BaseModel):
    spent_on: date | None
    description: str
    scope: str
    amount: int


class Answers(BaseModel):
    """What to do about everything the report raised."""

    model_config = ConfigDict(extra="forbid")

    create_missing_scopes: bool = True
    skip_duplicates: bool = True
    take_unpaid: bool = True
    # Where a row names several cost codes: "first" files it under the first,
    # "unfiled" leaves it against no scope at all.
    several_codes: str = Field("first", pattern="^(first|unfiled)$")


class ImportReport(BaseModel):
    project_id: str | None
    project_name: str
    currency_code: str
    currency_exponent: int
    read: list[SheetSeen]
    skipped: list[SheetSkipped]
    scopes: list[ScopeMatch]
    planned_amount: int
    planned_lines: int
    spend_rows: int
    spend_amount: int
    vendors_new: int
    vendors_known: int
    owed_rows: int
    decisions: list[Decision]
    sample: list[SampleRow] = Field(..., description="The first spend rows as they would be filed")
    left_behind: list[str] = Field(
        ..., description="Columns the sheet holds that Setout keeps nowhere"
    )


class ImportResult(BaseModel):
    project_id: str
    project_name: str
    scopes: int
    budget_items: int
    planned_amount: int
    expenses: int
    spend_amount: int
    vendors: int
    people: int
    skipped_duplicates: int
