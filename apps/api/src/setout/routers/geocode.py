from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from setout.controllers.geocode import GeocodeController
from setout.models.user import User
from setout.routers.auth import get_current_user
from setout.schemas.geocode import GeocodedPlace

router = APIRouter(
    tags=["geocode"],
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"}},
)

CurrentUser = Annotated[User, Depends(get_current_user)]

controller = GeocodeController()


@router.get("/geocode", operation_id="reverseGeocode")
async def reverse_geocode(
    user: CurrentUser,
    latitude: Annotated[float, Query(ge=-90, le=90)],
    longitude: Annotated[float, Query(ge=-180, le=180)],
) -> GeocodedPlace | None:
    """What the map calls this spot, or nothing when the geocoder is off or out of reach."""
    return await controller.at(latitude, longitude)
