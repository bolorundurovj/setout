from __future__ import annotations

import pytest

from setout.currencies import CURRENCIES

pytestmark = pytest.mark.unit


def test_codes_are_unique() -> None:
    codes = [code for code, _, _ in CURRENCIES]
    assert len(codes) == len(set(codes))


def test_codes_are_three_uppercase_letters() -> None:
    assert all(len(code) == 3 and code.isalpha() and code.isupper() for code, _, _ in CURRENCIES)


def test_every_currency_has_a_name() -> None:
    assert all(name.strip() for _, name, _ in CURRENCIES)


def test_exponents_are_plausible() -> None:
    assert {exponent for _, _, exponent in CURRENCIES} <= {0, 2, 3}


@pytest.mark.parametrize(
    ("code", "exponent"),
    [("NGN", 2), ("USD", 2), ("JPY", 0), ("KWD", 3)],
)
def test_known_exponents(code: str, exponent: int) -> None:
    found = {c: e for c, _, e in CURRENCIES}
    assert found[code] == exponent
