from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

from setout.controllers.install import InstallController
from setout.models.user import User
from setout.routers.auth import clear_session_cookie, get_current_user
from setout.schemas.install import Backup, ExportRequest, Install, RestoreRequest, RestoreResult
from setout.services.auth import verify_passphrase

router = APIRouter(
    prefix="/install",
    tags=["install"],
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"}},
)
security_logger = logging.getLogger("setout.security")

CurrentUser = Annotated[User, Depends(get_current_user)]

controller = InstallController()

WRONG_PASSPHRASE: dict[int | str, dict[str, Any]] = {
    status.HTTP_403_FORBIDDEN: {"description": "The passphrase is incorrect"}
}


async def _require_passphrase(passphrase: str, user: User) -> None:
    """A backup holds every record and the passphrase hash, so the passphrase is asked again."""
    if not await run_in_threadpool(verify_passphrase, passphrase, user.passphrase_hash):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="The passphrase is incorrect"
        )


@router.get("", operation_id="getInstall")
async def get_install(user: CurrentUser) -> Install:
    return await controller.info()


@router.post(
    "/export", operation_id="exportBackup", response_model=Backup, responses=WRONG_PASSPHRASE
)
async def export_backup(req: ExportRequest, user: CurrentUser) -> StreamingResponse:
    await _require_passphrase(req.passphrase, user)

    async def stream() -> AsyncIterator[str]:
        async for chunk in controller.export():
            yield chunk
        security_logger.info("Backup exported by user_id=%s", user.id)

    return StreamingResponse(stream(), media_type="application/json")


@router.post(
    "/restore",
    operation_id="restoreBackup",
    responses={
        **WRONG_PASSPHRASE,
        status.HTTP_409_CONFLICT: {
            "description": (
                "The backup is from a different Setout version or schema, "
                "or another restore is in progress"
            )
        },
        status.HTTP_413_CONTENT_TOO_LARGE: {
            "description": "The backup is larger than the server accepts"
        },
        status.HTTP_422_UNPROCESSABLE_CONTENT: {
            "description": "The file is not a valid backup for this schema"
        },
    },
)
async def restore_backup(
    req: RestoreRequest, user: CurrentUser, response: Response
) -> RestoreResult:
    await _require_passphrase(req.passphrase, user)
    result = await controller.restore(req)
    clear_session_cookie(response)
    security_logger.warning(
        "Backup restored by user_id=%s (%d rows)", user.id, sum(result.row_counts.values())
    )
    return result
