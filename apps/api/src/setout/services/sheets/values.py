from __future__ import annotations

import math
import re
import unicodedata
from datetime import date, datetime, timedelta
from decimal import Decimal, DecimalException

from setout.services.sheets.workbook import SheetError

# Excel treats 1900 as a leap year, so serials after 28 Feb 1900 are one day too high.
EPOCH = date(1899, 12, 31)
EXCEL_FAKE_LEAP_DAY_SERIAL = 60

COST_CODE = re.compile(r"\d+(?:\.\d+)?")


def as_text(value: object) -> str:
    """Converts integral floats from numeric cells back to integer text."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value).strip()


def as_date(value: object) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, int | float):
        return from_serial(float(value))
    text = str(value).strip()
    if not text:
        return None
    for pattern in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(text, pattern).date()
        except ValueError:
            continue
    try:
        return from_serial(float(text))
    except (TypeError, ValueError):
        return None


def from_serial(serial: float) -> date | None:
    if not math.isfinite(serial) or serial > (date.max - EPOCH).days + 1:
        return None
    days = int(serial)
    if days <= 0:
        return None
    if days > EXCEL_FAKE_LEAP_DAY_SERIAL:
        days -= 1
    return EPOCH + timedelta(days=days)


def as_minor(value: object, exponent: int) -> int | None:
    """Uses Decimal throughout so the amount is rounded once."""
    if value is None or value == "":
        return None
    cleaned = str(value).strip().replace(",", "")
    if cleaned and unicodedata.category(cleaned[0]) == "Sc":
        cleaned = cleaned[1:].strip()
    elif re.match(r"^[A-Z]{3}\s*[-+.0-9]", cleaned):
        cleaned = cleaned[3:].strip()
    try:
        amount = Decimal(cleaned)
        if not amount.is_finite() or amount < 0:
            return None
        minor = (amount * (10**exponent)).quantize(Decimal(1))
        return int(minor) if minor <= 2**63 - 1 else None
    except (DecimalException, ValueError):
        return None


def as_quantity(value: object) -> Decimal | None:
    """Rounded to the three decimal places an expense quantity stores."""
    if value is None or value == "":
        return None
    try:
        quantity = Decimal(str(value).replace(",", "").strip())
        if not quantity.is_finite() or quantity < 0:
            return None
        rounded = quantity.quantize(Decimal("0.001"))
        return rounded if rounded < 10**9 else None
    except (DecimalException, ValueError):
        return None


def checked_cell[T](raw: object, parsed: T | None, sheet: str, row: int, field: str) -> T | None:
    if parsed is None and raw is not None and str(raw).strip():
        raise SheetError(f"{sheet}, row {row}: invalid {field}.")
    return parsed


COST_TYPES = {"labour": "labour", "labor": "labour", "material": "material", "fixed": "fixed"}


def as_cost_type(value: object) -> str | None:
    return COST_TYPES.get(as_text(value).lower())


def as_phone(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if isinstance(value, int | float):
        return str(value)
    return str(value).strip()


def as_code(value: object) -> str:
    text = as_text(value)
    if not text:
        return ""
    if text.endswith(".0"):
        text = text[:-2]
    return text


def codes_in(value: object) -> list[str]:
    text = as_text(value)
    codes = []
    for match in COST_CODE.finditer(text):
        whole, _, fraction = match.group(0).partition(".")
        if fraction.strip("0"):
            continue
        codes.append(whole)
    return codes


def is_category_code(code: str) -> bool:
    return len(code) > 3 and code.endswith("000")


def category_code_for(code: str) -> str:
    if not code or not code.isdigit():
        return code
    if is_category_code(code):
        return code
    if len(code) <= 3:
        return code
    return code[:-3] + "000"


def as_bool(value: object) -> bool:
    text = as_text(value).lower()
    return text in ("1", "true", "yes", "y", "paid")
