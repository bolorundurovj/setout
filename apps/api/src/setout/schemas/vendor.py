from __future__ import annotations

from datetime import datetime
from typing import ClassVar

from pydantic import BaseModel, Field

from setout.schemas.base import UpdateModel


class VendorCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    trade: str | None = Field(None, max_length=255)
    contact_name: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=64)
    email: str | None = Field(None, max_length=254)
    notes: str | None = None


class VendorUpdate(UpdateModel):
    NOT_NULL: ClassVar[frozenset[str]] = frozenset({"name"})

    name: str | None = Field(None, min_length=1, max_length=255)
    trade: str | None = Field(None, max_length=255)
    contact_name: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=64)
    email: str | None = Field(None, max_length=254)
    notes: str | None = None


class VendorCurrencyTotal(BaseModel):
    currency_code: str
    currency_exponent: int
    expense_count: int
    spent_amount: int


class VendorRead(BaseModel):
    id: str
    name: str
    trade: str | None
    contact_name: str | None
    phone: str | None
    email: str | None
    notes: str | None
    expense_count: int
    totals: list[VendorCurrencyTotal] = Field(
        ..., description="One entry per currency. Two currencies are never added together"
    )
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class VendorPage(BaseModel):
    items: list[VendorRead]
    total: int
    limit: int
    offset: int


class VendorProjectExpenseSummary(BaseModel):
    project_id: str
    project_name: str
    currency_code: str
    currency_exponent: int
    expense_count: int
    spent_amount: int


class VendorExpenseSummary(BaseModel):
    vendor_id: str
    name: str
    projects: list[VendorProjectExpenseSummary] = Field(
        ..., description="One row per project. Two currencies are never added together"
    )


class VendorAgreement(BaseModel):
    id: str
    project_id: str
    project_name: str
    currency_code: str
    currency_exponent: int
    description: str
    agreed_amount: int
    paid_amount: int
    balance_amount: int
    created_at: datetime
    archived_at: datetime | None


class VendorAgreements(BaseModel):
    vendor_id: str
    name: str
    total: int = Field(..., description="Agreements with this vendor, across every project")
    limit: int
    offset: int
    agreements: list[VendorAgreement] = Field(
        ..., description="Across every project, newest first. Currencies are never added together"
    )
