from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from setout.models.land import LandSizeUnit
from setout.schemas.decimals import PlainDecimal

# Longitude first, the way GeoJSON orders a position.
Position = tuple[float, float]

# Rejects oversized polygons; a land boundary has far fewer boundary points.
MAX_POSITIONS = 1000


class LandSize(BaseModel):
    @model_validator(mode="after")
    def validate_stated_area(self) -> LandSize:
        value = getattr(self, "size_value", None)
        unit = getattr(self, "size_unit", None)
        if value is not None and unit is None:
            raise ValueError("A stated area requires a unit")
        if unit is not None and value is None:
            raise ValueError("A unit requires a stated area")
        return self


class LandPoint(BaseModel):
    @model_validator(mode="after")
    def validate_coordinates(self) -> LandPoint:
        latitude = getattr(self, "latitude", None)
        longitude = getattr(self, "longitude", None)
        if latitude is not None and longitude is None:
            raise ValueError("A latitude requires a longitude")
        if longitude is not None and latitude is None:
            raise ValueError("A longitude requires a latitude")
        return self


class LandBoundary(BaseModel):
    """A GeoJSON Polygon: positions are longitude first, and the ring closes."""

    type: Literal["Polygon"] = "Polygon"
    coordinates: list[list[Position]]

    @model_validator(mode="after")
    def validate_boundary(self) -> LandBoundary:
        if not self.coordinates:
            raise ValueError("A boundary requires at least one ring")
        closed: list[list[Position]] = []
        for ring in self.coordinates:
            if len(ring) > MAX_POSITIONS:
                raise ValueError(f"A ring cannot have more than {MAX_POSITIONS} boundary points")
            closed_ring = ring if len(ring) > 1 and ring[0] == ring[-1] else [*ring, *ring[:1]]
            if len(closed_ring) < 4:
                raise ValueError("A ring requires at least three boundary points")
            for longitude, latitude in closed_ring:
                if not -180 <= longitude <= 180:
                    raise ValueError(f"Longitude out of range: {longitude}")
                if not -90 <= latitude <= 90:
                    raise ValueError(f"Latitude out of range: {latitude}")
            closed.append(closed_ring)
        self.coordinates = closed
        return self


class LandCreate(LandSize, LandPoint):
    name: str = Field(..., min_length=1, max_length=255)
    address: str | None = None
    geocoded_address: str | None = None
    city: str | None = Field(None, max_length=255)
    state: str | None = Field(None, max_length=255)
    country_code: str | None = Field(
        None,
        min_length=2,
        max_length=2,
        description="When given, the state is validated against this country",
    )
    purchased_on: date | None = None
    latitude: Decimal | None = Field(None, ge=-90, le=90, max_digits=10, decimal_places=7)
    longitude: Decimal | None = Field(None, ge=-180, le=180, max_digits=10, decimal_places=7)
    boundary: LandBoundary | None = None
    size_value: Decimal | None = Field(None, gt=0, max_digits=14, decimal_places=2)
    size_unit: LandSizeUnit | None = None
    notes: str | None = None


class LandUpdate(LandSize, LandPoint):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(None, min_length=1, max_length=255)
    address: str | None = None
    geocoded_address: str | None = None
    city: str | None = Field(None, max_length=255)
    state: str | None = Field(None, max_length=255)
    country_code: str | None = Field(
        None,
        min_length=2,
        max_length=2,
        description="When given, the state is validated against this country",
    )
    purchased_on: date | None = None
    latitude: Decimal | None = Field(None, ge=-90, le=90, max_digits=10, decimal_places=7)
    longitude: Decimal | None = Field(None, ge=-180, le=180, max_digits=10, decimal_places=7)
    boundary: LandBoundary | None = None
    size_value: Decimal | None = Field(None, gt=0, max_digits=14, decimal_places=2)
    size_unit: LandSizeUnit | None = None
    notes: str | None = None


class LandProject(BaseModel):
    id: str
    name: str
    status: str
    archived_at: datetime | None


class LandRead(BaseModel):
    id: str
    name: str
    address: str | None
    geocoded_address: str | None
    city: str | None
    state: str | None
    country_code: str | None
    country_name: str | None
    purchased_on: date | None
    latitude: PlainDecimal | None
    longitude: PlainDecimal | None
    boundary: LandBoundary | None
    boundary_area_sqm: float | None = Field(
        None, description="Calculated from the boundary; not stored"
    )
    size_value: PlainDecimal | None
    size_unit: LandSizeUnit | None
    notes: str | None
    currency_code: str | None = Field(
        None, description="The currency of every valuation. Set by the first valuation"
    )
    currency_exponent: int | None = None
    purchase_amount: int | None = Field(None, description="Minor units. The purchase price")
    current_value: int | None = Field(None, description="Minor units. The newest valuation")
    valuation_count: int = Field(0, description="Excludes archived ones")
    document_count: int = Field(..., description="Excludes archived ones")
    missing_kinds: list[str] = Field(
        ..., description="Required documents that have not been uploaded yet"
    )
    projects: list[LandProject] = Field(..., description="Projects on this land record")
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class LandPage(BaseModel):
    items: list[LandRead]
    total: int
    limit: int
    offset: int
