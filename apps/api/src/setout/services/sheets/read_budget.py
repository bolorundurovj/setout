from __future__ import annotations

from setout.services.sheets.detect import DetectedSheet
from setout.services.sheets.parsed import (
    BudgetedCategory,
    BudgetedLine,
    ParsedBudget,
    Problem,
    ProblemKind,
)
from setout.services.sheets.values import as_code, as_minor, as_text, is_category_code

NO_DESCRIPTION_PLACEHOLDER = "(No description)"


def read(detected: DetectedSheet, exponent: int) -> ParsedBudget:
    """Category row amounts are ignored; a category total is the sum of its lines."""
    out = ParsedBudget()
    code_at = detected.columns.get("cost code", 0)
    name_at = detected.columns.get("description", 1)
    budgeted_at = detected.columns.get("budget", 5)
    parent_at = detected.columns.get("parent code", -1)
    cost_type_columns = {
        "labour": detected.columns.get("labour costs", -1),
        "material": detected.columns.get("material costs", -1),
        "fixed": detected.columns.get("fixed costs", -1),
    }

    current: BudgetedCategory | None = None
    for offset, row in enumerate(detected.sheet.rows[detected.header_row + 1 :]):
        number = detected.header_row + offset + 2
        code = as_code(_cell(row, code_at))
        name = as_text(_cell(row, name_at))
        budgeted = as_minor(_cell(row, budgeted_at), exponent)

        if not code and not name:
            continue

        if is_category_code(code):
            current = BudgetedCategory(
                row=number,
                code=code,
                name=name or code,
                parent_code=as_code(_cell(row, parent_at)),
            )
            out.categories.append(current)
            continue

        if budgeted is None or budgeted == 0:
            if not name:
                out.blank_rows += 1
            continue

        if current is None:
            out.problems.append(
                Problem(
                    kind=ProblemKind.BEFORE_FIRST_CATEGORY,
                    row=number,
                    detail=f"{name or code} is above the first category row",
                )
            )
            continue

        if not name:
            out.problems.append(
                Problem(
                    kind=ProblemKind.NO_DESCRIPTION,
                    row=number,
                    detail=f"an amount in {current.name} has no description",
                )
            )

        current.lines.append(
            BudgetedLine(
                row=number,
                code=code,
                description=name or NO_DESCRIPTION_PLACEHOLDER,
                budgeted_amount=budgeted,
                cost_type=_cost_type(row, cost_type_columns, exponent),
            )
        )

    return out


def _cost_type(row: list[object], columns: dict[str, int], exponent: int) -> str | None:
    filled = [
        cost_type
        for cost_type, index in columns.items()
        if index >= 0 and as_minor(_cell(row, index), exponent)
    ]
    return filled[0] if len(filled) == 1 else None


def _cell(row: list[object], index: int) -> object:
    if index < 0 or index >= len(row):
        return None
    return row[index]
