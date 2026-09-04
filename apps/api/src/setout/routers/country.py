from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from setout.controllers.country import CountryController
from setout.models.user import User
from setout.routers.auth import get_current_user
from setout.schemas.country import CountryRead, StateRead

router = APIRouter(
    tags=["countries"],
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"}},
)

CurrentUser = Annotated[User, Depends(get_current_user)]

controller = CountryController()


@router.get("/countries", operation_id="listCountries")
async def list_countries(user: CurrentUser) -> list[CountryRead]:
    return await controller.list_countries()


@router.get(
    "/countries/{country_code}/states",
    operation_id="listStates",
    responses={status.HTTP_404_NOT_FOUND: {"description": "Not found"}},
)
async def list_states(country_code: str, user: CurrentUser) -> list[StateRead]:
    """The states, provinces or regions of one country. What a plot's state must be one of."""
    return await controller.list_states(country_code)
