from __future__ import annotations

from setout.services.sheets.detect import Found
from setout.services.sheets.parsed import OwedLine, OwedRead
from setout.services.sheets.values import as_text

DONE = {"resolved", "delivered", "done", "received", "yes"}


def has_arrived(status: str) -> bool:
    words = status.strip().lower().split()
    if not words or words[0] == "not":
        return False
    return words[0].strip(",.") in DONE


def read(found: Found) -> OwedRead:
    out = OwedRead()
    at = found.columns
    item_at = at.get("item", 0)
    status_at = at.get("status", max(at.values(), default=0) + 1)

    for offset, row in enumerate(found.sheet.rows[found.header_row + 1 :]):
        number = found.header_row + offset + 2
        item = as_text(_cell(row, item_at))
        if not item:
            continue
        quantity = as_text(_cell(row, at.get("qty", -1)))
        out.owed.append(
            OwedLine(
                row=number,
                description=f"{quantity} {item}".strip() if quantity else item,
                vendor=as_text(_cell(row, at.get("vendor", -1))),
                quantity=quantity,
                resolved=has_arrived(as_text(_cell(row, status_at))),
            )
        )
    return out


def _cell(row: list[object], index: int) -> object:
    if index < 0 or index >= len(row):
        return None
    return row[index]
