from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status

from setout.models.expense import Expense
from setout.models.item import Item
from setout.models.project import Project
from setout.schemas.item import (
    ItemCreate,
    ItemLastPrice,
    ItemLastPriceResponse,
    ItemPage,
    ItemPricePoint,
    ItemPrices,
    ItemPriceSummary,
    ItemRead,
    ItemUpdate,
)
from setout.utils.items import summarise, summarise_series

NOT_FOUND_ITEM = "Item not found"
DUPLICATE_NAME = "An item with that name already exists"


class ItemController:
    async def list_items(self, *, search: str | None, limit: int, offset: int) -> ItemPage:
        query = Item.filter(deleted_at__isnull=True)
        if search:
            query = query.filter(name__icontains=search)
        total = await query.count()
        items = await query.offset(offset).limit(limit)
        prices = await self._price_summaries([item.id for item in items])
        return ItemPage(
            items=[self._read(item, prices.get(item.id, [])) for item in items],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def create(self, req: ItemCreate) -> ItemRead:
        await self._reject_duplicate(req.name)
        item = await Item.create(**req.model_dump())
        return self._read(item, [])

    async def get(self, item_id: str) -> ItemRead:
        item = await self._item_or_404(item_id)
        prices = await self._price_summaries([item.id])
        return self._read(item, prices.get(item.id, []))

    async def update(self, item_id: str, req: ItemUpdate) -> ItemRead:
        item = await self._item_or_404(item_id)
        changes = req.model_dump(exclude_unset=True)
        name = changes.get("name")
        if name is not None and name.casefold() != item.name.casefold():
            await self._reject_duplicate(name)
        if changes:
            item.update_from_dict(changes)
            await item.save()
        prices = await self._price_summaries([item.id])
        return self._read(item, prices.get(item.id, []))

    async def delete(self, item_id: str) -> None:
        item = await self._item_or_404(item_id)
        item.deleted_at = datetime.now(UTC)
        await item.save()

    async def restore(self, item_id: str) -> ItemRead:
        item = await self._item_or_404(item_id, include_deleted=True)
        if item.deleted_at is not None:
            item.deleted_at = None
            await item.save()
        prices = await self._price_summaries([item.id])
        return self._read(item, prices.get(item.id, []))

    async def prices(self, item_id: str) -> ItemPrices:
        item = await self._item_or_404(item_id)
        by_currency: dict[tuple[str, int], list[ItemPricePoint]] = {}
        for expense in await self._priced_expenses(item_id):
            key = (expense.project.currency_id, expense.project.currency.exponent)
            by_currency.setdefault(key, []).append(self._point(expense))
        return ItemPrices(
            item_id=item.id,
            name=item.name,
            unit=item.unit,
            series=[
                summarise_series(code, exponent, points)
                for (code, exponent), points in sorted(by_currency.items())
            ],
        )

    async def last_price(self, item_id: str, project_id: str) -> ItemLastPriceResponse:
        await self._item_or_404(item_id)
        project = await Project.get_or_none(
            id=project_id, deleted_at__isnull=True
        ).prefetch_related("currency")
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        priced = [
            expense
            for expense in await self._priced_expenses(item_id)
            if expense.project.currency_id == project.currency_id
        ]
        if not priced:
            return ItemLastPriceResponse(item_id=item_id, project_id=project_id, last_price=None)
        latest = max(priced, key=lambda expense: (expense.spent_on, expense.created_at))
        return ItemLastPriceResponse(
            item_id=item_id,
            project_id=project_id,
            last_price=ItemLastPrice(
                item_id=item_id,
                currency_code=project.currency_id,
                currency_exponent=project.currency.exponent,
                unit_rate=latest.unit_rate or 0,
                spent_on=latest.spent_on,
                project_id=latest.project_id,
                project_name=latest.project.name,
                vendor_id=latest.vendor_id,
                vendor_name=latest.vendor.name if latest.vendor else None,
            ),
        )

    async def _priced_expenses(self, item_id: str) -> list[Expense]:
        return await Expense.filter(
            item_id=item_id,
            unit_rate__isnull=False,
            deleted_at__isnull=True,
        ).prefetch_related("project__currency", "vendor")

    def _point(self, expense: Expense) -> ItemPricePoint:
        return ItemPricePoint(
            expense_id=expense.id,
            spent_on=expense.spent_on,
            unit_rate=expense.unit_rate or 0,
            quantity=expense.quantity,
            project_id=expense.project_id,
            project_name=expense.project.name,
            vendor_id=expense.vendor_id,
            vendor_name=expense.vendor.name if expense.vendor else None,
        )

    async def _price_summaries(self, item_ids: list[str]) -> dict[str, list[ItemPriceSummary]]:
        if not item_ids:
            return {}
        grouped: dict[str, dict[tuple[str, int], list[ItemPricePoint]]] = {}
        for expense in await Expense.filter(
            item_id__in=item_ids,
            unit_rate__isnull=False,
            deleted_at__isnull=True,
        ).prefetch_related("project__currency", "vendor"):
            if expense.item_id is None:
                continue
            key = (expense.project.currency_id, expense.project.currency.exponent)
            grouped.setdefault(expense.item_id, {}).setdefault(key, []).append(self._point(expense))
        return {
            item_id: [
                summarise(code, exponent, points)
                for (code, exponent), points in sorted(by_currency.items())
            ]
            for item_id, by_currency in grouped.items()
        }

    def _read(self, item: Item, prices: list[ItemPriceSummary]) -> ItemRead:
        return ItemRead(
            id=item.id,
            name=item.name,
            unit=item.unit,
            notes=item.notes,
            purchase_count=sum(summary.count for summary in prices),
            prices=prices,
            created_at=item.created_at,
            updated_at=item.updated_at,
            deleted_at=item.deleted_at,
        )

    async def _reject_duplicate(self, name: str) -> None:
        existing = await Item.filter(name__iexact=name, deleted_at__isnull=True).exists()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DUPLICATE_NAME)

    async def _item_or_404(self, item_id: str, *, include_deleted: bool = False) -> Item:
        item = await Item.get_or_none(id=item_id)
        if item is None or (item.deleted_at is not None and not include_deleted):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_ITEM)
        return item
