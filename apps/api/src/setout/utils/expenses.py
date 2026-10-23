from __future__ import annotations

from decimal import Decimal


def derived_amount(quantity: Decimal | None, unit_rate: int | None) -> int | None:
    """Quantity times unit rate, or None when either is missing so the entered amount is used."""
    if quantity is None or unit_rate is None:
        return None
    return int((quantity * Decimal(unit_rate)).to_integral_value())
