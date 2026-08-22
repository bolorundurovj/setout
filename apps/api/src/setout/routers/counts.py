from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from setout.controllers.counts import CountsController
from setout.models.user import User
from setout.routers.auth import get_current_user
from setout.schemas.counts import Counts

router = APIRouter(
    prefix="/counts",
    tags=["counts"],
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"}},
)

CurrentUser = Annotated[User, Depends(get_current_user)]

controller = CountsController()


@router.get("", operation_id="getCounts")
async def get_counts(user: CurrentUser) -> Counts:
    return await controller.counts()
