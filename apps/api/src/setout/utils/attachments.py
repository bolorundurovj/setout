from __future__ import annotations

from typing import Literal

from tortoise.functions import Count

from setout.models.attachment import Attachment

ParentField = Literal["expense_id", "agreement_id", "delivery_id"]


async def counts_for(field: ParentField, parent_ids: list[str]) -> dict[str, int]:
    if not parent_ids:
        return {}
    rows = (
        await Attachment.filter(**{f"{field}__in": parent_ids}, archived_at__isnull=True)
        .group_by(field)
        .annotate(n=Count("id"))
        .values(field, "n")
    )
    return {str(row[field]): int(row["n"]) for row in rows}
