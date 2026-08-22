from __future__ import annotations

from setout.models.currency import Currency
from setout.schemas.currency import CurrencyRead


class CurrencyController:
    async def list(self) -> list[CurrencyRead]:
        return [CurrencyRead.model_validate(c) for c in await Currency.all()]
