from __future__ import annotations

from collections import defaultdict

from setout.models.advance import Advance
from setout.models.expense import Expense


async def paid_by_agreement(agreement_ids: list[str]) -> dict[str, int]:
    """What has been paid against each agreement, from the expenses filed to it."""
    if not agreement_ids:
        return {}
    rows = await Expense.filter(
        deleted_at__isnull=True,
        agreement_id__in=agreement_ids,
    ).values("amount", "agreement_id")
    totals: dict[str, int] = defaultdict(int)
    for row in rows:
        totals[str(row["agreement_id"])] += int(row["amount"])
    return totals


def balance_of(agreed_amount: int, paid_amount: int) -> int:
    """What is still owed. Overpaying leaves nothing owed rather than a negative."""
    return max(0, agreed_amount - paid_amount)


async def person_balances(person_ids: list[str], project_id: str | None = None) -> dict[str, int]:
    """What each person is holding: advanced to them, less what they have spent.

    A positive number means they still hold money. A negative one means they
    are out of pocket and owed it back.
    """
    if not person_ids:
        return {}
    advance_filter: dict[str, object] = {"deleted_at__isnull": True, "person_id__in": person_ids}
    spend_filter: dict[str, object] = {"deleted_at__isnull": True, "paid_by_id__in": person_ids}
    if project_id is not None:
        advance_filter["project_id"] = project_id
        spend_filter["project_id"] = project_id

    balances: dict[str, int] = defaultdict(int)
    for row in await Advance.filter(**advance_filter).values("amount", "person_id"):
        balances[str(row["person_id"])] += int(row["amount"])
    for row in await Expense.filter(**spend_filter).values("amount", "paid_by_id"):
        balances[str(row["paid_by_id"])] -= int(row["amount"])
    return balances
