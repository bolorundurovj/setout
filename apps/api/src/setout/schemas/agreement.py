from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class AgreementCreate(BaseModel):
    vendor_id: str
    description: str = Field(..., min_length=1, max_length=255)
    agreed_amount: int = Field(..., ge=0, description="Minor units of the project currency")
    notes: str | None = None


class AgreementUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str | None = Field(None, min_length=1, max_length=255)
    agreed_amount: int | None = Field(None, ge=0)
    notes: str | None = None


class AgreementRead(BaseModel):
    id: str
    project_id: str
    vendor_id: str
    vendor_name: str
    description: str
    agreed_amount: int
    # Both worked out from the expenses filed against it, never stored.
    paid_amount: int
    balance_amount: int
    notes: str | None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class AgreementPage(BaseModel):
    items: list[AgreementRead]
    total: int
    limit: int
    offset: int


class AdvanceCreate(BaseModel):
    person_id: str
    amount: int = Field(..., ge=0, description="Minor units of the project currency")
    given_on: date | None = Field(None, description="Defaults to today")
    notes: str | None = None


class AdvanceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount: int | None = Field(None, ge=0)
    given_on: date | None = None
    notes: str | None = None


class AdvanceRead(BaseModel):
    id: str
    project_id: str
    person_id: str
    person_name: str
    given_on: date
    amount: int
    notes: str | None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class AdvancePage(BaseModel):
    items: list[AdvanceRead]
    total: int
    limit: int
    offset: int


class PersonBalance(BaseModel):
    person_id: str
    person_name: str
    project_id: str
    currency_code: str
    currency_exponent: int
    advanced_amount: int
    spent_amount: int
    # Positive means they still hold money, negative means they are owed it.
    balance_amount: int
