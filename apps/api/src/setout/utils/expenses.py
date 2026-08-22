from __future__ import annotations

from decimal import Decimal


def derived_amount(quantity: Decimal | None, unit_rate: int | None) -> int | None:
    """Amount is quantity times unit rate whenever both are given.

    Returns None when it cannot be derived, so the caller falls back to the
    amount that was entered.
    """
    if quantity is None or unit_rate is None:
        return None
    return int((quantity * Decimal(unit_rate)).to_integral_value())
