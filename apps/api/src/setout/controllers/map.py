from __future__ import annotations

from setout.config import get_settings
from setout.schemas.map import MapSettings


class MapController:
    def settings(self) -> MapSettings:
        app_settings = get_settings()
        return MapSettings(
            tile_url=app_settings.map_tile_url, attribution=app_settings.map_attribution
        )
