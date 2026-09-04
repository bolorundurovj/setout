from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from setout.models.land_valuation import LandValuationKind


class LandValuationCreate(BaseModel):
    kind: LandValuationKind = LandValuationKind.VALUATION
    amount: int = Field(..., ge=0, description="Minor units")
    currency_code: str = Field(
        ..., min_length=3, max_length=3, description="Must match the land's, once it has one"
    )
    valued_on: date
    note: str | None = Field(None, max_length=255)


class LandValuationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: LandValuationKind | None = None
    amount: int | None = Field(None, ge=0, description="Minor units")
    valued_on: date | None = None
    note: str | None = Field(None, max_length=255)


class LandValuationRead(BaseModel):
    id: str
    land_id: str
    kind: LandValuationKind
    amount: int = Field(..., description="Minor units")
    currency_code: str
    currency_exponent: int
    valued_on: date
    note: str | None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class LandValuationPage(BaseModel):
    items: list[LandValuationRead]
    total: int
    limit: int
    offset: int
