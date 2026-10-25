from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, status
from fastapi.responses import Response

from setout.controllers.report import ReportController
from setout.models.user import User
from setout.routers.auth import get_current_user
from setout.services.sheets.write import filename_for

router = APIRouter(
    tags=["reports"],
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"}},
)

CurrentUser = Annotated[User, Depends(get_current_user)]

controller = ReportController()

RESPONSES: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "Not found"},
    status.HTTP_200_OK: {
        "description": "The project report",
        "content": {"application/pdf": {"schema": {"type": "string", "format": "binary"}}},
    },
}


@router.get(
    "/projects/{project_id}/report.pdf",
    operation_id="exportProjectReport",
    responses=RESPONSES,
    response_class=Response,
)
async def export_project_report(project_id: str, user: CurrentUser) -> Response:
    """Export a PDF report of the project's budget, expenses, agreements and deliveries."""
    name, data = await controller.pdf(project_id)
    filename = filename_for(name, datetime.now(UTC), part="report", extension="pdf")
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
