from __future__ import annotations

from collections import defaultdict

from setout.models.budget import BudgetItem
from setout.models.category import Category
from setout.models.expense import Expense
from setout.schemas.category import CategoryRead


def own_totals(items: list[BudgetItem]) -> dict[str, int]:
    totals: dict[str, int] = defaultdict(int)
    for item in items:
        totals[item.category_id] += item.budgeted_amount
    return totals


def own_spend(expenses: list[Expense]) -> dict[str, int]:
    totals: dict[str, int] = defaultdict(int)
    for expense in expenses:
        if expense.category_id is not None:
            totals[expense.category_id] += expense.amount
    return totals


def own_counts(expenses: list[Expense]) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for expense in expenses:
        if expense.category_id is not None:
            counts[expense.category_id] += 1
    return counts


def rolled_up_totals(categories: list[Category], own: dict[str, int]) -> dict[str, int]:
    """Add each category's total to every ancestor above it.

    A group category holds no budget of its own, so its number is the sum of what
    sits below it.
    """
    parents = {category.id: category.parent_id for category in categories}
    rolled = {category.id: own.get(category.id, 0) for category in categories}
    for category in categories:
        amount = own.get(category.id, 0)
        if not amount:
            continue
        parent_id = parents.get(category.id)
        seen = {category.id}
        while parent_id is not None and parent_id not in seen:
            rolled[parent_id] = rolled.get(parent_id, 0) + amount
            seen.add(parent_id)
            parent_id = parents.get(parent_id)
    return rolled


def to_reads(
    categories: list[Category],
    items: list[BudgetItem],
    expenses: list[Expense] | None = None,
) -> list[CategoryRead]:
    own = own_totals(items)
    rolled = rolled_up_totals(categories, own)
    spent_own = own_spend(expenses or [])
    spent_rolled = rolled_up_totals(categories, spent_own)
    count_own = own_counts(expenses or [])
    count_rolled = rolled_up_totals(categories, count_own)
    has_children = {category.parent_id for category in categories if category.parent_id is not None}
    return [
        CategoryRead(
            id=category.id,
            project_id=category.project_id,
            code=category.code,
            name=category.name,
            parent_id=category.parent_id,
            sort_order=category.sort_order,
            is_group=category.id in has_children,
            budgeted_amount=rolled.get(category.id, 0),
            own_budgeted_amount=own.get(category.id, 0),
            spent_amount=spent_rolled.get(category.id, 0),
            own_spent_amount=spent_own.get(category.id, 0),
            expense_count=count_rolled.get(category.id, 0),
            own_expense_count=count_own.get(category.id, 0),
            created_at=category.created_at,
            updated_at=category.updated_at,
            deleted_at=category.deleted_at,
        )
        for category in categories
    ]
