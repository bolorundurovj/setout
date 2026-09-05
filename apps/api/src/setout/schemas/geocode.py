from __future__ import annotations

from pydantic import BaseModel, Field


class GeocodedPlace(BaseModel):
    """What the map calls a spot. Every part is optional: a geocoder answers with
    what it knows, and open country knows no street."""

    address: str | None = Field(None, description="The whole address, as one line")
    city: str | None = Field(None, description="Town, village or suburb, whichever it gave")
    state: str | None = None
    country_code: str | None = Field(None, description="Two letters, upper case")
