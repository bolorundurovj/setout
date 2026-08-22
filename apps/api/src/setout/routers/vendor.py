from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status

from setout.controllers.vendor import VendorController
from setout.models.user import User
from setout.routers.auth import get_current_user
from setout.schemas.vendor import (
    VendorAgreements,
    VendorCreate,
    VendorPage,
    VendorRead,
    VendorSpend,
    VendorUpdate,
)

router = APIRouter(
    tags=["vendors"],
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"}},
)

CurrentUser = Annotated[User, Depends(get_current_user)]

controller = VendorController()

NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "Not found"}
}
DUPLICATE: dict[int | str, dict[str, Any]] = {
    status.HTTP_409_CONFLICT: {"description": "That name is already taken"}
}


@router.get("/vendors", operation_id="listVendors")
async def list_vendors(
    user: CurrentUser,
    search: Annotated[str | None, Query(description="Match part of the name")] = None,
    include_archived: Annotated[bool, Query(description="Include archived vendors")] = False,
    limit: Annotated[int, Query(ge=1, le=100, description="Rows per page")] = 20,
    offset: Annotated[int, Query(ge=0, description="Rows to skip")] = 0,
) -> VendorPage:
    return await controller.list_vendors(
        search=search, include_archived=include_archived, limit=limit, offset=offset
    )


@router.post(
    "/vendors",
    operation_id="createVendor",
    status_code=status.HTTP_201_CREATED,
    responses=DUPLICATE,
)
async def create_vendor(req: VendorCreate, user: CurrentUser) -> VendorRead:
    return await controller.create(req)


@router.get("/vendors/{vendor_id}", operation_id="getVendor", responses=NOT_FOUND)
async def get_vendor(vendor_id: str, user: CurrentUser) -> VendorRead:
    return await controller.get(vendor_id)


@router.patch(
    "/vendors/{vendor_id}",
    operation_id="updateVendor",
    responses={**NOT_FOUND, **DUPLICATE},
)
async def update_vendor(vendor_id: str, req: VendorUpdate, user: CurrentUser) -> VendorRead:
    return await controller.update(vendor_id, req)


@router.delete(
    "/vendors/{vendor_id}",
    operation_id="deleteVendor",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND,
)
async def delete_vendor(vendor_id: str, user: CurrentUser) -> None:
    await controller.delete(vendor_id)


@router.post("/vendors/{vendor_id}/restore", operation_id="restoreVendor", responses=NOT_FOUND)
async def restore_vendor(vendor_id: str, user: CurrentUser) -> VendorRead:
    return await controller.restore(vendor_id)


@router.get("/vendors/{vendor_id}/spend", operation_id="getVendorSpend", responses=NOT_FOUND)
async def get_vendor_spend(vendor_id: str, user: CurrentUser) -> VendorSpend:
    return await controller.spend(vendor_id)


@router.get(
    "/vendors/{vendor_id}/agreements", operation_id="getVendorAgreements", responses=NOT_FOUND
)
async def get_vendor_agreements(vendor_id: str, user: CurrentUser) -> VendorAgreements:
    return await controller.agreements(vendor_id)
