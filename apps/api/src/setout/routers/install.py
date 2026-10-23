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
    return await controller.info()


@router.get("/export", operation_id="exportBackup")
async def export_backup(user: CurrentUser) -> Backup:
    return await controller.export()


@router.post(
    "/restore",
    operation_id="restoreBackup",
    responses={
        status.HTTP_409_CONFLICT: {
            "description": "Created by a different Setout version or schema"
        },
        status.HTTP_422_UNPROCESSABLE_CONTENT: {
            "description": "The file is not a valid backup for this schema"
        },
    },
)
async def restore_backup(req: RestoreRequest, user: CurrentUser) -> RestoreResult:
    return await controller.restore(req)
