from __future__ import annotations

from tortoise.expressions import Q

from setout.models.expense import Expense
from setout.models.item import Item
from setout.models.person import Person
from setout.models.project import Project
from setout.models.vendor import Vendor
from setout.schemas.search import Hit, HitGroup, SearchKind, SearchResults


class SearchController:
    async def look(self, query: str, limit: int) -> SearchResults:
        wanted = query.strip()
        if not wanted:
            return SearchResults(query=wanted, total=0, groups=[])

        groups = [
            await self._projects(wanted, limit),
            await self._expenses(wanted, limit),
            await self._vendors(wanted, limit),
            await self._people(wanted, limit),
            await self._items(wanted, limit),
        ]
        found = [group for group in groups if group.total]
        return SearchResults(
            query=wanted,
            total=sum(group.total for group in found),
            groups=found,
        )

    async def _projects(self, wanted: str, limit: int) -> HitGroup:
        rows = Project.filter(deleted_at__isnull=True).filter(
            Q(name__icontains=wanted) | Q(notes__icontains=wanted)
        )
        return HitGroup(
            kind=SearchKind.PROJECTS,
            total=await rows.count(),
            hits=[
                Hit(id=row.id, title=row.name, detail=row.notes or row.status, project_id=row.id)
                for row in await rows.limit(limit)
            ],
        )

    async def _expenses(self, wanted: str, limit: int) -> HitGroup:
        rows = Expense.filter(deleted_at__isnull=True).filter(
            Q(description__icontains=wanted) | Q(notes__icontains=wanted)
        )
        found = await rows.limit(limit).prefetch_related("project__currency", "vendor")
        return HitGroup(
            kind=SearchKind.EXPENSES,
            total=await rows.count(),
            hits=[
                Hit(
                    id=row.id,
                    title=row.description,
                    detail=row.vendor.name if row.vendor else row.project.name,
                    project_id=row.project_id,
                    amount=row.amount,
                    currency_code=row.project.currency_id,
                    currency_exponent=row.project.currency.exponent,
                    spent_on=row.spent_on,
                )
                for row in found
            ],
        )

    async def _vendors(self, wanted: str, limit: int) -> HitGroup:
        rows = Vendor.filter(deleted_at__isnull=True).filter(
            Q(name__icontains=wanted)
            | Q(trade__icontains=wanted)
            | Q(contact_name__icontains=wanted)
            | Q(phone__icontains=wanted)
            | Q(email__icontains=wanted)
        )
        return HitGroup(
            kind=SearchKind.VENDORS,
            total=await rows.count(),
            hits=[
                Hit(id=row.id, title=row.name, detail=row.trade or row.contact_name or "no trade")
                for row in await rows.limit(limit)
            ],
        )

    async def _people(self, wanted: str, limit: int) -> HitGroup:
        rows = Person.filter(deleted_at__isnull=True).filter(
            Q(name__icontains=wanted) | Q(role__icontains=wanted) | Q(phone__icontains=wanted)
        )
        return HitGroup(
            kind=SearchKind.PEOPLE,
            total=await rows.count(),
            hits=[
                Hit(id=row.id, title=row.name, detail=row.role or "no role")
                for row in await rows.limit(limit)
            ],
        )

    async def _items(self, wanted: str, limit: int) -> HitGroup:
        rows = Item.filter(deleted_at__isnull=True).filter(
            Q(name__icontains=wanted) | Q(unit__icontains=wanted)
        )
        return HitGroup(
            kind=SearchKind.ITEMS,
            total=await rows.count(),
            hits=[
                Hit(id=row.id, title=row.name, detail=row.unit or "no unit")
                for row in await rows.limit(limit)
            ],
        )
