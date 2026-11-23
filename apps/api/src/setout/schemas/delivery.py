from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import ClassVar

from pydantic import BaseModel, Field

from setout.schemas.base import UpdateModel


class DeliverySort(StrEnum):
    RECENT = "recent"
    EXPECTED = "expected"


class DeliveryCreate(BaseModel):
    expense_id: str
    description: str | None = Field(
        None,
        min_length=1,
        max_length=255,
        description="What is outstanding. Defaults to the expense description",
    )
    expected: date | None = Field(None, description="When delivery is expected")


class DeliveryUpdate(UpdateModel):
    NOT_NULL: ClassVar[frozenset[str]] = frozenset({"description"})

    description: str | None = Field(None, min_length=1, max_length=255)
    expected: date | None = None


class DeliveryRead(BaseModel):
    id: str
    project_id: str
    expense_id: str
    vendor_id: str | None
    vendor_name: str | None
    description: str
    expected: date | None
    is_overdue: bool = Field(
        False, description="True if delivery is outstanding and expected date is in the past"
    )
    amount: int = Field(..., description="Taken from the expense that paid for the delivery")
    currency_code: str
    currency_exponent: int
    spent_on: date
    received_at: datetime | None
    attachment_count: int = Field(..., description="Number of attachments")
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class DeliveryPage(BaseModel):
    items: list[DeliveryRead]
    total: int
    outstanding_amount: int = Field(
        ..., description="Total outstanding amount of all matching rows, in the project currency"
    )
    limit: int
    offset: int
