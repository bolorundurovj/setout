from __future__ import annotations

import pytest

from setout.utils.balances import balance_of

pytestmark = pytest.mark.unit


def test_nothing_paid_leaves_the_whole_amount_owed() -> None:
    assert balance_of(223_000_00, 0) == 223_000_00


def test_part_payments_come_off_the_balance() -> None:
    # Idris Bricklaying: agreed 223,000, paid 70 + 20 + 40 + 13 + 20.
    paid = sum([70_000_00, 20_000_00, 40_000_00, 13_000_00, 20_000_00])
    assert balance_of(223_000_00, paid) == 60_000_00


def test_paying_in_full_clears_it() -> None:
    assert balance_of(100_000, 100_000) == 0


def test_overpaying_owes_nothing_rather_than_a_negative() -> None:
    assert balance_of(100_000, 150_000) == 0
