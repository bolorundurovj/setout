from __future__ import annotations

from decimal import Decimal

import pytest

from setout.utils.expenses import derived_amount

pytestmark = pytest.mark.unit


def test_amount_is_quantity_times_unit_rate() -> None:
    # 600 nine inch blocks at 250 each.
    assert derived_amount(Decimal("600"), 250_00) == 150_000_00


def test_a_fractional_quantity_still_multiplies() -> None:
    assert derived_amount(Decimal("2.5"), 40_000_00) == 100_000_00


def test_nothing_is_derived_without_a_quantity() -> None:
    assert derived_amount(None, 250_00) is None


def test_nothing_is_derived_without_a_rate() -> None:
    assert derived_amount(Decimal("600"), None) is None


def test_a_zero_rate_is_still_a_rate() -> None:
    assert derived_amount(Decimal("600"), 0) == 0
