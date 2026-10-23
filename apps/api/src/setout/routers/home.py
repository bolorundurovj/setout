from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from setout.controllers.home import HomeController
from setout.models.user import User
from setout.routers.auth import get_current_user
from setout.schemas.home import HomeLatest, HomeMonths, HomeProjects, HomeSummary

router = APIRouter(
    prefix="/home",
    tags=["home"],
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"}},
)

CurrentUser = Annotated[User, Depends(get_current_user)]
CurrencyQuery = Annotated[
    str | None,
    Query(
        min_length=3,
        max_length=3,
        description="Currency to report. Defaults to the base currency, then the first in use",
    ),
]

controller = HomeController()


@router.get("/summary", operation_id="getHomeSummary")
async def get_summary(user: CurrentUser, currency: CurrencyQuery = None) -> HomeSummary:
    """Totals and alerts for one currency."""
    return await controller.summary(currency, user.base_currency)


@router.get("/months", operation_id="getHomeMonths")
async def get_months(user: CurrentUser, currency: CurrencyQuery = None) -> HomeMonths:
    """Expenses by calendar month, for one currency."""
    return await controller.months(currency, user.base_currency)


@router.get("/projects", operation_id="getHomeProjects")
async def get_projects(user: CurrentUser, currency: CurrencyQuery = None) -> HomeProjects:
    """Projects that are not archived, in one currency, with budgeted and spent amounts."""
    return await controller.projects(currency, user.base_currency)


@router.get("/latest", operation_id="getHomeLatest")
async def get_latest(user: CurrentUser, currency: CurrencyQuery = None) -> HomeLatest:
    """The most recent expenses in one currency."""
    return await controller.latest(currency, user.base_currency)
