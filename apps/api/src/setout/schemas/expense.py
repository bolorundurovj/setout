from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from setout.models.expense import CostType
from setout.schemas.decimals import PlainDecimal


class ExpenseCreate(BaseModel):
    description: str = Field(..., min_length=1, max_length=255)
    amount: int | None = Field(
        None,
        ge=0,
        description="Minor units. Derived when both quantity and unit rate are given",
    )
    spent_on: date | None = Field(None, description="Defaults to today")
    scope_id: str | None = Field(None, description="Leave empty to file it later")
    item_id: str | None = Field(None, description="What was bought, to build its price history")
    vendor_id: str | None = Field(None, description="Who it was bought from")
    agreement_id: str | None = Field(None, description="A part payment against what was agreed")
    paid_by_id: str | None = Field(None, description="Who handed over the money")
    quantity: Decimal | None = Field(None, gt=0, max_digits=12, decimal_places=3)
    unit_rate: int | None = Field(None, ge=0, description="Minor units")
    cost_type: CostType | None = None
    notes: str | None = None
    auto_scope: bool = Field(True, description="Let history choose the scope when none is given")


class ExpenseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str | None = Field(None, min_length=1, max_length=255)
    amount: int | None = Field(None, ge=0)
    spent_on: date | None = None
    scope_id: str | None = None
    item_id: str | None = None
    vendor_id: str | None = None
    agreement_id: str | None = None
    paid_by_id: str | None = None
    quantity: Decimal | None = Field(None, gt=0, max_digits=12, decimal_places=3)
    unit_rate: int | None = Field(None, ge=0)
    cost_type: CostType | None = None
    notes: str | None = None


class ScopeSuggestion(BaseModel):
    scope_id: str | None = Field(None, description="The scope that past purchases used most often")
    reason: str | None = Field(None, description="Why this scope was suggested")


class ExpenseRead(BaseModel):
    id: str
    project_id: str
    scope_id: str | None
    item_id: str | None
    vendor_id: str | None
    agreement_id: str | None
    paid_by_id: str | None
    spent_on: date
    description: str
    quantity: PlainDecimal | None
    unit_rate: int | None
    amount: int
    cost_type: CostType | None
    notes: str | None
    attachment_count: int = Field(..., description="How many files are kept beside it")
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class ExpensePage(BaseModel):
    items: list[ExpenseRead]
    total: int
    limit: int
    offset: int


class MonthScopeSpend(BaseModel):
    scope_id: str | None = Field(..., description="Null for spend that reached no scope")
    name: str
    amount: int


class MonthSpend(BaseModel):
    month: str = Field(..., description="Calendar month as YYYY-MM")
    amount: int
    expense_count: int
    scopes: list[MonthScopeSpend] = Field(
        ..., description="Split by the scope at the top of each branch, in budget order"
    )


class ProjectMonths(BaseModel):
    project_id: str
    currency_code: str
    currency_exponent: int
    total_amount: int
    months: list[MonthSpend] = Field(
        ..., description="Oldest first. A month with nothing spent in it is left out"
    )
    busiest_month: str | None = Field(..., description="Null until something has been spent")


class ProjectSpend(BaseModel):
    project_id: str
    currency_code: str
    currency_exponent: int
    planned_amount: int
    spent_amount: int
    unfiled_amount: int
    unfiled_count: int
    removed_count: int = Field(..., description="Expenses taken off the record, in no total")
    variance_percent: float | None = Field(
        ..., description="Null when there is no budget to compare against, never infinity"
    )
