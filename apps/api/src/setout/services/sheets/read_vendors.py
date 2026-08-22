from __future__ import annotations

from setout.services.sheets.detect import Found
from setout.services.sheets.parsed import VendorLine, VendorsRead
from setout.services.sheets.values import as_phone, as_text


def read(found: Found) -> VendorsRead:
    out = VendorsRead()
    at = found.columns
    seen: set[str] = set()

    for offset, row in enumerate(found.sheet.rows[found.header_row + 1 :]):
        number = found.header_row + offset + 2
        name = as_text(_cell(row, at.get("company name", 0)))
        if not name:
            continue
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.vendors.append(
            VendorLine(
                row=number,
                name=name,
                trade=as_text(_cell(row, at.get("trade", -1))),
                contact_name=as_text(_cell(row, at.get("point of contact", -1))),
                phone=as_phone(_cell(row, at.get("phone", -1))),
                email=as_text(_cell(row, at.get("email", -1))),
                notes=as_text(_cell(row, at.get("notes", -1))),
            )
        )
    return out


def _cell(row: list[object], index: int) -> object:
    if index < 0 or index >= len(row):
        return None
    return row[index]
