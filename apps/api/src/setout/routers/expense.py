from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status

from setout.controllers.expense import ExpenseController
from setout.models.user import User
from setout.routers.auth import get_current_user
from setout.schemas.expense import (
    ExpenseCreate,
    ExpensePage,
    ExpenseRead,
    ExpenseUpdate,
    ProjectMonths,
    ProjectSpend,
)

router = APIRouter(
    tags=["expenses"],
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"}},
)

CurrentUser = Annotated[User, Depends(get_current_user)]

controller = ExpenseController()

NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "Not found"}
}


@router.get("/projects/{project_id}/expenses", operation_id="listExpenses", responses=NOT_FOUND)
async def list_expenses(
    project_id: str,
    user: CurrentUser,
    scope_id: Annotated[str | None, Query(description="Only this scope")] = None,
    agreement_id: Annotated[
        str | None, Query(description="Only payments on this agreement")
    ] = None,
    month: Annotated[
        str | None,
        Query(
            pattern=r"^\d{4}-(0[1-9]|1[0-2])$",
            description="Only this calendar month, as YYYY-MM",
        ),
    ] = None,
    unfiled_only: Annotated[bool, Query(description="Only spend with no scope")] = False,
    agreement_only: Annotated[
        bool, Query(description="Only payments filed against some agreement")
    ] = False,
    limit: Annotated[int, Query(ge=1, le=100, description="Rows per page")] = 20,
    offset: Annotated[int, Query(ge=0, description="Rows to skip")] = 0,
) -> ExpensePage:
    return await controller.list(
        project_id,
        scope_id=scope_id,
        agreement_id=agreement_id,
        month=month,
        unfiled_only=unfiled_only,
        agreement_only=agreement_only,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/projects/{project_id}/expenses",
    operation_id="addExpense",
    status_code=status.HTTP_201_CREATED,
    responses={
        **NOT_FOUND,
        status.HTTP_409_CONFLICT: {"description": "Scope holds no spend of its own"},
    },
)
async def add_expense(project_id: str, req: ExpenseCreate, user: CurrentUser) -> ExpenseRead:
    return await controller.create(project_id, req)


@router.get("/projects/{project_id}/spend", operation_id="getProjectSpend", responses=NOT_FOUND)
async def get_project_spend(project_id: str, user: CurrentUser) -> ProjectSpend:
    return await controller.spend(project_id)


@router.get("/projects/{project_id}/months", operation_id="getProjectMonths", responses=NOT_FOUND)
async def get_project_months(project_id: str, user: CurrentUser) -> ProjectMonths:
    return await controller.months(project_id)


@router.get("/expenses/{expense_id}", operation_id="getExpense", responses=NOT_FOUND)
async def get_expense(expense_id: str, user: CurrentUser) -> ExpenseRead:
    return await controller.get(expense_id)


@router.patch("/expenses/{expense_id}", operation_id="updateExpense", responses=NOT_FOUND)
async def update_expense(expense_id: str, req: ExpenseUpdate, user: CurrentUser) -> ExpenseRead:
    return await controller.update(expense_id, req)


@router.delete(
    "/expenses/{expense_id}",
    operation_id="deleteExpense",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND,
)
async def delete_expense(expense_id: str, user: CurrentUser) -> None:
    await controller.delete(expense_id)


@router.post("/expenses/{expense_id}/restore", operation_id="restoreExpense", responses=NOT_FOUND)
async def restore_expense(expense_id: str, user: CurrentUser) -> ExpenseRead:
    return await controller.restore(expense_id)
