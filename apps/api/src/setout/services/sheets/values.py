from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

# Excel believes 1900 had a 29th of February, so serials above it are one too high.
EPOCH = date(1899, 12, 31)
PHANTOM_LEAP_DAY = 60

COST_CODE = re.compile(r"\d+(?:\.\d+)?")


def as_text(value: object) -> str:
    """A cell as trimmed text, with the float Excel gives numeric cells undone."""
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
    """A cell as a date, whether it arrived as a serial, a string or a date."""
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
    if days > PHANTOM_LEAP_DAY:
        days -= 1
    return EPOCH + timedelta(days=days)


def as_minor(value: object, exponent: int) -> int | None:
    """A cell as whole minor units. Decimal throughout, so nothing rounds twice."""
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
    """A cost code, with the trailing .0 of a numeric cell removed."""
    text = as_text(value)
    if not text:
        return ""
    if text.endswith(".0"):
        text = text[:-2]
    return text


def codes_in(value: object) -> list[str]:
    """Every cost code in a cell. One row may name several, or none."""
    text = as_text(value)
    codes = []
    for match in COST_CODE.finditer(text):
        whole, _, fraction = match.group(0).partition(".")
        if fraction.strip("0"):
            continue
        codes.append(whole)
    return codes


def is_scope_code(code: str) -> bool:
    """A code ending in three noughts heads a scope; the rest sit under one."""
    return len(code) > 3 and code.endswith("000")


def scope_code_for(code: str) -> str:
    """The heading a cost code sits under. 3001 belongs to scope 3000."""
    if not code or not code.isdigit():
        return code
    if is_scope_code(code):
        return code
    if len(code) <= 3:
        return code
    return code[:-3] + "000"


def as_flag(value: object) -> bool:
    text = as_text(value).lower()
    return text in ("1", "true", "yes", "y", "paid")
