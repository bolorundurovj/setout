from __future__ import annotations

from pydantic import BaseModel, Field


class MapSettings(BaseModel):
    tile_url: str = Field(..., description="Leaflet tile template, with {z}, {x} and {y}")
    attribution: str = Field(..., description="Credit the tiles carry, shown on the map")
