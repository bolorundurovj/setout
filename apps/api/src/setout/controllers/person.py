from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status
from tortoise.functions import Count, Sum
from tortoise.transactions import in_transaction

from setout.models.advance import Advance
from setout.models.expense import Expense
from setout.models.person import Person
from setout.models.project import Project
from setout.schemas.person import (
    PersonCreate,
    PersonCurrencyTotal,
    PersonExpenseSummary,
    PersonPage,
    PersonProjectExpenseSummary,
    PersonRead,
    PersonUpdate,
)
from setout.services import changes
from setout.utils.currencies import currency_exponents

NOT_FOUND_PERSON = "Person not found"
DUPLICATE_NAME = "A person with that name already exists"


class PersonController:
    async def list_people(
        self, *, search: str | None, include_archived: bool, limit: int, offset: int
    ) -> PersonPage:
        query = Person.all() if include_archived else Person.filter(archived_at__isnull=True)
        if search:
            query = query.filter(name__icontains=search)
        total = await query.count()
        people = await query.offset(offset).limit(limit)
        totals = await self._totals([person.id for person in people])
        return PersonPage(
            items=[self._read(person, totals.get(person.id, [])) for person in people],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def create(self, req: PersonCreate) -> PersonRead:
        await self._reject_duplicate(req.name)
        person = await Person.create(**req.model_dump())
        return self._read(person, [])

    async def get(self, person_id: str) -> PersonRead:
        person = await self._person_or_404(person_id, include_archived=True)
        totals = await self._totals([person.id])
        return self._read(person, totals.get(person.id, []))

    async def update(self, person_id: str, req: PersonUpdate) -> PersonRead:
        person = await self._person_or_404(person_id)
        updates = req.model_dump(exclude_unset=True)
        name = updates.get("name")
        if name is not None and name.casefold() != person.name.casefold():
            await self._reject_duplicate(name)
        if updates:
            person.update_from_dict(updates)
            await person.save()
        totals = await self._totals([person.id])
        return self._read(person, totals.get(person.id, []))

    async def archive(self, person_id: str) -> None:
        person = await self._person_or_404(person_id)
        person.archived_at = datetime.now(UTC)
        await person.save()

    async def restore(self, person_id: str) -> PersonRead:
        person = await self._person_or_404(person_id, include_archived=True)
        if person.archived_at is not None:
            await self._reject_duplicate(person.name)
            person.archived_at = None
            await person.save()
        totals = await self._totals([person.id])
        return self._read(person, totals.get(person.id, []))

    async def delete(self, person_id: str) -> None:
        async with in_transaction():
            person = await self._person_or_404(person_id, include_archived=True)
            if person.archived_at is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Only archived people can be deleted permanently",
                )
            await changes.recorded_update(Expense.filter(paid_by_id=person.id), paid_by_id=None)
            await changes.recorded_delete(Advance.filter(person_id=person.id))
            await person.delete()

    async def expense_summary(self, person_id: str) -> PersonExpenseSummary:
        person = await self._person_or_404(person_id, include_archived=True)
        rows = (
            await Expense.filter(paid_by_id=person_id, archived_at__isnull=True)
            .group_by("project_id")
            .annotate(n=Count("id"), total=Sum("amount"))
            .values("project_id", "n", "total")
        )
        projects = await Project.filter(
            id__in=[row["project_id"] for row in rows]
        ).prefetch_related("currency")
        by_id = {project.id: project for project in projects}
        summaries = [
            PersonProjectExpenseSummary(
                project_id=str(row["project_id"]),
                project_name=by_id[row["project_id"]].name,
                currency_code=by_id[row["project_id"]].currency_id,
                currency_exponent=by_id[row["project_id"]].currency.exponent,
                expense_count=int(row["n"]),
                spent_amount=int(row["total"] or 0),
            )
            for row in rows
        ]
        summaries.sort(key=lambda row: row.project_name)
        return PersonExpenseSummary(
            person_id=person.id,
            name=person.name,
            projects=summaries,
        )

    async def _totals(self, person_ids: list[str]) -> dict[str, list[PersonCurrencyTotal]]:
        """Spent amount and expense count per payer currency, grouped by the database."""
        if not person_ids:
            return {}
        rows = (
            await Expense.filter(paid_by_id__in=person_ids, archived_at__isnull=True)
            .group_by("paid_by_id", "project__currency_id")
            .annotate(n=Count("id"), total=Sum("amount"))
            .values("paid_by_id", "project__currency_id", "n", "total")
        )
        exponents = await currency_exponents({row["project__currency_id"] for row in rows})
        grouped: dict[str, dict[str, PersonCurrencyTotal]] = {}
        for row in rows:
            code = str(row["project__currency_id"])
            grouped.setdefault(str(row["paid_by_id"]), {})[code] = PersonCurrencyTotal(
                currency_code=code,
                currency_exponent=exponents[code],
                expense_count=int(row["n"]),
                spent_amount=int(row["total"] or 0),
            )
        return {
            payer_id: [rows[code] for code in sorted(rows)] for payer_id, rows in grouped.items()
        }

    def _read(self, person: Person, totals: list[PersonCurrencyTotal]) -> PersonRead:
        return PersonRead(
            id=person.id,
            name=person.name,
            role=person.role,
            phone=person.phone,
            notes=person.notes,
            expense_count=sum(total.expense_count for total in totals),
            totals=totals,
            created_at=person.created_at,
            updated_at=person.updated_at,
            archived_at=person.archived_at,
        )

    async def _reject_duplicate(self, name: str) -> None:
        if await Person.filter(name__iexact=name, archived_at__isnull=True).exists():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DUPLICATE_NAME)

    async def _person_or_404(self, person_id: str, *, include_archived: bool = False) -> Person:
        person = await Person.get_or_none(id=person_id)
        if person is None or (person.archived_at is not None and not include_archived):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_PERSON)
        return person
