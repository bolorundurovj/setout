"""How big a shape given in longitude and latitude is on the ground."""

import pytest

from setout.utils.geo import polygon_area_sqm

pytestmark = pytest.mark.unit


def _plot(lon: float, lat: float, metres: float) -> list[list[float]]:
    """A square of roughly the given side, near the given place."""
    from math import cos, radians

    north = metres / 111_320
    east = north / cos(radians(lat))
    return [[lon, lat], [lon + east, lat], [lon + east, lat + north], [lon, lat + north]]


def test_a_hundred_metre_plot_is_a_hectare_of_a_square() -> None:
    assert polygon_area_sqm(_plot(3.3, 6.5, 100)) == pytest.approx(10_000, rel=0.001)


def test_a_degree_square_on_the_equator() -> None:
    # On a sphere of the WGS84 radius this is a shade over 12,390 square km.
    area = polygon_area_sqm([[0, 0], [1, 0], [1, 1], [0, 1]])
    assert area / 1_000_000 == pytest.approx(12_391, rel=0.001)


def test_the_ring_may_arrive_closed_or_open() -> None:
    ring = _plot(3.3, 6.5, 50)
    assert polygon_area_sqm(ring) == pytest.approx(polygon_area_sqm([*ring, ring[0]]))


def test_which_way_round_it_was_drawn_does_not_matter() -> None:
    ring = _plot(3.3, 6.5, 50)
    assert polygon_area_sqm(ring) == pytest.approx(polygon_area_sqm(list(reversed(ring))))


@pytest.mark.parametrize("ring", [[], [[0, 0]], [[0, 0], [1, 1]]])
def test_a_line_encloses_nothing(ring: list[list[float]]) -> None:
    assert polygon_area_sqm(ring) == 0.0


def test_a_plot_south_of_the_equator_is_not_negative() -> None:
    assert polygon_area_sqm(_plot(18.4, -33.9, 100)) == pytest.approx(10_000, rel=0.001)
