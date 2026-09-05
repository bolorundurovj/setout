from __future__ import annotations

from setout.schemas.geocode import GeocodedPlace
from setout.services.geocoder import reverse


class GeocodeController:
    async def at(self, latitude: float, longitude: float) -> GeocodedPlace | None:
        return await reverse(latitude, longitude)
