from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status

from setout.controllers.change import ChangeController
from setout.models.user import User
from setout.routers.auth import get_current_user
from setout.schemas.change import ChangePage

router = APIRouter(
    tags=["changes"],
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"}},
)

CurrentUser = Annotated[User, Depends(get_current_user)]
Limit = Annotated[int, Query(ge=1, le=100, description="Rows per page")]
Offset = Annotated[int, Query(ge=0, description="Rows to skip")]

controller = ChangeController()

NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "Not found"}
}


@router.get("/changes", operation_id="listChanges", responses=NOT_FOUND)
async def list_changes(
    user: CurrentUser,
    entity: Annotated[str, Query(description="The table of the record, such as expense")],
    entity_id: Annotated[str, Query(description="The id of the record")],
    limit: Limit = 20,
    offset: Offset = 0,
) -> ChangePage:
    """The change history of one record, newest first. Deleted records keep their history."""
    return await controller.list_for(entity, entity_id, limit=limit, offset=offset)


@router.get(
    "/projects/{project_id}/changes", operation_id="listProjectChanges", responses=NOT_FOUND
)
async def list_project_changes(
    project_id: str, user: CurrentUser, limit: Limit = 20, offset: Offset = 0
) -> ChangePage:
    """The change history of every record in the project, newest first."""
    return await controller.list_for_project(project_id, limit=limit, offset=offset)
