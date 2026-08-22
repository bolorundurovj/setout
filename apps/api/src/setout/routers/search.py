from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from setout.controllers.search import SearchController
from setout.models.user import User
from setout.routers.auth import get_current_user
from setout.schemas.search import SearchResults

router = APIRouter(
    tags=["search"],
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"}},
)

CurrentUser = Annotated[User, Depends(get_current_user)]

controller = SearchController()


@router.get("/search", operation_id="search")
async def search(
    user: CurrentUser,
    q: Annotated[str, Query(max_length=120, description="What to look for")] = "",
    limit: Annotated[int, Query(ge=1, le=50, description="Rows per kind")] = 12,
) -> SearchResults:
    """Everything the record holds that matches, one group per kind."""
    return await controller.look(q, limit)
