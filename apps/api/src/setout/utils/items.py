from __future__ import annotations

from datetime import date


def price_change_percent(first: int, last: int, count: int) -> float | None:
    if count < 2 or first == 0:
        return None
    return round((last - first) / first * 100, 2)


def price_order(day: date, expense_id: str) -> tuple[date, str]:
    """The order price series and exports share: the paid-on day, then the expense id."""
    return day, expense_id
