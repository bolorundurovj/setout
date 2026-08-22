from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status

from setout.models.expense import Expense
from setout.models.person import Person
from setout.schemas.person import (
    PersonCreate,
    PersonCurrencyTotal,
    PersonPage,
    PersonProjectSpend,
    PersonRead,
    PersonSpend,
    PersonUpdate,
)

NOT_FOUND_PERSON = "Person not found"
DUPLICATE_NAME = "Somebody with that name already exists"


class PersonController:
    async def list_people(
        self, *, search: str | None, include_archived: bool, limit: int, offset: int
    ) -> PersonPage:
        query = Person.all() if include_archived else Person.filter(deleted_at__isnull=True)
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
        person = await self._person_or_404(person_id, include_deleted=True)
        totals = await self._totals([person.id])
        return self._read(person, totals.get(person.id, []))

    async def update(self, person_id: str, req: PersonUpdate) -> PersonRead:
        person = await self._person_or_404(person_id)
        changes = req.model_dump(exclude_unset=True)
        name = changes.get("name")
        if name is not None and name.casefold() != person.name.casefold():
            await self._reject_duplicate(name)
        if changes:
            person.update_from_dict(changes)
            await person.save()
        totals = await self._totals([person.id])
        return self._read(person, totals.get(person.id, []))

    async def delete(self, person_id: str) -> None:
        person = await self._person_or_404(person_id)
        person.deleted_at = datetime.now(UTC)
        await person.save()

    async def restore(self, person_id: str) -> PersonRead:
        person = await self._person_or_404(person_id, include_deleted=True)
        if person.deleted_at is not None:
            person.deleted_at = None
            await person.save()
        totals = await self._totals([person.id])
        return self._read(person, totals.get(person.id, []))

    async def spend(self, person_id: str) -> PersonSpend:
        person = await self._person_or_404(person_id, include_deleted=True)
        rows: dict[str, PersonProjectSpend] = {}
        for expense in await Expense.filter(
            paid_by_id=person_id, deleted_at__isnull=True
        ).prefetch_related("project__currency"):
            row = rows.get(expense.project_id)
            if row is None:
                rows[expense.project_id] = PersonProjectSpend(
                    project_id=expense.project_id,
                    project_name=expense.project.name,
                    currency_code=expense.project.currency_id,
                    currency_exponent=expense.project.currency.exponent,
                    expense_count=1,
                    spent_amount=expense.amount,
                )
            else:
                row.expense_count += 1
                row.spent_amount += expense.amount
        return PersonSpend(
            person_id=person.id,
            name=person.name,
            projects=sorted(rows.values(), key=lambda row: row.project_name),
        )

    async def _totals(self, person_ids: list[str]) -> dict[str, list[PersonCurrencyTotal]]:
        if not person_ids:
            return {}
        grouped: dict[str, dict[tuple[str, int], PersonCurrencyTotal]] = {}
        for expense in await Expense.filter(
            paid_by_id__in=person_ids, deleted_at__isnull=True
        ).prefetch_related("project__currency"):
            owner = expense.paid_by_id
            if owner is None:
                continue
            key = (expense.project.currency_id, expense.project.currency.exponent)
            rows = grouped.setdefault(owner, {})
            row = rows.get(key)
            if row is None:
                rows[key] = PersonCurrencyTotal(
                    currency_code=key[0],
                    currency_exponent=key[1],
                    expense_count=1,
                    spent_amount=expense.amount,
                )
            else:
                row.expense_count += 1
                row.spent_amount += expense.amount
        return {owner: [rows[key] for key in sorted(rows)] for owner, rows in grouped.items()}

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
            deleted_at=person.deleted_at,
        )

    async def _reject_duplicate(self, name: str) -> None:
        if await Person.filter(name__iexact=name, deleted_at__isnull=True).exists():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DUPLICATE_NAME)

    async def _person_or_404(self, person_id: str, *, include_deleted: bool = False) -> Person:
        person = await Person.get_or_none(id=person_id)
        if person is None or (person.deleted_at is not None and not include_deleted):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_PERSON)
        return person
