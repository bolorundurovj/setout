from __future__ import annotations

from typing import Literal

from tortoise.functions import Count

from setout.models.attachment import Attachment
from setout.utils.iterables import chunked

ParentField = Literal["expense_id", "agreement_id", "delivery_id"]


async def counts_for(field: ParentField, parent_ids: list[str]) -> dict[str, int]:
    if not parent_ids:
        return {}
    counts: dict[str, int] = {}
    for batch in chunked(parent_ids):
        rows = (
            await Attachment.filter(**{f"{field}__in": batch}, archived_at__isnull=True)
            .group_by(field)
            .annotate(n=Count("id"))
            .values(field, "n")
        )
        for row in rows:
            counts[str(row[field])] = int(row["n"])
    return counts
