from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime

from fastapi import HTTPException, status

from setout.models.currency import Currency
from setout.models.land import Land
from setout.models.land_valuation import LandValuation, LandValuationKind
from setout.schemas.land_valuation import (
    LandValuationCreate,
    LandValuationPage,
    LandValuationRead,
    LandValuationUpdate,
)

NOT_FOUND_LAND = "Land not found"
NOT_FOUND_VALUATION = "Valuation not found"
DUPLICATE_PURCHASE = "This land record already has a purchase price"


class LandValuationController:
    async def list(
        self, land_id: str, *, limit: int, offset: int, include_archived: bool
    ) -> LandValuationPage:
        await self._land_or_404(land_id)
        query = LandValuation.filter(land_id=land_id)
        if not include_archived:
            query = query.filter(archived_at__isnull=True)
        total = await query.count()
        rows = await query.offset(offset).limit(limit)
        exponents = await self._exponents(rows)
        return LandValuationPage(
            items=[self._read(row, exponents) for row in rows],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def create(self, land_id: str, req: LandValuationCreate) -> LandValuationRead:
        land = await self._land_or_404(land_id)
        code = req.currency_code.upper()
        currency = await Currency.get_or_none(code=code)
        if currency is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Unknown currency: {req.currency_code}",
            )
        if land.currency_id is not None and land.currency_id != code:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"This land's valuations must use {land.currency_id}",
            )
        if req.kind is LandValuationKind.PURCHASE and await self._has_purchase(land_id):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DUPLICATE_PURCHASE)

        row = await LandValuation.create(
            land_id=land_id,
            kind=req.kind,
            amount=req.amount,
            currency_id=code,
            valued_on=req.valued_on,
            notes=req.notes,
        )
        if land.currency_id is None:
            land.currency_id = code
            await land.save()
        return self._read(row, {code: currency.exponent})

    async def update(self, valuation_id: str, req: LandValuationUpdate) -> LandValuationRead:
        row = await self._valuation_or_404(valuation_id)
        changes = req.model_dump(exclude_unset=True)
        kind = changes.get("kind")
        if kind is LandValuationKind.PURCHASE and await self._has_purchase(
            row.land_id, exclude_id=row.id
        ):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DUPLICATE_PURCHASE)
        if changes:
            row.update_from_dict(changes)
            await row.save()
        return self._read(row, await self._exponents([row]))

    async def archive(self, valuation_id: str) -> None:
        row = await self._valuation_or_404(valuation_id)
        row.archived_at = datetime.now(UTC)
        await row.save()
        await self._clear_unused_currency(row.land_id)

    async def restore(self, valuation_id: str) -> LandValuationRead:
        row = await self._valuation_or_404(valuation_id, include_archived=True)
        if row.archived_at is not None:
            row.archived_at = None
            await row.save()
            land = await Land.get_or_none(id=row.land_id)
            if land is not None and land.currency_id is None:
                land.currency_id = row.currency_id
                await land.save()
        return self._read(row, await self._exponents([row]))

    async def _has_purchase(self, land_id: str, *, exclude_id: str | None = None) -> bool:
        query = LandValuation.filter(
            land_id=land_id, kind=LandValuationKind.PURCHASE, archived_at__isnull=True
        )
        if exclude_id is not None:
            query = query.exclude(id=exclude_id)
        return await query.exists()

    async def _clear_unused_currency(self, land_id: str) -> None:
        """Clears the currency once no valuations remain, so another currency can be used."""
        if await LandValuation.filter(land_id=land_id, archived_at__isnull=True).exists():
            return
        land = await Land.get_or_none(id=land_id)
        if land is not None and land.currency_id is not None:
            land.currency_id = None
            await land.save()

    async def _exponents(self, rows: Sequence[LandValuation]) -> dict[str, int]:
        codes = {row.currency_id for row in rows}
        if not codes:
            return {}
        return {c.code: c.exponent for c in await Currency.filter(code__in=sorted(codes))}

    def _read(self, row: LandValuation, exponents: dict[str, int]) -> LandValuationRead:
        return LandValuationRead(
            id=row.id,
            land_id=row.land_id,
            kind=row.kind,
            amount=row.amount,
            currency_code=row.currency_id,
            currency_exponent=exponents.get(row.currency_id, 2),
            valued_on=row.valued_on,
            notes=row.notes,
            created_at=row.created_at,
            updated_at=row.updated_at,
            archived_at=row.archived_at,
        )

    async def _land_or_404(self, land_id: str) -> Land:
        land = await Land.get_or_none(id=land_id, archived_at__isnull=True)
        if land is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_LAND)
        return land

    async def _valuation_or_404(
        self, valuation_id: str, *, include_archived: bool = False
    ) -> LandValuation:
        row = await LandValuation.get_or_none(id=valuation_id)
        if row is None or (row.archived_at is not None and not include_archived):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_VALUATION)
        return row
