from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status

from setout.controllers.agreement import AgreementController
from setout.models.user import User
from setout.routers.auth import get_current_user
from setout.schemas.agreement import (
    AdvanceCreate,
    AdvancePage,
    AdvanceRead,
    AdvanceUpdate,
    AgreementCreate,
    AgreementPage,
    AgreementRead,
    AgreementUpdate,
    PersonBalance,
)

router = APIRouter(
    tags=["agreements"],
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"}},
)

CurrentUser = Annotated[User, Depends(get_current_user)]

controller = AgreementController()

NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "Not found"}
}


@router.get("/projects/{project_id}/agreements", operation_id="listAgreements", responses=NOT_FOUND)
async def list_agreements(
    project_id: str,
    user: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=100, description="Rows per page")] = 20,
    offset: Annotated[int, Query(ge=0, description="Rows to skip")] = 0,
) -> AgreementPage:
    return await controller.list_agreements(project_id, limit=limit, offset=offset)


@router.post(
    "/projects/{project_id}/agreements",
    operation_id="addAgreement",
    status_code=status.HTTP_201_CREATED,
    responses=NOT_FOUND,
)
async def add_agreement(project_id: str, req: AgreementCreate, user: CurrentUser) -> AgreementRead:
    return await controller.create(project_id, req)


@router.get("/agreements/{agreement_id}", operation_id="getAgreement", responses=NOT_FOUND)
async def get_agreement(agreement_id: str, user: CurrentUser) -> AgreementRead:
    return await controller.get(agreement_id)


@router.patch("/agreements/{agreement_id}", operation_id="updateAgreement", responses=NOT_FOUND)
async def update_agreement(
    agreement_id: str, req: AgreementUpdate, user: CurrentUser
) -> AgreementRead:
    return await controller.update(agreement_id, req)


@router.delete(
    "/agreements/{agreement_id}",
    operation_id="deleteAgreement",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND,
)
async def delete_agreement(agreement_id: str, user: CurrentUser) -> None:
    await controller.delete(agreement_id)


@router.get("/projects/{project_id}/advances", operation_id="listAdvances", responses=NOT_FOUND)
async def list_advances(
    project_id: str,
    user: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=100, description="Rows per page")] = 20,
    offset: Annotated[int, Query(ge=0, description="Rows to skip")] = 0,
) -> AdvancePage:
    return await controller.list_advances(project_id, limit=limit, offset=offset)


@router.post(
    "/projects/{project_id}/advances",
    operation_id="addAdvance",
    status_code=status.HTTP_201_CREATED,
    responses=NOT_FOUND,
)
async def add_advance(project_id: str, req: AdvanceCreate, user: CurrentUser) -> AdvanceRead:
    return await controller.add_advance(project_id, req)


@router.patch("/advances/{advance_id}", operation_id="updateAdvance", responses=NOT_FOUND)
async def update_advance(advance_id: str, req: AdvanceUpdate, user: CurrentUser) -> AdvanceRead:
    return await controller.update_advance(advance_id, req)


@router.delete(
    "/advances/{advance_id}",
    operation_id="deleteAdvance",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND,
)
async def delete_advance(advance_id: str, user: CurrentUser) -> None:
    await controller.delete_advance(advance_id)


@router.get("/projects/{project_id}/balances", operation_id="listBalances", responses=NOT_FOUND)
async def list_balances(project_id: str, user: CurrentUser) -> list[PersonBalance]:
    return await controller.balances(project_id)
