from __future__ import annotations

from setout.services.sheets.detect import DetectedSheet
from setout.services.sheets.parsed import OutstandingLine, ParsedOutstanding
from setout.services.sheets.values import as_text

RECEIVED_STATUSES = {"resolved", "delivered", "done", "received", "yes"}
# Exports before 2026-10-20 wrote the expected value under a Location header.
EXPECTED_HEADERS = ("expected", "location")


def is_received(status: str) -> bool:
    words = status.strip().lower().split()
    if not words or words[0] == "not":
        return False
    return words[0].strip(",.") in RECEIVED_STATUSES


def read(detected: DetectedSheet) -> ParsedOutstanding:
    out = ParsedOutstanding()
    at = detected.columns
    item_at = at.get("item", 0)
    status_at = at.get("status", max(at.values(), default=0) + 1)
    expected_at = next((at[name] for name in EXPECTED_HEADERS if name in at), -1)

    for offset, row in enumerate(detected.sheet.rows[detected.header_row + 1 :]):
        number = detected.header_row + offset + 2
        item = as_text(_cell(row, item_at))
        if not item:
            continue
        quantity = as_text(_cell(row, at.get("qty", -1)))
        out.outstanding.append(
            OutstandingLine(
                row=number,
                description=f"{quantity} {item}".strip() if quantity else item,
                vendor=as_text(_cell(row, at.get("vendor", -1))),
                quantity=quantity,
                received=is_received(as_text(_cell(row, status_at))),
                expected=as_text(_cell(row, expected_at)),
            )
        )
    return out


def _cell(row: list[object], index: int) -> object:
    if index < 0 or index >= len(row):
        return None
    return row[index]
