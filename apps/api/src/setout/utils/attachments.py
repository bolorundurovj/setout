from __future__ import annotations

from typing import Literal

from setout.models.attachment import Attachment

ParentField = Literal["expense_id", "agreement_id", "delivery_id"]


async def counts_for(field: ParentField, parent_ids: list[str]) -> dict[str, int]:
    if not parent_ids:
        return {}
    rows = await Attachment.filter(
        **{f"{field}__in": parent_ids}, archived_at__isnull=True
    ).values_list(field, flat=True)
    counts: dict[str, int] = {}
    for parent_id in rows:
        counts[str(parent_id)] = counts.get(str(parent_id), 0) + 1
    return counts
