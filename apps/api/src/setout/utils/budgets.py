from __future__ import annotations

from collections import defaultdict

from tortoise.functions import Sum

from setout.models.budget import BudgetItem
from setout.models.expense import Expense


async def budgeted_by_project(project_ids: list[str]) -> dict[str, int]:
    """Budgeted totals per project, summed from budget items in categories that are not archived."""
    if not project_ids:
        return {}
    rows = await BudgetItem.filter(
        archived_at__isnull=True,
        category__archived_at__isnull=True,
        category__project_id__in=project_ids,
    ).values("budgeted_amount", "category__project_id")
    totals: dict[str, int] = defaultdict(int)
    for row in rows:
        totals[str(row["category__project_id"])] += int(row["budgeted_amount"])
    return totals


async def spent_by_project(project_ids: list[str]) -> dict[str, int]:
    """Spent totals per project, including anything still uncategorised."""
    if not project_ids:
        return {}
    rows = (
        await Expense.filter(archived_at__isnull=True, project_id__in=project_ids)
        .annotate(total=Sum("amount"))
        .group_by("project_id")
        .values("project_id", "total")
    )
    return {str(row["project_id"]): int(row["total"]) for row in rows}
