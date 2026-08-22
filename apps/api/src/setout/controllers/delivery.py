from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status

from setout.models.delivery import Delivery
from setout.models.expense import Expense
from setout.models.project import Project
from setout.schemas.delivery import (
    DeliveryCreate,
    DeliveryPage,
    DeliveryRead,
    DeliveryUpdate,
)

NOT_FOUND = "Delivery not found"


class DeliveryController:
    async def list(
        self,
        project_id: str | None,
        *,
        vendor_id: str | None,
        outstanding_only: bool,
        received_only: bool,
        limit: int,
        offset: int,
    ) -> DeliveryPage:
        if project_id is not None:
            await self._project_or_404(project_id)
        query = Delivery.filter(deleted_at__isnull=True, expense__deleted_at__isnull=True)
        if project_id is not None:
            query = query.filter(project_id=project_id)
        if vendor_id is not None:
            query = query.filter(expense__vendor_id=vendor_id)
        if outstanding_only:
            query = query.filter(received_at__isnull=True)
        if received_only:
            query = query.filter(received_at__isnull=False)
        total = await query.count()
        owed = await query.filter(received_at__isnull=True).prefetch_related("expense")
        rows = (
            await query.offset(offset)
            .limit(limit)
            .prefetch_related("expense__vendor", "project__currency")
        )
        return DeliveryPage(
            items=[self._read(row) for row in rows],
            total=total,
            owed_amount=sum(row.expense.amount for row in owed),
            limit=limit,
            offset=offset,
        )

    async def create(self, project_id: str, req: DeliveryCreate) -> DeliveryRead:
        await self._project_or_404(project_id)
        expense = await Expense.get_or_none(id=req.expense_id, deleted_at__isnull=True)
        if expense is None or expense.project_id != project_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
        if await Delivery.filter(expense_id=expense.id, deleted_at__isnull=True).exists():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="That expense is already waiting on a delivery",
            )
        delivery = await Delivery.create(
            project_id=project_id,
            expense_id=expense.id,
            description=req.description or expense.description,
            promised=req.promised,
        )
        await delivery.fetch_related("expense__vendor", "project__currency")
        return self._read(delivery)

    async def get(self, delivery_id: str) -> DeliveryRead:
        return self._read(await self._delivery_or_404(delivery_id))

    async def update(self, delivery_id: str, req: DeliveryUpdate) -> DeliveryRead:
        delivery = await self._delivery_or_404(delivery_id)
        changes = req.model_dump(exclude_unset=True)
        if changes:
            delivery.update_from_dict(changes)
            await delivery.save()
        return self._read(delivery)

    async def receive(self, delivery_id: str) -> DeliveryRead:
        delivery = await self._delivery_or_404(delivery_id)
        if delivery.received_at is None:
            delivery.received_at = datetime.now(UTC)
            await delivery.save()
        return self._read(delivery)

    async def unreceive(self, delivery_id: str) -> DeliveryRead:
        delivery = await self._delivery_or_404(delivery_id)
        if delivery.received_at is not None:
            delivery.received_at = None
            await delivery.save()
        return self._read(delivery)

    async def delete(self, delivery_id: str) -> None:
        delivery = await self._delivery_or_404(delivery_id)
        delivery.deleted_at = datetime.now(UTC)
        await delivery.save()

    async def restore(self, delivery_id: str) -> DeliveryRead:
        delivery = await self._delivery_or_404(delivery_id, include_deleted=True)
        if delivery.deleted_at is not None:
            delivery.deleted_at = None
            await delivery.save()
        return self._read(delivery)

    def _read(self, delivery: Delivery) -> DeliveryRead:
        expense = delivery.expense
        vendor = expense.vendor
        return DeliveryRead(
            id=delivery.id,
            project_id=delivery.project_id,
            expense_id=delivery.expense_id,
            vendor_id=vendor.id if vendor else None,
            vendor_name=vendor.name if vendor else None,
            description=delivery.description,
            promised=delivery.promised,
            amount=expense.amount,
            currency_code=delivery.project.currency_id,
            currency_exponent=delivery.project.currency.exponent,
            spent_on=expense.spent_on,
            received_at=delivery.received_at,
            created_at=delivery.created_at,
            updated_at=delivery.updated_at,
            deleted_at=delivery.deleted_at,
        )

    async def _project_or_404(self, project_id: str) -> Project:
        project = await Project.get_or_none(id=project_id, deleted_at__isnull=True)
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        return project

    async def _delivery_or_404(
        self, delivery_id: str, *, include_deleted: bool = False
    ) -> Delivery:
        delivery = await Delivery.get_or_none(id=delivery_id).prefetch_related(
            "expense__vendor", "project__currency"
        )
        if delivery is None or (delivery.deleted_at is not None and not include_deleted):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
        if delivery.expense.deleted_at is not None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
        return delivery
