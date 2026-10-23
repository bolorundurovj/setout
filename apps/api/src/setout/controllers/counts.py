from __future__ import annotations

from setout.models.item import Item
from setout.models.land import Land
from setout.models.person import Person
from setout.models.project import Project
from setout.models.vendor import Vendor
from setout.schemas.counts import Counts


class CountsController:
    async def counts(self) -> Counts:
        return Counts(
            projects=await Project.filter(archived_at__isnull=True).count(),
            vendors=await Vendor.filter(archived_at__isnull=True).count(),
            items=await Item.filter(archived_at__isnull=True).count(),
            people=await Person.filter(archived_at__isnull=True).count(),
            lands=await Land.filter(archived_at__isnull=True).count(),
        )
