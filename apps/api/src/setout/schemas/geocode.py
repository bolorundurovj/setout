from __future__ import annotations

from pydantic import BaseModel, Field


class GeocodedPlace(BaseModel):
    """The address at a coordinate. Every field is optional, because the geocoder
    returns only the parts it has."""

    address: str | None = Field(None, description="The whole address, as one line")
    city: str | None = Field(
        None, description="Town, village or suburb, as returned by the geocoder"
    )
    state: str | None = None
    country_code: str | None = Field(None, description="Two letters, upper case")
