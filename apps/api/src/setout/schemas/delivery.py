from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class DeliveryCreate(BaseModel):
    expense_id: str
    description: str | None = Field(
        None,
        min_length=1,
        max_length=255,
        description="What is owed. Defaults to the expense description",
    )
    promised: str | None = Field(None, max_length=255, description="When it was promised, in words")


class DeliveryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str | None = Field(None, min_length=1, max_length=255)
    promised: str | None = None


class DeliveryRead(BaseModel):
    id: str
    project_id: str
    expense_id: str
    vendor_id: str | None
    vendor_name: str | None
    description: str
    promised: str | None
    amount: int = Field(..., description="Read from the expense that paid for it")
    currency_code: str
    currency_exponent: int
    spent_on: date
    received_at: datetime | None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class DeliveryPage(BaseModel):
    items: list[DeliveryRead]
    total: int
    owed_amount: int = Field(
        ..., description="Still owed across every matching row, in one project's currency"
    )
    limit: int
    offset: int
