"""Serialises decimals in fixed-point notation.

Tortoise normalises every decimal it loads, so 600 loads as Decimal("6E+2"),
which the default serialiser outputs unchanged.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated

from pydantic import PlainSerializer


def plain_decimal(value: Decimal) -> str:
    return format(value.normalize(), "f")


PlainDecimal = Annotated[
    Decimal,
    PlainSerializer(plain_decimal, return_type=str, when_used="json"),
]
