from __future__ import annotations

from setout.models.item import Item
from setout.models.person import Person
from setout.models.project import Project
from setout.models.vendor import Vendor
from setout.schemas.counts import Counts


class CountsController:
    async def counts(self) -> Counts:
        return Counts(
            projects=await Project.filter(deleted_at__isnull=True).count(),
            vendors=await Vendor.filter(deleted_at__isnull=True).count(),
            items=await Item.filter(deleted_at__isnull=True).count(),
            people=await Person.filter(deleted_at__isnull=True).count(),
        )
