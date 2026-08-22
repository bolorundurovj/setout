from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status

from setout.controllers.scope import ScopeController
from setout.models.user import User
from setout.routers.auth import get_current_user
from setout.schemas.scope import (
    BudgetItemCreate,
    BudgetItemPage,
    BudgetItemRead,
    BudgetItemUpdate,
    ProjectBudget,
    ScopeCreate,
    ScopePresetRead,
    ScopeRead,
    ScopeUpdate,
)

router = APIRouter(
    tags=["scopes"],
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"}},
)

CurrentUser = Annotated[User, Depends(get_current_user)]

controller = ScopeController()

NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "Not found"}
}
IS_GROUP: dict[int | str, dict[str, Any]] = {
    status.HTTP_409_CONFLICT: {"description": "Scope holds no budget of its own"}
}


@router.get("/scope-presets", operation_id="listScopePresets")
async def list_scope_presets(user: CurrentUser) -> list[ScopePresetRead]:
    return await controller.list_presets()


@router.get("/projects/{project_id}/scopes", operation_id="listScopes", responses=NOT_FOUND)
async def list_scopes(project_id: str, user: CurrentUser) -> list[ScopeRead]:
    return await controller.list_scopes(project_id)


@router.post(
    "/projects/{project_id}/scopes",
    operation_id="createScope",
    status_code=status.HTTP_201_CREATED,
    responses=NOT_FOUND,
)
async def create_scope(project_id: str, req: ScopeCreate, user: CurrentUser) -> ScopeRead:
    return await controller.create(project_id, req)


@router.get("/projects/{project_id}/budget", operation_id="getProjectBudget", responses=NOT_FOUND)
async def get_project_budget(project_id: str, user: CurrentUser) -> ProjectBudget:
    return await controller.budget(project_id)


@router.patch("/scopes/{scope_id}", operation_id="updateScope", responses=NOT_FOUND)
async def update_scope(scope_id: str, req: ScopeUpdate, user: CurrentUser) -> ScopeRead:
    return await controller.update(scope_id, req)


@router.delete(
    "/scopes/{scope_id}",
    operation_id="deleteScope",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        **NOT_FOUND,
        status.HTTP_409_CONFLICT: {"description": "The scope holds expenses"},
    },
)
async def delete_scope(scope_id: str, user: CurrentUser) -> None:
    await controller.delete(scope_id)


@router.post("/scopes/{scope_id}/restore", operation_id="restoreScope", responses=NOT_FOUND)
async def restore_scope(scope_id: str, user: CurrentUser) -> ScopeRead:
    return await controller.restore(scope_id)


@router.get(
    "/scopes/{scope_id}/budget-items",
    operation_id="listBudgetItems",
    responses=NOT_FOUND,
)
async def list_budget_items(
    scope_id: str,
    user: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=100, description="Rows per page")] = 20,
    offset: Annotated[int, Query(ge=0, description="Rows to skip")] = 0,
) -> BudgetItemPage:
    return await controller.list_items(scope_id, limit=limit, offset=offset)


@router.post(
    "/scopes/{scope_id}/budget-items",
    operation_id="addBudgetItem",
    status_code=status.HTTP_201_CREATED,
    responses={**NOT_FOUND, **IS_GROUP},
)
async def add_budget_item(
    scope_id: str, req: BudgetItemCreate, user: CurrentUser
) -> BudgetItemRead:
    return await controller.add_item(scope_id, req)


@router.patch("/budget-items/{item_id}", operation_id="updateBudgetItem", responses=NOT_FOUND)
async def update_budget_item(
    item_id: str, req: BudgetItemUpdate, user: CurrentUser
) -> BudgetItemRead:
    return await controller.update_item(item_id, req)


@router.delete(
    "/budget-items/{item_id}",
    operation_id="deleteBudgetItem",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND,
)
async def delete_budget_item(item_id: str, user: CurrentUser) -> None:
    await controller.delete_item(item_id)
