from __future__ import annotations

from tortoise.functions import Sum

from setout.models.expense import Expense
from setout.utils.iterables import chunked


async def paid_by_agreement(agreement_ids: list[str]) -> dict[str, int]:
    """Paid amount per agreement, summed from its expenses."""
    if not agreement_ids:
        return {}
    totals: dict[str, int] = {}
    for batch in chunked(agreement_ids):
        rows = (
            await Expense.filter(
                archived_at__isnull=True,
                agreement_id__in=batch,
            )
            .group_by("agreement_id")
            .annotate(total=Sum("amount"))
            .values("agreement_id", "total")
        )
        for row in rows:
            totals[str(row["agreement_id"])] = int(row["total"] or 0)
    return totals


def balance_of(agreed_amount: int, paid_amount: int) -> int:
    """Amount still due, negative when payments exceed the agreement."""
    return agreed_amount - paid_amount
