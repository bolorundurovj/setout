from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from tortoise.functions import Count, Max, Min
from tortoise.transactions import in_transaction

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
    ItemPriceSeries,
    ItemPriceSummary,
    ItemRead,
    ItemUpdate,
)
from setout.services import changes
from setout.utils.currencies import currency_exponents
from setout.utils.items import price_change_percent

NOT_FOUND_ITEM = "Item not found"
DUPLICATE_NAME = "An item with that name already exists"


class ItemController:
    async def list_items(
        self, *, search: str | None, include_archived: bool, limit: int, offset: int
    ) -> ItemPage:
        query = Item.all() if include_archived else Item.filter(archived_at__isnull=True)
        if search:
            query = query.filter(name__icontains=search)
        total = await query.count()
        items = await query.offset(offset).limit(limit)
        reads = await self._reads(items)
        return ItemPage(
            items=reads,
            total=total,
            limit=limit,
            offset=offset,
        )

    async def create(self, req: ItemCreate) -> ItemRead:
        await self._reject_duplicate(req.name)
        item = await Item.create(**req.model_dump())
        return self._read(item, [])

    async def get(self, item_id: str) -> ItemRead:
        item = await self._item_or_404(item_id, include_archived=True)
        return (await self._reads([item]))[0]

    async def update(self, item_id: str, req: ItemUpdate) -> ItemRead:
        item = await self._item_or_404(item_id)
        updates = req.model_dump(exclude_unset=True)
        name = updates.get("name")
        if name is not None and name.casefold() != item.name.casefold():
            await self._reject_duplicate(name)
        if updates:
            item.update_from_dict(updates)
            await item.save()
        return (await self._reads([item]))[0]

    async def archive(self, item_id: str) -> None:
        item = await self._item_or_404(item_id)
        item.archived_at = datetime.now(UTC)
        await item.save()

    async def restore(self, item_id: str) -> ItemRead:
        item = await self._item_or_404(item_id, include_archived=True)
        if item.archived_at is not None:
            await self._reject_duplicate(item.name)
            item.archived_at = None
            await item.save()
        return (await self._reads([item]))[0]

    async def delete(self, item_id: str) -> None:
        async with in_transaction():
            item = await self._item_or_404(item_id, include_archived=True)
            if item.archived_at is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Only archived items can be deleted permanently",
                )
            await changes.recorded_update(Expense.filter(item_id=item.id), item_id=None)
            await item.delete()

    async def prices(self, item_id: str, *, limit: int, offset: int) -> ItemPrices:
        """One series per currency: summary over every price, points by page.

        The database groups the summary; only one page of points per series is
        read, in the same (spent_on, expense id) order the full series uses.
        """
        item = await self._item_or_404(item_id)
        groups = (
            await Expense.filter(item_id=item.id, unit_rate__isnull=False, archived_at__isnull=True)
            .group_by("project__currency_id")
            .annotate(
                n=Count("id"),
                lowest=Min("unit_rate"),
                highest=Max("unit_rate"),
                first_on=Min("spent_on"),
                last_on=Max("spent_on"),
            )
            .values("project__currency_id", "n", "lowest", "highest", "first_on", "last_on")
        )
        if not groups:
            return ItemPrices(item_id=item.id, name=item.name, unit=item.unit, series=[])
        exponents = await currency_exponents({row["project__currency_id"] for row in groups})
        dates = sorted({row["first_on"] for row in groups} | {row["last_on"] for row in groups})
        edges = await Expense.filter(
            item_id=item.id,
            unit_rate__isnull=False,
            archived_at__isnull=True,
            spent_on__in=dates,
        ).values("id", "project__currency_id", "spent_on", "unit_rate")
        boundary: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for edge in edges:
            boundary[str(edge["project__currency_id"])].append(edge)
        series: list[ItemPriceSeries] = []
        ordered = sorted(groups, key=lambda row: str(row["project__currency_id"]))
        for row in ordered:
            code = str(row["project__currency_id"])
            group = boundary[code]
            first = min(
                (edge for edge in group if edge["spent_on"] == row["first_on"]),
                key=lambda edge: str(edge["id"]),
            )
            last = max(
                (edge for edge in group if edge["spent_on"] == row["last_on"]),
                key=lambda edge: str(edge["id"]),
            )
            series.append(
                ItemPriceSeries(
                    currency_code=code,
                    currency_exponent=exponents[code],
                    count=int(row["n"]),
                    first_price=int(first["unit_rate"]),
                    first_paid_on=row["first_on"],
                    last_price=int(last["unit_rate"]),
                    last_paid_on=row["last_on"],
                    lowest_price=int(row["lowest"]),
                    highest_price=int(row["highest"]),
                    change_percent=price_change_percent(
                        int(first["unit_rate"]), int(last["unit_rate"]), int(row["n"])
                    ),
                    points_total=int(row["n"]),
                    points=await self._points_page(item.id, code, limit, offset),
                )
            )
        return ItemPrices(item_id=item.id, name=item.name, unit=item.unit, series=series)

    async def _points_page(
        self, item_id: str, currency_code: str, limit: int, offset: int
    ) -> list[ItemPricePoint]:
        rows = (
            await Expense.filter(
                item_id=item_id,
                unit_rate__isnull=False,
                archived_at__isnull=True,
                project__currency_id=currency_code,
            )
            .order_by("spent_on", "id")
            .offset(offset)
            .limit(limit)
            .prefetch_related("project", "vendor")
        )
        return [self._point(expense) for expense in rows]

    async def last_price(self, item_id: str, project_id: str) -> ItemLastPriceResponse:
        await self._item_or_404(item_id)
        project = await Project.get_or_none(
            id=project_id, archived_at__isnull=True
        ).prefetch_related("currency")
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        # The latest priced expense of this item in the project's currency. The
        # database picks the row; every earlier price is not needed here.
        latest = (
            await Expense.filter(
                item_id=item_id,
                unit_rate__isnull=False,
                archived_at__isnull=True,
                project__currency_id=project.currency_id,
            )
            .order_by("-spent_on", "-id")
            .prefetch_related("project", "vendor")
            .first()
        )
        if latest is None:
            return ItemLastPriceResponse(item_id=item_id, project_id=project_id, last_price=None)
        latest = (
            await Expense.filter(
                item_id=item_id,
                unit_rate__isnull=False,
                archived_at__isnull=True,
                project__currency_id=project.currency_id,
            )
            .order_by("-spent_on", "-id")
            .prefetch_related("project", "vendor")
            .first()
        )
        if latest is None:
            return ItemLastPriceResponse(item_id=item_id, project_id=project_id, last_price=None)
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
            archived_at__isnull=True,
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
        """Price summaries per item and currency, with the database doing the grouping."""
        if not item_ids:
            return {}
        rows = (
            await Expense.filter(
                item_id__in=item_ids, unit_rate__isnull=False, archived_at__isnull=True
            )
            .group_by("item_id", "project__currency_id")
            .annotate(
                n=Count("id"),
                lowest=Min("unit_rate"),
                highest=Max("unit_rate"),
                first_on=Min("spent_on"),
                last_on=Max("spent_on"),
            )
            .values(
                "item_id",
                "project__currency_id",
                "n",
                "lowest",
                "highest",
                "first_on",
                "last_on",
            )
        )
        if not rows:
            return {}
        # The first and last prices are the ones at each group's boundary dates,
        # read in the same (spent_on, expense id) order the price series uses.
        dates = sorted({row["first_on"] for row in rows} | {row["last_on"] for row in rows})
        edges = await Expense.filter(
            item_id__in=item_ids,
            unit_rate__isnull=False,
            archived_at__isnull=True,
            spent_on__in=dates,
        ).values("id", "item_id", "project__currency_id", "spent_on", "unit_rate")
        boundary: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
        for edge in edges:
            boundary[(str(edge["item_id"]), str(edge["project__currency_id"]))].append(edge)
        exponents = await currency_exponents({row["project__currency_id"] for row in rows})
        grouped: dict[str, dict[tuple[str, int], ItemPriceSummary]] = {}
        for row in rows:
            group = boundary[(str(row["item_id"]), str(row["project__currency_id"]))]
            first = min(
                (edge for edge in group if edge["spent_on"] == row["first_on"]),
                key=lambda edge: str(edge["id"]),
            )
            last = max(
                (edge for edge in group if edge["spent_on"] == row["last_on"]),
                key=lambda edge: str(edge["id"]),
            )
            code = str(row["project__currency_id"])
            key = (code, exponents[code])
            grouped.setdefault(str(row["item_id"]), {})[key] = ItemPriceSummary(
                currency_code=key[0],
                currency_exponent=key[1],
                count=int(row["n"]),
                first_price=int(first["unit_rate"]),
                first_paid_on=row["first_on"],
                last_price=int(last["unit_rate"]),
                last_paid_on=row["last_on"],
                lowest_price=int(row["lowest"]),
                highest_price=int(row["highest"]),
                change_percent=price_change_percent(
                    int(first["unit_rate"]), int(last["unit_rate"]), int(row["n"])
                ),
            )
        return {
            item_id: [by_currency[key] for key in sorted(by_currency)]
            for item_id, by_currency in grouped.items()
        }

    async def _reads(self, items: list[Item]) -> list[ItemRead]:
        ids = [i.id for i in items]
        prices = await self._price_summaries(ids)
        rows = (
            await Expense.filter(item_id__in=ids, archived_at__isnull=True)
            .annotate(n=Count("id"))
            .group_by("item_id")
            .values("item_id", "n")
        )
        counts = {row["item_id"]: row["n"] for row in rows}
        return [self._read(i, prices.get(i.id, []), counts.get(i.id, 0)) for i in items]

    def _read(self, item: Item, prices: list[ItemPriceSummary], count: int = 0) -> ItemRead:
        return ItemRead(
            id=item.id,
            name=item.name,
            unit=item.unit,
            notes=item.notes,
            purchase_count=count,
            prices=prices,
            created_at=item.created_at,
            updated_at=item.updated_at,
            archived_at=item.archived_at,
        )

    async def _reject_duplicate(self, name: str) -> None:
        existing = await Item.filter(name__iexact=name, archived_at__isnull=True).exists()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DUPLICATE_NAME)

    async def _item_or_404(self, item_id: str, *, include_archived: bool = False) -> Item:
        item = await Item.get_or_none(id=item_id)
        if item is None or (item.archived_at is not None and not include_archived):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_ITEM)
        return item
