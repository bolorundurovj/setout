from __future__ import annotations

from setout.services.sheets.detect import Found
from setout.services.sheets.parsed import BudgetRead, PlannedLine, PlannedScope, Problem, Trouble
from setout.services.sheets.values import as_code, as_minor, as_text, is_scope_code

MISSING = "MISSING"


def read(found: Found, exponent: int) -> BudgetRead:
    """The budget sheet as scopes and their lines. A heading total is not read twice."""
    out = BudgetRead()
    code_at = found.columns.get("cost codes", 0)
    name_at = found.columns.get("activities", 1)
    planned_at = found.columns.get("budget", 5)
    split_at = {
        "labour": found.columns.get("labor costs", found.columns.get("labour costs", -1)),
        "material": found.columns.get("material costs", -1),
        "fixed": found.columns.get("fixed costs", -1),
    }

    current: PlannedScope | None = None
    for offset, row in enumerate(found.sheet.rows[found.header_row + 1 :]):
        number = found.header_row + offset + 2
        code = as_code(_cell(row, code_at))
        name = as_text(_cell(row, name_at))
        planned = as_minor(_cell(row, planned_at), exponent)

        if not code and not name:
            continue

        if is_scope_code(code):
            current = PlannedScope(row=number, code=code, name=name or code)
            out.scopes.append(current)
            continue

        if planned is None or planned == 0:
            if not name:
                out.blank_rows += 1
            continue

        if current is None:
            out.problems.append(
                Problem(
                    kind=Trouble.NO_SCOPE_YET,
                    row=number,
                    detail=f"{name or code} sits above every scope heading",
                )
            )
            continue

        if not name:
            out.problems.append(
                Problem(
                    kind=Trouble.NO_DESCRIPTION,
                    row=number,
                    detail=f"a figure under {current.name} with nothing said about it",
                )
            )

        current.lines.append(
            PlannedLine(
                row=number,
                code=code,
                description=name or MISSING,
                planned_amount=planned,
                cost_type=_split(row, split_at, exponent),
            )
        )

    return out


def _split(row: list[object], at: dict[str, int], exponent: int) -> str | None:
    written = [
        kind for kind, index in at.items() if index >= 0 and as_minor(_cell(row, index), exponent)
    ]
    return written[0] if len(written) == 1 else None


def _cell(row: list[object], index: int) -> object:
    if index < 0 or index >= len(row):
        return None
    return row[index]
