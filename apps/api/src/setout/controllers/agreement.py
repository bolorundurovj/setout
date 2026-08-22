from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime

from fastapi import HTTPException, status

from setout.models.advance import Advance
from setout.models.agreement import Agreement
from setout.models.expense import Expense
from setout.models.person import Person
from setout.models.project import Project
from setout.models.vendor import Vendor
from setout.schemas.agreement import (
    AdvanceCreate,
    AdvancePage,
    AdvanceRead,
    AdvanceUpdate,
    AgreementCreate,
    AgreementPage,
    AgreementRead,
    AgreementUpdate,
    PersonBalance,
)
from setout.utils.balances import balance_of, paid_by_agreement, person_balances


class AgreementController:
    async def list_agreements(self, project_id: str, *, limit: int, offset: int) -> AgreementPage:
        await self._project_or_404(project_id)
        query = Agreement.filter(project_id=project_id, deleted_at__isnull=True)
        total = await query.count()
        rows = await query.offset(offset).limit(limit).prefetch_related("vendor")
        paid = await paid_by_agreement([row.id for row in rows])
        return AgreementPage(
            items=[self._read(row, paid.get(row.id, 0)) for row in rows],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def create(self, project_id: str, req: AgreementCreate) -> AgreementRead:
        await self._project_or_404(project_id)
        vendor = await Vendor.get_or_none(id=req.vendor_id, deleted_at__isnull=True)
        if vendor is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
        agreement = await Agreement.create(project_id=project_id, **req.model_dump())
        await agreement.fetch_related("vendor")
        return self._read(agreement, 0)

    async def get(self, agreement_id: str) -> AgreementRead:
        agreement = await self._agreement_or_404(agreement_id)
        paid = await paid_by_agreement([agreement.id])
        return self._read(agreement, paid.get(agreement.id, 0))

    async def update(self, agreement_id: str, req: AgreementUpdate) -> AgreementRead:
        agreement = await self._agreement_or_404(agreement_id)
        changes = req.model_dump(exclude_unset=True)
        if changes:
            agreement.update_from_dict(changes)
            await agreement.save()
        paid = await paid_by_agreement([agreement.id])
        return self._read(agreement, paid.get(agreement.id, 0))

    async def delete(self, agreement_id: str) -> None:
        agreement = await self._agreement_or_404(agreement_id)
        agreement.deleted_at = datetime.now(UTC)
        await agreement.save()

    async def list_advances(self, project_id: str, *, limit: int, offset: int) -> AdvancePage:
        await self._project_or_404(project_id)
        query = Advance.filter(project_id=project_id, deleted_at__isnull=True)
        total = await query.count()
        rows = await query.offset(offset).limit(limit).prefetch_related("person")
        return AdvancePage(
            items=[self._advance(row) for row in rows],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def add_advance(self, project_id: str, req: AdvanceCreate) -> AdvanceRead:
        await self._project_or_404(project_id)
        person = await Person.get_or_none(id=req.person_id, deleted_at__isnull=True)
        if person is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")
        advance = await Advance.create(
            project_id=project_id,
            person_id=req.person_id,
            given_on=req.given_on or date.today(),
            amount=req.amount,
            notes=req.notes,
        )
        await advance.fetch_related("person")
        return self._advance(advance)

    async def update_advance(self, advance_id: str, req: AdvanceUpdate) -> AdvanceRead:
        advance = await self._advance_or_404(advance_id)
        changes = req.model_dump(exclude_unset=True)
        if changes:
            advance.update_from_dict(changes)
            await advance.save()
        return self._advance(advance)

    async def delete_advance(self, advance_id: str) -> None:
        advance = await self._advance_or_404(advance_id)
        advance.deleted_at = datetime.now(UTC)
        await advance.save()

    async def balances(self, project_id: str) -> list[PersonBalance]:
        project = await self._project_or_404(project_id)
        people = await Person.filter(deleted_at__isnull=True)
        ids = [person.id for person in people]
        balances = await person_balances(ids, project_id)

        advanced: dict[str, int] = defaultdict(int)
        for row in await Advance.filter(project_id=project_id, deleted_at__isnull=True).values(
            "amount", "person_id"
        ):
            advanced[str(row["person_id"])] += int(row["amount"])

        spent: dict[str, int] = defaultdict(int)
        for row in await Expense.filter(
            project_id=project_id,
            deleted_at__isnull=True,
            paid_by_id__not_isnull=True,
        ).values("amount", "paid_by_id"):
            spent[str(row["paid_by_id"])] += int(row["amount"])

        return [
            PersonBalance(
                person_id=person.id,
                person_name=person.name,
                project_id=project.id,
                currency_code=project.currency_id,
                currency_exponent=project.currency.exponent,
                advanced_amount=advanced.get(person.id, 0),
                spent_amount=spent.get(person.id, 0),
                balance_amount=balances.get(person.id, 0),
            )
            for person in people
            if advanced.get(person.id) or spent.get(person.id)
        ]

    def _read(self, agreement: Agreement, paid: int) -> AgreementRead:
        return AgreementRead(
            id=agreement.id,
            project_id=agreement.project_id,
            vendor_id=agreement.vendor_id,
            vendor_name=agreement.vendor.name,
            description=agreement.description,
            agreed_amount=agreement.agreed_amount,
            paid_amount=paid,
            balance_amount=balance_of(agreement.agreed_amount, paid),
            notes=agreement.notes,
            created_at=agreement.created_at,
            updated_at=agreement.updated_at,
            deleted_at=agreement.deleted_at,
        )

    def _advance(self, advance: Advance) -> AdvanceRead:
        return AdvanceRead(
            id=advance.id,
            project_id=advance.project_id,
            person_id=advance.person_id,
            person_name=advance.person.name,
            given_on=advance.given_on,
            amount=advance.amount,
            notes=advance.notes,
            created_at=advance.created_at,
            updated_at=advance.updated_at,
            deleted_at=advance.deleted_at,
        )

    async def _project_or_404(self, project_id: str) -> Project:
        project = await Project.get_or_none(
            id=project_id, deleted_at__isnull=True
        ).prefetch_related("currency")
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        return project

    async def _agreement_or_404(self, agreement_id: str) -> Agreement:
        agreement = await Agreement.get_or_none(
            id=agreement_id, deleted_at__isnull=True
        ).prefetch_related("vendor")
        if agreement is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agreement not found")
        return agreement

    async def _advance_or_404(self, advance_id: str) -> Advance:
        advance = await Advance.get_or_none(
            id=advance_id, deleted_at__isnull=True
        ).prefetch_related("person")
        if advance is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Advance not found")
        return advance
