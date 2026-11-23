from __future__ import annotations

from datetime import date, datetime
from typing import ClassVar

from pydantic import BaseModel, Field

from setout.models.land_valuation import LandValuationKind
from setout.schemas.base import UpdateModel


class LandValuationCreate(BaseModel):
    kind: LandValuationKind = LandValuationKind.VALUATION
    amount: int = Field(..., ge=0, description="Minor units")
    currency_code: str = Field(
        ...,
        min_length=3,
        max_length=3,
        description="Must match the land record's currency, once set",
    )
    valued_on: date
    notes: str | None = Field(None, max_length=255)


class LandValuationUpdate(UpdateModel):
    NOT_NULL: ClassVar[frozenset[str]] = frozenset({"kind", "amount", "valued_on"})

    kind: LandValuationKind | None = None
    amount: int | None = Field(None, ge=0, description="Minor units")
    valued_on: date | None = None
    notes: str | None = Field(None, max_length=255)


class LandValuationRead(BaseModel):
    id: str
    land_id: str
    kind: LandValuationKind
    amount: int = Field(..., description="Minor units")
    currency_code: str
    currency_exponent: int
    valued_on: date
    notes: str | None
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class LandValuationPage(BaseModel):
    items: list[LandValuationRead]
    total: int
    limit: int
    offset: int
