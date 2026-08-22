from __future__ import annotations

from datetime import date
from decimal import Decimal

from setout.schemas.item import ItemPricePoint
from setout.utils.items import price_change_percent, summarise_series


def point(expense_id: str, day: str, unit_rate: int) -> ItemPricePoint:
    return ItemPricePoint(
        expense_id=expense_id,
        spent_on=date.fromisoformat(day),
        unit_rate=unit_rate,
        quantity=Decimal("1"),
        project_id="p1",
        project_name="Jacaranda Close, Ewuru",
        vendor_id=None,
        vendor_name=None,
    )


def test_no_change_from_a_single_price() -> None:
    assert price_change_percent(200_00, 200_00, 1) is None


def test_no_change_from_a_first_price_of_zero() -> None:
    assert price_change_percent(0, 200_00, 4) is None


def test_a_rise_reads_positive() -> None:
    assert price_change_percent(200_00, 270_00, 5) == 35.0


def test_a_fall_reads_negative() -> None:
    assert price_change_percent(270_00, 200_00, 5) == -25.93


def test_the_six_inch_block_ladder() -> None:
    series = summarise_series(
        "NGN",
        2,
        [
            point("e1", "2026-01-05", 200_00),
            point("e2", "2026-02-05", 200_00),
            point("e3", "2026-03-05", 230_00),
            point("e4", "2026-04-05", 250_00),
            point("e5", "2026-05-05", 270_00),
        ],
    )

    assert series.count == 5
    assert series.first_price == 200_00
    assert series.first_paid_on == date(2026, 1, 5)
    assert series.last_price == 270_00
    assert series.last_paid_on == date(2026, 5, 5)
    assert series.lowest_price == 200_00
    assert series.highest_price == 270_00
    assert series.change_percent == 35.0


def test_the_cement_ladder_ending_in_a_delivery() -> None:
    series = summarise_series(
        "NGN",
        2,
        [
            point("e1", "2026-01-05", 3_600_00),
            point("e2", "2026-02-05", 4_000_00),
            point("e3", "2026-03-05", 4_250_00),
            point("e4", "2026-04-05", 4_500_00),
            point("e5", "2026-05-05", 11_000_00),
        ],
    )

    assert series.first_price == 3_600_00
    assert series.last_price == 11_000_00
    assert series.change_percent == 205.56


def test_prices_are_ordered_by_the_day_they_were_paid() -> None:
    series = summarise_series(
        "NGN",
        2,
        [
            point("e3", "2026-03-05", 230_00),
            point("e1", "2026-01-05", 200_00),
            point("e2", "2026-02-05", 210_00),
        ],
    )

    assert [p.expense_id for p in series.points] == ["e1", "e2", "e3"]
    assert series.first_price == 200_00
    assert series.last_price == 230_00


def test_a_lone_price_is_its_own_first_and_last() -> None:
    series = summarise_series("NGN", 2, [point("e1", "2026-01-05", 50_000_00)])

    assert series.count == 1
    assert series.first_price == series.last_price == 50_000_00
    assert series.lowest_price == series.highest_price == 50_000_00
    assert series.change_percent is None


def test_the_lowest_price_need_not_be_the_first() -> None:
    series = summarise_series(
        "NGN",
        2,
        [
            point("e1", "2026-01-05", 250_00),
            point("e2", "2026-02-05", 200_00),
            point("e3", "2026-03-05", 230_00),
        ],
    )

    assert series.lowest_price == 200_00
    assert series.highest_price == 250_00
    assert series.first_price == 250_00
    assert series.last_price == 230_00
