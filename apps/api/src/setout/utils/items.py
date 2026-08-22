from __future__ import annotations

from setout.schemas.item import ItemPricePoint, ItemPriceSeries, ItemPriceSummary


def price_change_percent(first: int, last: int, count: int) -> float | None:
    if count < 2 or first == 0:
        return None
    return round((last - first) / first * 100, 2)


def in_order(points: list[ItemPricePoint]) -> list[ItemPricePoint]:
    return sorted(points, key=lambda point: (point.spent_on, point.expense_id))


def summarise(
    currency_code: str,
    currency_exponent: int,
    points: list[ItemPricePoint],
) -> ItemPriceSummary:
    ordered = in_order(points)
    rates = [point.unit_rate for point in ordered]
    first, last = rates[0], rates[-1]
    return ItemPriceSummary(
        currency_code=currency_code,
        currency_exponent=currency_exponent,
        count=len(ordered),
        first_price=first,
        first_paid_on=ordered[0].spent_on,
        last_price=last,
        last_paid_on=ordered[-1].spent_on,
        lowest_price=min(rates),
        highest_price=max(rates),
        change_percent=price_change_percent(first, last, len(ordered)),
    )


def summarise_series(
    currency_code: str,
    currency_exponent: int,
    points: list[ItemPricePoint],
) -> ItemPriceSeries:
    ordered = in_order(points)
    summary = summarise(currency_code, currency_exponent, ordered)
    return ItemPriceSeries(
        currency_code=summary.currency_code,
        currency_exponent=summary.currency_exponent,
        count=summary.count,
        first_price=summary.first_price,
        first_paid_on=summary.first_paid_on,
        last_price=summary.last_price,
        last_paid_on=summary.last_paid_on,
        lowest_price=summary.lowest_price,
        highest_price=summary.highest_price,
        change_percent=summary.change_percent,
        points=ordered,
    )
