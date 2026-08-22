from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class VendorCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    trade: str | None = Field(None, max_length=255)
    contact_name: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=64)
    email: str | None = Field(None, max_length=254)
    notes: str | None = None


class VendorUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

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
    deleted_at: datetime | None


class VendorPage(BaseModel):
    items: list[VendorRead]
    total: int
    limit: int
    offset: int


class VendorProjectSpend(BaseModel):
    project_id: str
    project_name: str
    currency_code: str
    currency_exponent: int
    expense_count: int
    spent_amount: int


class VendorSpend(BaseModel):
    vendor_id: str
    name: str
    projects: list[VendorProjectSpend] = Field(
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
    deleted_at: datetime | None


class VendorAgreements(BaseModel):
    vendor_id: str
    name: str
    agreements: list[VendorAgreement] = Field(
        ..., description="Across every project, newest first. Currencies are never added together"
    )
