from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status

from setout.controllers.item import ItemController
from setout.models.user import User
from setout.routers.auth import get_current_user
from setout.schemas.item import (
    ItemCreate,
    ItemLastPriceResponse,
    ItemPage,
    ItemPrices,
    ItemRead,
    ItemUpdate,
)

router = APIRouter(
    tags=["items"],
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"}},
)

CurrentUser = Annotated[User, Depends(get_current_user)]

controller = ItemController()

NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "Not found"}
}
DUPLICATE: dict[int | str, dict[str, Any]] = {
    status.HTTP_409_CONFLICT: {"description": "That name is already taken"}
}


@router.get("/items", operation_id="listItems")
async def list_items(
    user: CurrentUser,
    search: Annotated[str | None, Query(description="Match part of the name")] = None,
    limit: Annotated[int, Query(ge=1, le=100, description="Rows per page")] = 20,
    offset: Annotated[int, Query(ge=0, description="Rows to skip")] = 0,
) -> ItemPage:
    return await controller.list_items(search=search, limit=limit, offset=offset)


@router.post(
    "/items",
    operation_id="createItem",
    status_code=status.HTTP_201_CREATED,
    responses=DUPLICATE,
)
async def create_item(req: ItemCreate, user: CurrentUser) -> ItemRead:
    return await controller.create(req)


@router.get("/items/{item_id}", operation_id="getItem", responses=NOT_FOUND)
async def get_item(item_id: str, user: CurrentUser) -> ItemRead:
    return await controller.get(item_id)


@router.patch(
    "/items/{item_id}",
    operation_id="updateItem",
    responses={**NOT_FOUND, **DUPLICATE},
)
async def update_item(item_id: str, req: ItemUpdate, user: CurrentUser) -> ItemRead:
    return await controller.update(item_id, req)


@router.delete(
    "/items/{item_id}",
    operation_id="deleteItem",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND,
)
async def delete_item(item_id: str, user: CurrentUser) -> None:
    await controller.delete(item_id)


@router.post("/items/{item_id}/restore", operation_id="restoreItem", responses=NOT_FOUND)
async def restore_item(item_id: str, user: CurrentUser) -> ItemRead:
    return await controller.restore(item_id)


@router.get("/items/{item_id}/prices", operation_id="getItemPrices", responses=NOT_FOUND)
async def get_item_prices(item_id: str, user: CurrentUser) -> ItemPrices:
    return await controller.prices(item_id)


@router.get(
    "/projects/{project_id}/items/{item_id}/last-price",
    operation_id="getItemLastPrice",
    responses=NOT_FOUND,
)
async def get_item_last_price(
    project_id: str, item_id: str, user: CurrentUser
) -> ItemLastPriceResponse:
    return await controller.last_price(item_id, project_id)
