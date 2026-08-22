from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from setout.controllers.install import InstallController
from setout.models.user import User
from setout.routers.auth import get_current_user
from setout.schemas.install import Backup, Install, RestoreRequest, RestoreResult

router = APIRouter(
    prefix="/install",
    tags=["install"],
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"}},
)

CurrentUser = Annotated[User, Depends(get_current_user)]

controller = InstallController()


@router.get("", operation_id="getInstall")
async def get_install(user: CurrentUser) -> Install:
    return await controller.facts()


@router.get("/export", operation_id="exportRecord")
async def export_record(user: CurrentUser) -> Backup:
    return await controller.export()


@router.post(
    "/restore",
    operation_id="restoreRecord",
    responses={
        status.HTTP_409_CONFLICT: {"description": "Written by a different Setout or schema"},
        status.HTTP_422_UNPROCESSABLE_CONTENT: {"description": "The file does not fit"},
    },
)
async def restore_record(req: RestoreRequest, user: CurrentUser) -> RestoreResult:
    return await controller.restore(req)
