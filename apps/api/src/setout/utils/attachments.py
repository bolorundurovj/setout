from __future__ import annotations

from setout.models.attachment import Attachment


async def counts_for(expense_ids: list[str]) -> dict[str, int]:
    if not expense_ids:
        return {}
    rows = await Attachment.filter(expense_id__in=expense_ids, deleted_at__isnull=True).values_list(
        "expense_id", flat=True
    )
    counts: dict[str, int] = {}
    for expense_id in rows:
        counts[str(expense_id)] = counts.get(str(expense_id), 0) + 1
    return counts
