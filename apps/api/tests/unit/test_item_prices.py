from __future__ import annotations

from setout.utils.items import price_change_percent


def test_no_change_from_a_single_price() -> None:
    assert price_change_percent(200_00, 200_00, 1) is None


def test_no_change_from_a_first_price_of_zero() -> None:
    assert price_change_percent(0, 200_00, 4) is None


def test_a_rise_reads_positive() -> None:
    assert price_change_percent(200_00, 270_00, 5) == 35.0


def test_a_fall_reads_negative() -> None:
    assert price_change_percent(270_00, 200_00, 5) == -25.93
