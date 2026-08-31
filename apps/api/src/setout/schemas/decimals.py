"""A decimal that reads back the way it was written.

Tortoise quantizes and normalizes every decimal it loads, so 600 comes off the
database as Decimal("6E+2") and the default serializer sends that string
straight out. Fixed-point notation is what a size or a quantity means.
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
