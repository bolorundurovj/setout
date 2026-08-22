from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PersonCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    role: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=64)
    notes: str | None = None


class PersonUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(None, min_length=1, max_length=255)
    role: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=64)
    notes: str | None = None


class PersonCurrencyTotal(BaseModel):
    currency_code: str
    currency_exponent: int
    expense_count: int
    spent_amount: int


class PersonRead(BaseModel):
    id: str
    name: str
    role: str | None
    phone: str | None
    notes: str | None
    expense_count: int
    totals: list[PersonCurrencyTotal] = Field(
        ..., description="One entry per currency. Two currencies are never added together"
    )
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class PersonPage(BaseModel):
    items: list[PersonRead]
    total: int
    limit: int
    offset: int


class PersonProjectSpend(BaseModel):
    project_id: str
    project_name: str
    currency_code: str
    currency_exponent: int
    expense_count: int
    spent_amount: int


class PersonSpend(BaseModel):
    person_id: str
    name: str
    projects: list[PersonProjectSpend] = Field(
        ..., description="What they spent, per project. Two currencies are never added together"
    )
