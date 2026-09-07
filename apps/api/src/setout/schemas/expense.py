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
    category_id: str | None = Field(None, description="Leave empty to file it later")
    item_id: str | None = Field(None, description="What was bought, to build its price history")
    vendor_id: str | None = Field(None, description="Who it was bought from")
    agreement_id: str | None = Field(None, description="A part payment against what was agreed")
    paid_by_id: str | None = Field(None, description="Who paid")
    quantity: Decimal | None = Field(None, gt=0, max_digits=12, decimal_places=3)
    unit_rate: int | None = Field(None, ge=0, description="Minor units")
    cost_type: CostType | None = None
    notes: str | None = None
    auto_categorize: bool = Field(
        True, description="Use past purchases to choose the category when none is given"
    )


class ExpenseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str | None = Field(None, min_length=1, max_length=255)
    amount: int | None = Field(None, ge=0)
    spent_on: date | None = None
    category_id: str | None = None
    item_id: str | None = None
    vendor_id: str | None = None
    agreement_id: str | None = None
    paid_by_id: str | None = None
    quantity: Decimal | None = Field(None, gt=0, max_digits=12, decimal_places=3)
    unit_rate: int | None = Field(None, ge=0)
    cost_type: CostType | None = None
    notes: str | None = None


class CategorySuggestion(BaseModel):
    category_id: str | None = Field(None, description="The category past purchases used most often")
    reason: str | None = Field(None, description="Why this category was suggested")


class BulkFileExpenses(BaseModel):
    expense_ids: list[str] = Field(
        ..., min_length=1, description="Uncategorized expenses to assign"
    )
    category_id: str = Field(..., description="The category they should all be assigned to")


class BulkFileResult(BaseModel):
    filed_count: int = Field(..., description="How many uncategorized expenses were assigned")


class ExpenseRead(BaseModel):
    id: str
    project_id: str
    category_id: str | None
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
    attachment_count: int = Field(..., description="How many files are attached")
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class ExpensePage(BaseModel):
    items: list[ExpenseRead]
    total: int
    limit: int
    offset: int


class MonthCategorySpend(BaseModel):
    category_id: str | None = Field(..., description="Null for expenses with no category")
    name: str
    amount: int


class MonthSpend(BaseModel):
    month: str = Field(..., description="Calendar month as YYYY-MM")
    amount: int
    expense_count: int
    categories: list[MonthCategorySpend] = Field(
        ..., description="Split by the top-level category, in budget order"
    )


class ProjectMonths(BaseModel):
    project_id: str
    currency_code: str
    currency_exponent: int
    total_amount: int
    months: list[MonthSpend] = Field(
        ..., description="Oldest first. Months with no expenses are omitted"
    )
    busiest_month: str | None = Field(..., description="Null until something has been spent")


class ProjectSpend(BaseModel):
    project_id: str
    currency_code: str
    currency_exponent: int
    budgeted_amount: int
    spent_amount: int
    uncategorized_amount: int
    uncategorized_count: int
    removed_count: int = Field(..., description="Expenses taken off the record, in no total")
    variance_percent: float | None = Field(
        ..., description="Null when there is no budget to compare against, never infinity"
    )
