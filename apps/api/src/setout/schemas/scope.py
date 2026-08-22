from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from setout.models.expense import CostType


class ScopePresetRead(BaseModel):
    id: str
    name: str
    sort_order: int

    model_config = ConfigDict(from_attributes=True)


class ScopeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    code: str | None = Field(None, max_length=32)
    parent_id: str | None = None
    sort_order: int = 0


class ScopeUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(None, min_length=1, max_length=255)
    code: str | None = Field(None, max_length=32)
    parent_id: str | None = None
    sort_order: int | None = None


class ScopeRead(BaseModel):
    id: str
    project_id: str
    code: str | None
    name: str
    parent_id: str | None
    sort_order: int
    # A scope with children groups other scopes and holds no spend itself.
    is_group: bool
    # All computed from the rows below the scope, never stored.
    planned_amount: int
    own_planned_amount: int
    spent_amount: int
    own_spent_amount: int
    expense_count: int
    own_expense_count: int
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class BudgetItemCreate(BaseModel):
    description: str = Field(..., min_length=1, max_length=255)
    planned_amount: int = Field(..., ge=0, description="Minor units of the project currency")
    cost_type: CostType | None = None


class BudgetItemUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str | None = Field(None, min_length=1, max_length=255)
    planned_amount: int | None = Field(None, ge=0)
    cost_type: CostType | None = None


class BudgetItemRead(BaseModel):
    id: str
    scope_id: str
    description: str
    planned_amount: int
    cost_type: CostType | None
    set_at: datetime
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class BudgetItemPage(BaseModel):
    items: list[BudgetItemRead]
    total: int
    limit: int
    offset: int


class ProjectBudget(BaseModel):
    project_id: str
    currency_code: str
    currency_exponent: int
    planned_amount: int
    scopes: list[ScopeRead]
