from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from setout.services.sheets.values import as_text
from setout.services.sheets.workbook import Sheet

HEADER_SEARCH_ROWS = 8


class SheetKind(StrEnum):
    BUDGET = "budget"
    VENDORS = "vendors"
    EXPENSES = "expenses"
    OUTSTANDING = "outstanding"


REQUIRED_HEADERS: dict[SheetKind, set[str]] = {
    SheetKind.BUDGET: {"cost code", "description", "budget"},
    SheetKind.VENDORS: {"company name", "trade"},
    SheetKind.EXPENSES: {"cost code", "amount"},
    SheetKind.OUTSTANDING: {"item", "vendor", "qty"},
}


# Headers written by earlier versions of the template, read as their current names.
HEADER_ALIASES: dict[str, str] = {
    "cost codes": "cost code",
    "activities": "description",
    "labor costs": "labour costs",
    "total cost": "amount",
    "documents": "attachment",
    "purchased by": "paid by",
}


@dataclass
class DetectedSheet:
    kind: SheetKind
    sheet: Sheet
    header_row: int
    columns: dict[str, int]


@dataclass
class Detection:
    detected: list[DetectedSheet]
    skipped: list[tuple[str, str]]


def headings(row: list[object]) -> dict[str, int]:
    out: dict[str, int] = {}
    for index, cell in enumerate(row):
        name = as_text(cell).lower().rstrip(":")
        name = HEADER_ALIASES.get(name, name)
        if name and name not in out:
            out[name] = index
    return out


def kind_of(row: list[object]) -> tuple[SheetKind, dict[str, int]] | None:
    names = headings(row)
    present = set(names)
    for kind, required in REQUIRED_HEADERS.items():
        if required <= present:
            return kind, names
    return None


def detect_sheets(sheets: list[Sheet]) -> Detection:
    candidates: list[DetectedSheet] = []
    skipped: list[tuple[str, str]] = []

    for sheet in sheets:
        hit = None
        for index, row in enumerate(sheet.rows[:HEADER_SEARCH_ROWS]):
            match = kind_of(row)
            if match:
                hit = DetectedSheet(kind=match[0], sheet=sheet, header_row=index, columns=match[1])
                break
        if hit is None:
            skipped.append((sheet.name, "No recognised header row"))
        else:
            candidates.append(hit)

    return Detection(detected=_one_per_kind(candidates, skipped), skipped=skipped)


def _one_per_kind(
    candidates: list[DetectedSheet], skipped: list[tuple[str, str]]
) -> list[DetectedSheet]:
    """Keeps one sheet per kind so a copy of the template does not import its example rows."""
    kept: list[DetectedSheet] = []
    for kind in SheetKind:
        same = [c for c in candidates if c.kind is kind]
        if not same:
            continue
        non_template = [c for c in same if not _is_template(c.sheet.name)] or same
        kept.append(non_template[0])
        for other in same:
            if other is not non_template[0]:
                skipped.append((other.sheet.name, f"Another sheet contains the {kind} data"))
    return kept


def _is_template(name: str) -> bool:
    return name.strip().lower().replace("-", " ").split()[-1:] == ["base"]
