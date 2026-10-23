from __future__ import annotations

from tortoise.expressions import Q

from setout.models.expense import Expense
from setout.models.item import Item
from setout.models.land import Land
from setout.models.person import Person
from setout.models.project import Project
from setout.models.vendor import Vendor
from setout.schemas.search import Hit, HitGroup, SearchKind, SearchResults


class SearchController:
    async def search(self, query: str, limit: int) -> SearchResults:
        term = query.strip()
        if not term:
            return SearchResults(query=term, total=0, groups=[])

        groups = [
            await self._projects(term, limit),
            await self._expenses(term, limit),
            await self._vendors(term, limit),
            await self._people(term, limit),
            await self._items(term, limit),
            await self._lands(term, limit),
        ]
        matched = [group for group in groups if group.total]
        return SearchResults(
            query=term,
            total=sum(group.total for group in matched),
            groups=matched,
        )

    async def _projects(self, term: str, limit: int) -> HitGroup:
        rows = Project.filter(archived_at__isnull=True).filter(
            Q(name__icontains=term) | Q(notes__icontains=term)
        )
        return HitGroup(
            kind=SearchKind.PROJECTS,
            total=await rows.count(),
            hits=[
                Hit(id=row.id, title=row.name, detail=row.notes or row.status, project_id=row.id)
                for row in await rows.limit(limit)
            ],
        )

    async def _expenses(self, term: str, limit: int) -> HitGroup:
        rows = Expense.filter(archived_at__isnull=True).filter(
            Q(description__icontains=term) | Q(notes__icontains=term)
        )
        matched = await rows.limit(limit).prefetch_related("project__currency", "vendor")
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
                for row in matched
            ],
        )

    async def _vendors(self, term: str, limit: int) -> HitGroup:
        rows = Vendor.filter(archived_at__isnull=True).filter(
            Q(name__icontains=term)
            | Q(trade__icontains=term)
            | Q(contact_name__icontains=term)
            | Q(phone__icontains=term)
            | Q(email__icontains=term)
        )
        return HitGroup(
            kind=SearchKind.VENDORS,
            total=await rows.count(),
            hits=[
                Hit(id=row.id, title=row.name, detail=row.trade or row.contact_name or "no trade")
                for row in await rows.limit(limit)
            ],
        )

    async def _people(self, term: str, limit: int) -> HitGroup:
        rows = Person.filter(archived_at__isnull=True).filter(
            Q(name__icontains=term) | Q(role__icontains=term) | Q(phone__icontains=term)
        )
        return HitGroup(
            kind=SearchKind.PEOPLE,
            total=await rows.count(),
            hits=[
                Hit(id=row.id, title=row.name, detail=row.role or "no role")
                for row in await rows.limit(limit)
            ],
        )

    async def _items(self, term: str, limit: int) -> HitGroup:
        rows = Item.filter(archived_at__isnull=True).filter(
            Q(name__icontains=term) | Q(unit__icontains=term)
        )
        return HitGroup(
            kind=SearchKind.ITEMS,
            total=await rows.count(),
            hits=[
                Hit(id=row.id, title=row.name, detail=row.unit or "no unit")
                for row in await rows.limit(limit)
            ],
        )

    async def _lands(self, term: str, limit: int) -> HitGroup:
        rows = Land.filter(archived_at__isnull=True).filter(
            Q(name__icontains=term)
            | Q(address__icontains=term)
            | Q(city__icontains=term)
            | Q(state__icontains=term)
        )
        return HitGroup(
            kind=SearchKind.LANDS,
            total=await rows.count(),
            hits=[
                Hit(id=row.id, title=row.name, detail=row.city or row.state or "no location")
                for row in await rows.limit(limit)
            ],
        )
