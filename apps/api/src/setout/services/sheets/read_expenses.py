from __future__ import annotations

from setout.services.sheets.detect import Found
from setout.services.sheets.parsed import Problem, SpendLine, SpendRead, Trouble
from setout.services.sheets.read_budget import MISSING
from setout.services.sheets.values import as_date, as_flag, as_minor, as_text, codes_in


def read(found: Found, exponent: int) -> SpendRead:
    """The invoices sheet as spend. Nothing here may set a budget."""
    out = SpendRead()
    at = found.columns

    for offset, row in enumerate(found.sheet.rows[found.header_row + 1 :]):
        number = found.header_row + offset + 2
        amount = as_minor(_cell(row, at.get("total cost", -1)), exponent)
        vendor = as_text(_cell(row, at.get("subcontractors & vendors", -1)))
        invoice = as_text(_cell(row, at.get("invoice no.", -1)))

        if amount is None or amount == 0:
            continue

        codes = codes_in(_cell(row, at.get("cost code", -1)))
        if len(codes) > 1:
            out.problems.append(
                Problem(
                    kind=Trouble.SEVERAL_CODES,
                    row=number,
                    detail=f"names {len(codes)} cost codes: {', '.join(codes)}",
                )
            )

        paid = as_flag(_cell(row, at.get("paid", -1)))
        if not paid:
            out.problems.append(
                Problem(
                    kind=Trouble.NOT_PAID,
                    row=number,
                    detail=f"{vendor or 'an invoice'} is not marked paid",
                )
            )

        # Only a sheet Setout wrote has a description column.
        description = (
            as_text(_cell(row, at.get("description", -1)))
            or _describe(vendor, invoice)
            or as_text(_cell(row, at.get("notes", -1)))
        )
        if not description:
            out.problems.append(
                Problem(
                    kind=Trouble.NO_DESCRIPTION,
                    row=number,
                    detail="an amount with nothing said about it",
                )
            )
            description = MISSING

        out.spend.append(
            SpendLine(
                row=number,
                description=description,
                amount=amount,
                spent_on=as_date(_cell(row, at.get("date invoiced", -1))),
                codes=codes,
                vendor=vendor,
                paid_by=as_text(_cell(row, at.get("purchased by", -1))),
                paid=paid,
                notes=_notes(row, at),
            )
        )
    return out


def _describe(vendor: str, invoice: str) -> str:
    if vendor and invoice:
        return f"{vendor} invoice {invoice}"
    return vendor or (f"Invoice {invoice}" if invoice else "")


def _notes(row: list[object], at: dict[str, int]) -> str:
    parts = []
    note = as_text(_cell(row, at.get("notes", -1)))
    if note:
        parts.append(note)
    document = as_text(_cell(row, at.get("documents", -1)))
    if document:
        parts.append(f"receipt in the sheet: {document}")
    return " · ".join(parts)


def _cell(row: list[object], index: int) -> object:
    if index < 0 or index >= len(row):
        return None
    return row[index]
