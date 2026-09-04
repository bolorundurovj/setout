from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from setout.models.land import LandSizeUnit
from setout.schemas.decimals import PlainDecimal


class LandSize(BaseModel):
    """A size is only meaningful with the unit it was measured in."""

    @model_validator(mode="after")
    def size_needs_its_unit(self) -> LandSize:
        value = getattr(self, "size_value", None)
        unit = getattr(self, "size_unit", None)
        if value is not None and unit is None:
            raise ValueError("A size needs the unit it was measured in")
        if unit is not None and value is None:
            raise ValueError("A unit needs a size to go with it")
        return self


class LandCreate(LandSize):
    name: str = Field(..., min_length=1, max_length=255)
    address: str | None = None
    city: str | None = Field(None, max_length=255)
    state: str | None = Field(None, max_length=255)
    country_code: str | None = Field(
        None, min_length=2, max_length=2, description="Give one and the state is checked against it"
    )
    size_value: Decimal | None = Field(None, gt=0, max_digits=14, decimal_places=2)
    size_unit: LandSizeUnit | None = None
    notes: str | None = None


class LandUpdate(LandSize):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(None, min_length=1, max_length=255)
    address: str | None = None
    city: str | None = Field(None, max_length=255)
    state: str | None = Field(None, max_length=255)
    country_code: str | None = Field(
        None, min_length=2, max_length=2, description="Give one and the state is checked against it"
    )
    size_value: Decimal | None = Field(None, gt=0, max_digits=14, decimal_places=2)
    size_unit: LandSizeUnit | None = None
    notes: str | None = None


class LandProject(BaseModel):
    id: str
    name: str
    status: str
    deleted_at: datetime | None


class LandRead(BaseModel):
    id: str
    name: str
    address: str | None
    city: str | None
    state: str | None
    country_code: str | None
    country_name: str | None
    size_value: PlainDecimal | None
    size_unit: LandSizeUnit | None
    notes: str | None
    document_count: int = Field(..., description="Not counting removed ones")
    missing_kinds: list[str] = Field(
        ..., description="The papers worth having that have not been uploaded yet"
    )
    projects: list[LandProject] = Field(..., description="What is being built on it")
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class LandPage(BaseModel):
    items: list[LandRead]
    total: int
    limit: int
    offset: int
