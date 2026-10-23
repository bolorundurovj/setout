from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status

from setout.controllers.delivery import DeliveryController
from setout.models.user import User
from setout.routers.auth import get_current_user
from setout.schemas.delivery import (
    DeliveryCreate,
    DeliveryPage,
    DeliveryRead,
    DeliveryUpdate,
)

router = APIRouter(
    tags=["deliveries"],
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"}},
)

CurrentUser = Annotated[User, Depends(get_current_user)]

controller = DeliveryController()

NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "Not found"}
}


@router.get("/projects/{project_id}/deliveries", operation_id="listDeliveries", responses=NOT_FOUND)
async def list_deliveries(
    project_id: str,
    user: CurrentUser,
    vendor_id: Annotated[str | None, Query(description="Only this vendor")] = None,
    outstanding_only: Annotated[
        bool, Query(description="Only deliveries not yet received")
    ] = False,
    received_only: Annotated[bool, Query(description="Only received deliveries")] = False,
    include_archived: Annotated[bool, Query(description="Include archived deliveries")] = False,
    limit: Annotated[int, Query(ge=1, le=100, description="Rows per page")] = 20,
    offset: Annotated[int, Query(ge=0, description="Rows to skip")] = 0,
) -> DeliveryPage:
    return await controller.list(
        project_id,
        vendor_id=vendor_id,
        outstanding_only=outstanding_only,
        received_only=received_only,
        include_archived=include_archived,
        limit=limit,
        offset=offset,
    )


@router.get("/deliveries", operation_id="listAllDeliveries")
async def list_all_deliveries(
    user: CurrentUser,
    vendor_id: Annotated[str | None, Query(description="Only this vendor")] = None,
    outstanding_only: Annotated[
        bool, Query(description="Only deliveries not yet received")
    ] = False,
    received_only: Annotated[bool, Query(description="Only received deliveries")] = False,
    include_archived: Annotated[bool, Query(description="Include archived deliveries")] = False,
    limit: Annotated[int, Query(ge=1, le=100, description="Rows per page")] = 20,
    offset: Annotated[int, Query(ge=0, description="Rows to skip")] = 0,
) -> DeliveryPage:
    return await controller.list(
        None,
        vendor_id=vendor_id,
        outstanding_only=outstanding_only,
        received_only=received_only,
        include_archived=include_archived,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/projects/{project_id}/deliveries",
    operation_id="createDelivery",
    status_code=status.HTTP_201_CREATED,
    responses={
        **NOT_FOUND,
        status.HTTP_409_CONFLICT: {"description": "That expense already has a delivery"},
    },
)
async def create_delivery(project_id: str, req: DeliveryCreate, user: CurrentUser) -> DeliveryRead:
    return await controller.create(project_id, req)


@router.get("/deliveries/{delivery_id}", operation_id="getDelivery", responses=NOT_FOUND)
async def get_delivery(delivery_id: str, user: CurrentUser) -> DeliveryRead:
    return await controller.get(delivery_id)


@router.patch("/deliveries/{delivery_id}", operation_id="updateDelivery", responses=NOT_FOUND)
async def update_delivery(delivery_id: str, req: DeliveryUpdate, user: CurrentUser) -> DeliveryRead:
    return await controller.update(delivery_id, req)


@router.post(
    "/deliveries/{delivery_id}/received", operation_id="receiveDelivery", responses=NOT_FOUND
)
async def receive_delivery(delivery_id: str, user: CurrentUser) -> DeliveryRead:
    return await controller.mark_received(delivery_id)


@router.delete(
    "/deliveries/{delivery_id}/received", operation_id="unreceiveDelivery", responses=NOT_FOUND
)
async def unreceive_delivery(delivery_id: str, user: CurrentUser) -> DeliveryRead:
    return await controller.mark_not_received(delivery_id)


@router.post(
    "/deliveries/{delivery_id}/archive",
    operation_id="archiveDelivery",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND,
)
async def archive_delivery(delivery_id: str, user: CurrentUser) -> None:
    await controller.archive(delivery_id)


@router.post(
    "/deliveries/{delivery_id}/restore", operation_id="restoreDelivery", responses=NOT_FOUND
)
async def restore_delivery(delivery_id: str, user: CurrentUser) -> DeliveryRead:
    return await controller.restore(delivery_id)


@router.delete(
    "/deliveries/{delivery_id}",
    operation_id="deleteDelivery",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        **NOT_FOUND,
        status.HTTP_400_BAD_REQUEST: {
            "description": "Only archived deliveries can be deleted permanently"
        },
    },
)
async def delete_delivery(delivery_id: str, user: CurrentUser) -> None:
    await controller.delete(delivery_id)
