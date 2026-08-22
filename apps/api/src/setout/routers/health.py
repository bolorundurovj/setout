from __future__ import annotations

from fastapi import APIRouter

from setout import __version__
from setout.db import db_status
from setout.schemas.health import Health

router = APIRouter(tags=["health"])


@router.get("/healthz", response_model=Health, operation_id="getHealth")
async def get_health() -> Health:
    database = await db_status()
    status = "ok" if database == "ok" else "degraded"
    return Health(status=status, version=__version__, database=database)
