from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status

from setout.controllers.project import ProjectController
from setout.models.user import User
from setout.routers.auth import get_current_user
from setout.schemas.project import (
    ProjectCreate,
    ProjectPage,
    ProjectRead,
    ProjectSummary,
    ProjectUpdate,
)

router = APIRouter(
    tags=["projects"],
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"}},
)

CurrentUser = Annotated[User, Depends(get_current_user)]

controller = ProjectController()

NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "Project not found"}
}
NOT_ARCHIVED: dict[int | str, dict[str, Any]] = {
    status.HTTP_409_CONFLICT: {"description": "Project is not archived"}
}


@router.get("/projects", operation_id="listProjects")
async def list_projects(
    user: CurrentUser,
    include_deleted: Annotated[bool, Query(description="Include soft deleted projects")] = False,
    limit: Annotated[int, Query(ge=1, le=100, description="Rows per page")] = 20,
    offset: Annotated[int, Query(ge=0, description="Rows to skip")] = 0,
) -> ProjectPage:
    return await controller.list(include_deleted=include_deleted, limit=limit, offset=offset)


@router.post(
    "/projects",
    operation_id="createProject",
    status_code=status.HTTP_201_CREATED,
    responses={status.HTTP_422_UNPROCESSABLE_CONTENT: {"description": "Unknown currency"}},
)
async def create_project(req: ProjectCreate, user: CurrentUser) -> ProjectRead:
    return await controller.create(req)


@router.get("/project-summary", operation_id="getProjectSummary")
async def get_project_summary(user: CurrentUser) -> ProjectSummary:
    return await controller.summary()


@router.get("/projects/{project_id}", operation_id="getProject", responses=NOT_FOUND)
async def get_project(project_id: str, user: CurrentUser) -> ProjectRead:
    return await controller.get(project_id)


@router.patch("/projects/{project_id}", operation_id="updateProject", responses=NOT_FOUND)
async def update_project(project_id: str, req: ProjectUpdate, user: CurrentUser) -> ProjectRead:
    return await controller.update(project_id, req)


@router.delete(
    "/projects/{project_id}",
    operation_id="deleteProject",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={**NOT_FOUND, **NOT_ARCHIVED},
)
async def delete_project(project_id: str, user: CurrentUser) -> None:
    await controller.delete(project_id)


@router.post("/projects/{project_id}/restore", operation_id="restoreProject", responses=NOT_FOUND)
async def restore_project(project_id: str, user: CurrentUser) -> ProjectRead:
    return await controller.restore(project_id)
