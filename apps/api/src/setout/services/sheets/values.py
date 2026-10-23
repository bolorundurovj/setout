from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

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
    if isinstance(value, str):
        cleaned = re.sub(r"[^\d.\-]", "", value.replace(",", ""))
        if cleaned in ("", "-", "."):
            return None
    else:
        cleaned = str(value)
    try:
        amount = Decimal(cleaned)
    except (InvalidOperation, ValueError):
        return None
    return int((amount * (10**exponent)).quantize(Decimal(1)))


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
