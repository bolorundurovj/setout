from __future__ import annotations

from collections import defaultdict

from tortoise.functions import Sum

from setout.models.advance import Advance
from setout.models.expense import Expense


async def paid_by_agreement(agreement_ids: list[str]) -> dict[str, int]:
    """Paid amount per agreement, summed from its expenses."""
    if not agreement_ids:
        return {}
    rows = (
        await Expense.filter(
            archived_at__isnull=True,
            agreement_id__in=agreement_ids,
        )
        .group_by("agreement_id")
        .annotate(total=Sum("amount"))
        .values("agreement_id", "total")
    )
    return {str(row["agreement_id"]): int(row["total"] or 0) for row in rows}


def balance_of(agreed_amount: int, paid_amount: int) -> int:
    """Amount still due, negative when payments exceed the agreement."""
    return agreed_amount - paid_amount


async def person_balances(
    person_ids: list[str], project_id: str | None = None
) -> dict[tuple[str, str], int]:
    """Advanced amount less spent amount, per person and currency.

    Positive when the person holds unspent money, negative when you owe the person.
    """
    if not person_ids:
        return {}
    advance_filter: dict[str, object] = {"archived_at__isnull": True, "person_id__in": person_ids}
    spend_filter: dict[str, object] = {"archived_at__isnull": True, "paid_by_id__in": person_ids}
    if project_id is not None:
        advance_filter["project_id"] = project_id
        spend_filter["project_id"] = project_id

    balances: dict[tuple[str, str], int] = defaultdict(int)
    advanced = (
        await Advance.filter(**advance_filter)
        .group_by("person_id", "project__currency_id")
        .annotate(total=Sum("amount"))
        .values("person_id", "project__currency_id", "total")
    )
    for row in advanced:
        key = (str(row["person_id"]), str(row["project__currency_id"]))
        balances[key] += int(row["total"] or 0)
    spent = (
        await Expense.filter(**spend_filter)
        .group_by("paid_by_id", "project__currency_id")
        .annotate(total=Sum("amount"))
        .values("paid_by_id", "project__currency_id", "total")
    )
    for row in spent:
        key = (str(row["paid_by_id"]), str(row["project__currency_id"]))
        balances[key] -= int(row["total"] or 0)
    return balances
