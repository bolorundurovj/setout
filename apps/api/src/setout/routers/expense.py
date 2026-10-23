from __future__ import annotations

from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status

from setout.controllers.expense import ExpenseController
from setout.models.user import User
from setout.routers.auth import get_current_user
from setout.schemas.expense import (
    BulkCategoriseExpenses,
    BulkCategoriseResult,
    CategorySuggestion,
    ExpenseCreate,
    ExpensePage,
    ExpenseRead,
    ExpenseSort,
    ExpenseUpdate,
    ProjectExpenseSummary,
    ProjectMonths,
)
from setout.services.storage import Storage, get_storage

router = APIRouter(
    tags=["expenses"],
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"}},
)

CurrentUser = Annotated[User, Depends(get_current_user)]
Store = Annotated[Storage, Depends(get_storage)]

controller = ExpenseController()

NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "Not found"}
}


@router.get("/projects/{project_id}/expenses", operation_id="listExpenses", responses=NOT_FOUND)
async def list_expenses(
    project_id: str,
    user: CurrentUser,
    category_id: Annotated[str | None, Query(description="Only this category")] = None,
    agreement_id: Annotated[
        str | None, Query(description="Only expenses against this agreement")
    ] = None,
    month: Annotated[
        str | None,
        Query(
            pattern=r"^\d{4}-(0[1-9]|1[0-2])$",
            description="Only this calendar month, as YYYY-MM",
        ),
    ] = None,
    search: Annotated[
        str | None, Query(description="Match part of the description or the notes")
    ] = None,
    vendor_id: Annotated[str | None, Query(description="Only this vendor")] = None,
    paid_by_id: Annotated[
        str | None, Query(description="Only expenses paid by this person")
    ] = None,
    item_id: Annotated[str | None, Query(description="Only this item")] = None,
    spent_from: Annotated[date | None, Query(description="Spent on this day or after")] = None,
    spent_to: Annotated[date | None, Query(description="Spent on this day or before")] = None,
    sort: Annotated[ExpenseSort, Query(description="Sort order")] = (ExpenseSort.RECENT),
    uncategorised_only: Annotated[
        bool, Query(description="Only expenses with no category")
    ] = False,
    agreement_only: Annotated[
        bool, Query(description="Only expenses linked to an agreement")
    ] = False,
    include_archived: Annotated[bool, Query(description="Include archived expenses")] = False,
    limit: Annotated[int, Query(ge=1, le=100, description="Rows per page")] = 20,
    offset: Annotated[int, Query(ge=0, description="Rows to skip")] = 0,
) -> ExpensePage:
    return await controller.list(
        project_id,
        category_id=category_id,
        agreement_id=agreement_id,
        month=month,
        search=search,
        vendor_id=vendor_id,
        paid_by_id=paid_by_id,
        item_id=item_id,
        spent_from=spent_from,
        spent_to=spent_to,
        sort=sort,
        uncategorised_only=uncategorised_only,
        agreement_only=agreement_only,
        include_archived=include_archived,
        limit=limit,
        offset=offset,
    )


@router.patch(
    "/projects/{project_id}/expenses",
    operation_id="categoriseExpenses",
    responses={
        **NOT_FOUND,
        status.HTTP_409_CONFLICT: {
            "description": "A category with subcategories has no expenses of its own"
        },
    },
)
async def categorise_expenses(
    project_id: str, req: BulkCategoriseExpenses, user: CurrentUser
) -> BulkCategoriseResult:
    return await controller.bulk_categorise(project_id, req)


@router.post(
    "/projects/{project_id}/expenses",
    operation_id="createExpense",
    status_code=status.HTTP_201_CREATED,
    responses={
        **NOT_FOUND,
        status.HTTP_409_CONFLICT: {
            "description": "A category with subcategories has no expenses of its own"
        },
    },
)
async def create_expense(project_id: str, req: ExpenseCreate, user: CurrentUser) -> ExpenseRead:
    return await controller.create(project_id, req)


@router.get(
    "/projects/{project_id}/suggest-category",
    operation_id="suggestCategory",
    responses=NOT_FOUND,
)
async def suggest_category(
    project_id: str,
    user: CurrentUser,
    item_id: Annotated[str | None, Query(description="The item purchased")] = None,
    vendor_id: Annotated[str | None, Query(description="The vendor")] = None,
) -> CategorySuggestion:
    return await controller.suggest_category(project_id, item_id, vendor_id)


@router.get(
    "/projects/{project_id}/expense-summary",
    operation_id="getProjectExpenseSummary",
    responses=NOT_FOUND,
)
async def get_project_expense_summary(project_id: str, user: CurrentUser) -> ProjectExpenseSummary:
    return await controller.expense_summary(project_id)


@router.get("/projects/{project_id}/months", operation_id="getProjectMonths", responses=NOT_FOUND)
async def get_project_months(project_id: str, user: CurrentUser) -> ProjectMonths:
    return await controller.months(project_id)


@router.get("/expenses/{expense_id}", operation_id="getExpense", responses=NOT_FOUND)
async def get_expense(expense_id: str, user: CurrentUser) -> ExpenseRead:
    return await controller.get(expense_id)


@router.patch("/expenses/{expense_id}", operation_id="updateExpense", responses=NOT_FOUND)
async def update_expense(expense_id: str, req: ExpenseUpdate, user: CurrentUser) -> ExpenseRead:
    return await controller.update(expense_id, req)


@router.post(
    "/expenses/{expense_id}/archive",
    operation_id="archiveExpense",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND,
)
async def archive_expense(expense_id: str, user: CurrentUser) -> None:
    await controller.archive(expense_id)


@router.post("/expenses/{expense_id}/restore", operation_id="restoreExpense", responses=NOT_FOUND)
async def restore_expense(expense_id: str, user: CurrentUser) -> ExpenseRead:
    return await controller.restore(expense_id)
