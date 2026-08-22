from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from setout.services.sheets.values import as_text
from setout.services.sheets.workbook import Sheet

HEADER_SEARCH_ROWS = 8


class Shape(StrEnum):
    BUDGET = "budget"
    VENDORS = "vendors"
    EXPENSES = "expenses"
    OUTSTANDING = "outstanding"


# Columns that must all be present for a sheet to be that shape.
SIGNATURES: dict[Shape, set[str]] = {
    Shape.BUDGET: {"cost codes", "activities", "budget"},
    Shape.VENDORS: {"company name", "trade"},
    Shape.EXPENSES: {"cost code", "total cost"},
    Shape.OUTSTANDING: {"item", "vendor", "qty"},
}


@dataclass
class Found:
    shape: Shape
    sheet: Sheet
    header_row: int
    columns: dict[str, int]


@dataclass
class Detection:
    found: list[Found]
    skipped: list[tuple[str, str]]


def headings(row: list[object]) -> dict[str, int]:
    out: dict[str, int] = {}
    for index, cell in enumerate(row):
        name = as_text(cell).lower().rstrip(":")
        if name and name not in out:
            out[name] = index
    return out


def shape_of(row: list[object]) -> tuple[Shape, dict[str, int]] | None:
    names = headings(row)
    present = set(names)
    for shape, needed in SIGNATURES.items():
        if needed <= present:
            return shape, names
    return None


def find(sheets: list[Sheet]) -> Detection:
    """What each sheet holds, from its headings rather than its name."""
    candidates: list[Found] = []
    skipped: list[tuple[str, str]] = []

    for sheet in sheets:
        hit = None
        for index, row in enumerate(sheet.rows[:HEADER_SEARCH_ROWS]):
            match = shape_of(row)
            if match:
                hit = Found(shape=match[0], sheet=sheet, header_row=index, columns=match[1])
                break
        if hit is None:
            skipped.append((sheet.name, "no headings Setout recognises"))
        else:
            candidates.append(hit)

    return Detection(found=_one_per_shape(candidates, skipped), skipped=skipped)


def _one_per_shape(candidates: list[Found], skipped: list[tuple[str, str]]) -> list[Found]:
    """One sheet per shape: a template copy would import its examples as spend."""
    kept: list[Found] = []
    for shape in Shape:
        same = [c for c in candidates if c.shape is shape]
        if not same:
            continue
        real = [c for c in same if not _is_template(c.sheet.name)] or same
        kept.append(real[0])
        for other in same:
            if other is not real[0]:
                skipped.append((other.sheet.name, f"another sheet already holds the {shape}"))
    return kept


def _is_template(name: str) -> bool:
    return name.strip().lower().replace("-", " ").split()[-1:] == ["base"]
