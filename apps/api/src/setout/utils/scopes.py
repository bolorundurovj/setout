from __future__ import annotations

from collections import defaultdict

from setout.models.budget import BudgetItem
from setout.models.expense import Expense
from setout.models.scope import Scope
from setout.schemas.scope import ScopeRead


def own_totals(items: list[BudgetItem]) -> dict[str, int]:
    totals: dict[str, int] = defaultdict(int)
    for item in items:
        totals[item.scope_id] += item.planned_amount
    return totals


def own_spend(expenses: list[Expense]) -> dict[str, int]:
    totals: dict[str, int] = defaultdict(int)
    for expense in expenses:
        if expense.scope_id is not None:
            totals[expense.scope_id] += expense.amount
    return totals


def own_counts(expenses: list[Expense]) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for expense in expenses:
        if expense.scope_id is not None:
            counts[expense.scope_id] += 1
    return counts


def rolled_up_totals(scopes: list[Scope], own: dict[str, int]) -> dict[str, int]:
    """Add each scope's total to every ancestor above it.

    A group scope holds no budget of its own, so its number is the sum of what
    sits below it.
    """
    parents = {scope.id: scope.parent_id for scope in scopes}
    rolled = {scope.id: own.get(scope.id, 0) for scope in scopes}
    for scope in scopes:
        amount = own.get(scope.id, 0)
        if not amount:
            continue
        parent_id = parents.get(scope.id)
        seen = {scope.id}
        while parent_id is not None and parent_id not in seen:
            rolled[parent_id] = rolled.get(parent_id, 0) + amount
            seen.add(parent_id)
            parent_id = parents.get(parent_id)
    return rolled


def to_reads(
    scopes: list[Scope],
    items: list[BudgetItem],
    expenses: list[Expense] | None = None,
) -> list[ScopeRead]:
    own = own_totals(items)
    rolled = rolled_up_totals(scopes, own)
    spent_own = own_spend(expenses or [])
    spent_rolled = rolled_up_totals(scopes, spent_own)
    count_own = own_counts(expenses or [])
    count_rolled = rolled_up_totals(scopes, count_own)
    has_children = {scope.parent_id for scope in scopes if scope.parent_id is not None}
    return [
        ScopeRead(
            id=scope.id,
            project_id=scope.project_id,
            code=scope.code,
            name=scope.name,
            parent_id=scope.parent_id,
            sort_order=scope.sort_order,
            is_group=scope.id in has_children,
            planned_amount=rolled.get(scope.id, 0),
            own_planned_amount=own.get(scope.id, 0),
            spent_amount=spent_rolled.get(scope.id, 0),
            own_spent_amount=spent_own.get(scope.id, 0),
            expense_count=count_rolled.get(scope.id, 0),
            own_expense_count=count_own.get(scope.id, 0),
            created_at=scope.created_at,
            updated_at=scope.updated_at,
            deleted_at=scope.deleted_at,
        )
        for scope in scopes
    ]
