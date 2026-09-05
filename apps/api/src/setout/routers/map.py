from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from setout.controllers.map import MapController
from setout.models.user import User
from setout.routers.auth import get_current_user
from setout.schemas.map import MapSettings

router = APIRouter(
    tags=["map"],
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"}},
)

CurrentUser = Annotated[User, Depends(get_current_user)]

controller = MapController()


@router.get("/map", operation_id="getMapSettings")
async def get_map_settings(user: CurrentUser) -> MapSettings:
    """Where the map gets its tiles. Set SETOUT_MAP_TILE_URL to use your own."""
    return controller.settings()
