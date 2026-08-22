from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status

from setout.controllers.person import PersonController
from setout.models.user import User
from setout.routers.auth import get_current_user
from setout.schemas.person import (
    PersonCreate,
    PersonPage,
    PersonRead,
    PersonSpend,
    PersonUpdate,
)

router = APIRouter(
    tags=["people"],
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"}},
)

CurrentUser = Annotated[User, Depends(get_current_user)]

controller = PersonController()

NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "Not found"}
}
DUPLICATE: dict[int | str, dict[str, Any]] = {
    status.HTTP_409_CONFLICT: {"description": "That name is already taken"}
}


@router.get("/people", operation_id="listPeople")
async def list_people(
    user: CurrentUser,
    search: Annotated[str | None, Query(description="Match part of the name")] = None,
    include_archived: Annotated[bool, Query(description="Include archived people")] = False,
    limit: Annotated[int, Query(ge=1, le=100, description="Rows per page")] = 20,
    offset: Annotated[int, Query(ge=0, description="Rows to skip")] = 0,
) -> PersonPage:
    return await controller.list_people(
        search=search, include_archived=include_archived, limit=limit, offset=offset
    )


@router.post(
    "/people",
    operation_id="createPerson",
    status_code=status.HTTP_201_CREATED,
    responses=DUPLICATE,
)
async def create_person(req: PersonCreate, user: CurrentUser) -> PersonRead:
    return await controller.create(req)


@router.get("/people/{person_id}", operation_id="getPerson", responses=NOT_FOUND)
async def get_person(person_id: str, user: CurrentUser) -> PersonRead:
    return await controller.get(person_id)


@router.patch(
    "/people/{person_id}",
    operation_id="updatePerson",
    responses={**NOT_FOUND, **DUPLICATE},
)
async def update_person(person_id: str, req: PersonUpdate, user: CurrentUser) -> PersonRead:
    return await controller.update(person_id, req)


@router.delete(
    "/people/{person_id}",
    operation_id="deletePerson",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND,
)
async def delete_person(person_id: str, user: CurrentUser) -> None:
    await controller.delete(person_id)


@router.post("/people/{person_id}/restore", operation_id="restorePerson", responses=NOT_FOUND)
async def restore_person(person_id: str, user: CurrentUser) -> PersonRead:
    return await controller.restore(person_id)


@router.get("/people/{person_id}/spend", operation_id="getPersonSpend", responses=NOT_FOUND)
async def get_person_spend(person_id: str, user: CurrentUser) -> PersonSpend:
    return await controller.spend(person_id)
