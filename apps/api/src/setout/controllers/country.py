from __future__ import annotations

from fastapi import HTTPException, status

from setout.models.country import Country, State
from setout.schemas.country import CountryRead, StateRead

NOT_FOUND_COUNTRY = "Country not found"


class CountryController:
    async def list_countries(self) -> list[CountryRead]:
        return [CountryRead.model_validate(c) for c in await Country.all()]

    async def list_states(self, country_code: str) -> list[StateRead]:
        code = country_code.upper()
        if not await Country.exists(code=code):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_COUNTRY)
        return [
            StateRead(code=row.code, country_code=row.country_id, name=row.name)
            for row in await State.filter(country_id=code)
        ]
