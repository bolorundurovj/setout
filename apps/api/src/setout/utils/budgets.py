from __future__ import annotations

from collections import defaultdict

from tortoise.functions import Sum

from setout.models.budget import BudgetItem
from setout.models.expense import Expense


async def planned_by_project(project_ids: list[str]) -> dict[str, int]:
    """Planned totals per project, computed from the budget items below them."""
    if not project_ids:
        return {}
    rows = await BudgetItem.filter(
        deleted_at__isnull=True,
        scope__deleted_at__isnull=True,
        scope__project_id__in=project_ids,
    ).values("planned_amount", "scope__project_id")
    totals: dict[str, int] = defaultdict(int)
    for row in rows:
        totals[str(row["scope__project_id"])] += int(row["planned_amount"])
    return totals


async def spent_by_project(project_ids: list[str]) -> dict[str, int]:
    """Spend totals per project, including anything still unfiled."""
    if not project_ids:
        return {}
    rows = (
        await Expense.filter(deleted_at__isnull=True, project_id__in=project_ids)
        .annotate(total=Sum("amount"))
        .group_by("project_id")
        .values("project_id", "total")
    )
    return {str(row["project_id"]): int(row["total"]) for row in rows}
