from __future__ import annotations

from setout.config import get_settings
from setout.schemas.map import MapSettings


class MapController:
    def settings(self) -> MapSettings:
        found = get_settings()
        return MapSettings(tile_url=found.map_tile_url, attribution=found.map_attribution)
