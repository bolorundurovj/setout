from __future__ import annotations

from collections import defaultdict

from setout.models.category import Category
from setout.schemas.category import CategoryRead


def ancestor_ids(category_id: str, parents: dict[str, str | None]) -> list[str]:
    result = []
    seen = {category_id}
    parent = parents.get(category_id)
    while parent is not None and parent not in seen:
        result.append(parent)
        seen.add(parent)
        parent = parents.get(parent)
    return result


def subtree_ids(category_id: str, parents: dict[str, str | None]) -> list[str]:
    """Return the root and its descendants in parent-first order."""
    children: dict[str, list[str]] = defaultdict(list)
    for child, parent in parents.items():
        if parent is not None:
            children[parent].append(child)
    result = [category_id]
    seen = {category_id}
    for current in result:
        for child in children[current]:
            if child not in seen:
                result.append(child)
                seen.add(child)
    return result


def rolled_up_totals(categories: list[Category], own: dict[str, int]) -> dict[str, int]:
    """Add each category's total to every ancestor.

    A parent category has no budget of its own, so its total is the sum of its subcategories.
    """
    parents = {category.id: category.parent_id for category in categories}
    rolled = {category.id: own.get(category.id, 0) for category in categories}
    for category in categories:
        amount = own.get(category.id, 0)
        if not amount:
            continue
        for parent_id in ancestor_ids(category.id, parents):
            rolled[parent_id] = rolled.get(parent_id, 0) + amount
    return rolled


def to_reads(
    categories: list[Category],
    items_total: dict[str, int],
    spent_total: dict[str, int] | None = None,
    expense_counts: dict[str, int] | None = None,
) -> list[CategoryRead]:
    """Build the reads from per-category totals the database has already grouped.

    `items_total` is budgeted amount per category id; `spent_total` and
    `expense_counts` are spent amount and expense count per category id.
    """
    rolled = rolled_up_totals(categories, items_total)
    spent_own = spent_total or {}
    spent_rolled = rolled_up_totals(categories, spent_own)
    count_own = expense_counts or {}
    count_rolled = rolled_up_totals(categories, count_own)
    parent_ids = {category.parent_id for category in categories if category.parent_id is not None}
    return [
        CategoryRead(
            id=category.id,
            project_id=category.project_id,
            code=category.code,
            name=category.name,
            parent_id=category.parent_id,
            sort_order=category.sort_order,
            is_group=category.id in parent_ids,
            budgeted_amount=rolled.get(category.id, 0),
            own_budgeted_amount=items_total.get(category.id, 0),
            spent_amount=spent_rolled.get(category.id, 0),
            own_spent_amount=spent_own.get(category.id, 0),
            expense_count=count_rolled.get(category.id, 0),
            own_expense_count=count_own.get(category.id, 0),
            created_at=category.created_at,
            updated_at=category.updated_at,
            archived_at=category.archived_at,
        )
        for category in categories
    ]
