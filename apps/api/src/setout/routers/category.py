from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status

from setout.controllers.category import CategoryController
from setout.models.user import User
from setout.routers.auth import get_current_user
from setout.schemas.category import (
    BudgetItemCreate,
    BudgetItemPage,
    BudgetItemRead,
    BudgetItemUpdate,
    CategoryCreate,
    CategoryPresetRead,
    CategoryRead,
    CategoryUpdate,
    ProjectBudget,
)

router = APIRouter(
    tags=["categories"],
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"}},
)

CurrentUser = Annotated[User, Depends(get_current_user)]

controller = CategoryController()

NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "Not found"}
}
IS_GROUP: dict[int | str, dict[str, Any]] = {
    status.HTTP_409_CONFLICT: {"description": "Category holds no budget of its own"}
}


@router.get("/category-presets", operation_id="listCategoryPresets")
async def list_category_presets(user: CurrentUser) -> list[CategoryPresetRead]:
    return await controller.list_presets()


@router.get("/projects/{project_id}/categories", operation_id="listCategories", responses=NOT_FOUND)
async def list_categories(project_id: str, user: CurrentUser) -> list[CategoryRead]:
    return await controller.list_categories(project_id)


@router.post(
    "/projects/{project_id}/categories",
    operation_id="createCategory",
    status_code=status.HTTP_201_CREATED,
    responses=NOT_FOUND,
)
async def create_category(project_id: str, req: CategoryCreate, user: CurrentUser) -> CategoryRead:
    return await controller.create(project_id, req)


@router.get("/projects/{project_id}/budget", operation_id="getProjectBudget", responses=NOT_FOUND)
async def get_project_budget(project_id: str, user: CurrentUser) -> ProjectBudget:
    return await controller.budget(project_id)


@router.patch("/categories/{category_id}", operation_id="updateCategory", responses=NOT_FOUND)
async def update_category(category_id: str, req: CategoryUpdate, user: CurrentUser) -> CategoryRead:
    return await controller.update(category_id, req)


@router.delete(
    "/categories/{category_id}",
    operation_id="deleteCategory",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        **NOT_FOUND,
        status.HTTP_409_CONFLICT: {"description": "The category holds expenses"},
    },
)
async def delete_category(category_id: str, user: CurrentUser) -> None:
    await controller.delete(category_id)


@router.post(
    "/categories/{category_id}/restore", operation_id="restoreCategory", responses=NOT_FOUND
)
async def restore_category(category_id: str, user: CurrentUser) -> CategoryRead:
    return await controller.restore(category_id)


@router.get(
    "/categories/{category_id}/budget-items",
    operation_id="listBudgetItems",
    responses=NOT_FOUND,
)
async def list_budget_items(
    category_id: str,
    user: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=100, description="Rows per page")] = 20,
    offset: Annotated[int, Query(ge=0, description="Rows to skip")] = 0,
) -> BudgetItemPage:
    return await controller.list_items(category_id, limit=limit, offset=offset)


@router.post(
    "/categories/{category_id}/budget-items",
    operation_id="addBudgetItem",
    status_code=status.HTTP_201_CREATED,
    responses={**NOT_FOUND, **IS_GROUP},
)
async def add_budget_item(
    category_id: str, req: BudgetItemCreate, user: CurrentUser
) -> BudgetItemRead:
    return await controller.add_item(category_id, req)


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
