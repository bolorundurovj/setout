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
        include_archived: bool,
        limit: int,
        offset: int,
    ) -> DeliveryPage:
        if project_id is not None:
            await self._project_or_404(project_id)
        query = Delivery.all()
        if not include_archived:
            query = query.filter(archived_at__isnull=True, expense__archived_at__isnull=True)
        if project_id is not None:
            query = query.filter(project_id=project_id)
        if vendor_id is not None:
            query = query.filter(expense__vendor_id=vendor_id)
        if outstanding_only:
            query = query.filter(received_at__isnull=True)
        if received_only:
            query = query.filter(received_at__isnull=False)
        total = await query.count()
        outstanding_rows = query.filter(received_at__isnull=True)
        if include_archived:
            outstanding_rows = outstanding_rows.filter(
                archived_at__isnull=True, expense__archived_at__isnull=True
            )
        outstanding = await outstanding_rows.prefetch_related("expense")
        rows = (
            await query.order_by("-created_at", "id")
            .offset(offset)
            .limit(limit)
            .prefetch_related("expense__vendor", "project__currency")
        )
        return DeliveryPage(
            items=[self._read(row) for row in rows],
            total=total,
            outstanding_amount=sum(row.expense.amount for row in outstanding),
            limit=limit,
            offset=offset,
        )

    async def create(self, project_id: str, req: DeliveryCreate) -> DeliveryRead:
        await self._project_or_404(project_id)
        expense = await Expense.get_or_none(id=req.expense_id, archived_at__isnull=True)
        if expense is None or expense.project_id != project_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
        if await Delivery.filter(expense_id=expense.id, archived_at__isnull=True).exists():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This expense already has a delivery",
            )
        delivery = await Delivery.create(
            project_id=project_id,
            expense_id=expense.id,
            description=req.description or expense.description,
            expected=req.expected,
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

    async def mark_received(self, delivery_id: str) -> DeliveryRead:
        delivery = await self._delivery_or_404(delivery_id)
        if delivery.received_at is None:
            delivery.received_at = datetime.now(UTC)
            await delivery.save()
        return self._read(delivery)

    async def mark_not_received(self, delivery_id: str) -> DeliveryRead:
        delivery = await self._delivery_or_404(delivery_id)
        if delivery.received_at is not None:
            delivery.received_at = None
            await delivery.save()
        return self._read(delivery)

    async def archive(self, delivery_id: str) -> None:
        delivery = await self._delivery_or_404(delivery_id)
        delivery.archived_at = datetime.now(UTC)
        await delivery.save()

    async def restore(self, delivery_id: str) -> DeliveryRead:
        delivery = await self._delivery_or_404(delivery_id, include_archived=True)
        if delivery.archived_at is not None:
            delivery.archived_at = None
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
            expected=delivery.expected,
            amount=expense.amount,
            currency_code=delivery.project.currency_id,
            currency_exponent=delivery.project.currency.exponent,
            spent_on=expense.spent_on,
            received_at=delivery.received_at,
            created_at=delivery.created_at,
            updated_at=delivery.updated_at,
            archived_at=delivery.archived_at,
        )

    async def _project_or_404(self, project_id: str) -> Project:
        project = await Project.get_or_none(id=project_id, archived_at__isnull=True)
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        return project

    async def _delivery_or_404(
        self, delivery_id: str, *, include_archived: bool = False
    ) -> Delivery:
        delivery = await Delivery.get_or_none(id=delivery_id).prefetch_related(
            "expense__vendor", "project__currency"
        )
        if delivery is None or (delivery.archived_at is not None and not include_archived):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
        if delivery.expense.archived_at is not None and not include_archived:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
        return delivery
