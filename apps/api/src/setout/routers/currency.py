from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from setout.controllers.currency import CurrencyController
from setout.models.user import User
from setout.routers.auth import get_current_user
from setout.schemas.currency import CurrencyRead

router = APIRouter(
    prefix="/currencies",
    tags=["currencies"],
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"}},
)

CurrentUser = Annotated[User, Depends(get_current_user)]

controller = CurrencyController()


@router.get("", operation_id="listCurrencies")
async def list_currencies(user: CurrentUser) -> list[CurrencyRead]:
    return await controller.list()
