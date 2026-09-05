"""Area of a polygon given in longitude and latitude."""

from __future__ import annotations

from collections.abc import Sequence
from math import radians, sin

# WGS84 semi-major axis, in metres.
EARTH_RADIUS = 6378137.0


def polygon_area_sqm(ring: Sequence[Sequence[float]]) -> float:
    """Spherical excess over the WGS84 radius, the way OpenLayers measures it.

    Positions are GeoJSON order, longitude first. A ring of fewer than three
    corners encloses nothing.
    """
    if len(ring) < 3:
        return 0.0

    total = 0.0
    for index in range(len(ring)):
        lon1, lat1 = ring[index][0], ring[index][1]
        lon2, lat2 = ring[(index + 1) % len(ring)][0], ring[(index + 1) % len(ring)][1]
        total += radians(lon2 - lon1) * (2 + sin(radians(lat1)) + sin(radians(lat2)))
    return abs(total * EARTH_RADIUS * EARTH_RADIUS / 2.0)
