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
Wanted = Annotated[
    str | None,
    Query(
        min_length=3,
        max_length=3,
        description="Which currency to read. Falls back to the account's, then the first in use",
    ),
]

controller = HomeController()


@router.get("/summary", operation_id="getHomeSummary")
async def get_summary(user: CurrentUser, currency: Wanted = None) -> HomeSummary:
    """The totals and what needs attention, for one currency."""
    return await controller.summary(currency, user.base_currency)


@router.get("/months", operation_id="getHomeMonths")
async def get_months(user: CurrentUser, currency: Wanted = None) -> HomeMonths:
    """Spend by calendar month, for one currency."""
    return await controller.months(currency, user.base_currency)


@router.get("/projects", operation_id="getHomeProjects")
async def get_projects(user: CurrentUser, currency: Wanted = None) -> HomeProjects:
    """Every open project kept in one currency, with how it stands."""
    return await controller.projects(currency, user.base_currency)


@router.get("/latest", operation_id="getHomeLatest")
async def get_latest(user: CurrentUser, currency: Wanted = None) -> HomeLatest:
    """The last few expenses recorded in one currency."""
    return await controller.latest(currency, user.base_currency)
