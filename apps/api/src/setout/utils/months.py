from __future__ import annotations

from collections import defaultdict
from datetime import date

from setout.models.expense import Expense
from setout.models.scope import Scope
from setout.schemas.expense import MonthScopeSpend, MonthSpend

UNFILED_NAME = "Not filed to a scope"


def month_key(day: date) -> str:
    return f"{day.year:04d}-{day.month:02d}"


def month_range(month: str) -> tuple[date, date]:
    """The first day of the month and the first day of the one after it."""
    year, number = int(month[:4]), int(month[5:7])
    first = date(year, number, 1)
    if number == 12:
        return first, date(year + 1, 1, 1)
    return first, date(year, number + 1, 1)


def top_of_branch(scopes: list[Scope]) -> dict[str, Scope]:
    """Every scope mapped to the scope at the top of its branch.

    A month is split by branch rather than by leaf. A project with thirty leaf
    scopes would otherwise draw thirty segments in one bar, which reads as
    noise.
    """
    by_id = {scope.id: scope for scope in scopes}
    tops: dict[str, Scope] = {}
    for scope in scopes:
        walked = scope
        seen = {walked.id}
        while walked.parent_id is not None and walked.parent_id in by_id:
            parent = by_id[walked.parent_id]
            if parent.id in seen:
                break
            walked = parent
            seen.add(walked.id)
        tops[scope.id] = walked
    return tops


def to_months(expenses: list[Expense], scopes: list[Scope]) -> list[MonthSpend]:
    """Spend gathered into the calendar months it happened in, oldest first.

    Segments stay in budget order rather than largest first, so a scope keeps
    the same place in every bar and the months can be read against each other.
    """
    tops = top_of_branch(scopes)
    order = {scope.id: scope.sort_order for scope in scopes}
    totals: dict[str, int] = defaultdict(int)
    counts: dict[str, int] = defaultdict(int)
    splits: dict[str, dict[str | None, int]] = defaultdict(lambda: defaultdict(int))
    names: dict[str | None, str] = {None: UNFILED_NAME}

    for expense in expenses:
        month = month_key(expense.spent_on)
        totals[month] += expense.amount
        counts[month] += 1
        top = tops.get(expense.scope_id) if expense.scope_id is not None else None
        splits[month][top.id if top is not None else None] += expense.amount
        if top is not None:
            names[top.id] = top.name

    def place(scope_id: str | None) -> tuple[int, int, str]:
        if scope_id is None:
            return 1, 0, ""
        return 0, order.get(scope_id, 0), scope_id

    def split(month: str) -> list[MonthScopeSpend]:
        ordered = sorted(splits[month].items(), key=lambda pair: place(pair[0]))
        return [
            MonthScopeSpend(scope_id=scope_id, name=names[scope_id], amount=amount)
            for scope_id, amount in ordered
        ]

    return [
        MonthSpend(
            month=month,
            amount=totals[month],
            expense_count=counts[month],
            scopes=split(month),
        )
        for month in sorted(totals)
    ]
