from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response

from setout.config import get_settings
from setout.controllers.export_sheet import ExportController
from setout.controllers.import_sheet import ImportController
from setout.models.user import User
from setout.routers.auth import get_current_user
from setout.schemas.import_sheet import Answers, ImportReport, ImportResult
from setout.services.sheets.workbook import SheetError
from setout.services.sheets.write import SAMPLES, XLSX_TYPE, filename_for, sample
from setout.utils.uploads import read_capped

router = APIRouter(
    tags=["import"],
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"}},
)

CurrentUser = Annotated[User, Depends(get_current_user)]

controller = ImportController()
exporter = ExportController()


REFUSALS: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "Not found"},
    status.HTTP_422_UNPROCESSABLE_CONTENT: {"description": "The file could not be read"},
}


@router.post("/import/preview", operation_id="previewImport", responses=REFUSALS)
async def preview_import(
    user: CurrentUser,
    file: Annotated[UploadFile, File(description="The .xlsx or .csv to read")],
    project_id: Annotated[str | None, Form(description="Leave out to start a project")] = None,
    name: Annotated[str, Form(description="Name for a new project")] = "",
    currency_code: Annotated[str, Form(description="Currency for a new project")] = "",
) -> ImportReport:
    """Say what the file holds and what would happen. Writes nothing."""
    try:
        return await controller.look(
            await read_capped(file, get_settings().max_import_bytes),
            file.filename or "",
            project_id=project_id or None,
            name=name,
            currency_code=currency_code,
        )
    except SheetError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc


@router.post(
    "/import",
    operation_id="runImport",
    status_code=status.HTTP_201_CREATED,
    responses=REFUSALS,
)
async def run_import(
    user: CurrentUser,
    file: Annotated[UploadFile, File(description="The .xlsx or .csv to read")],
    project_id: Annotated[str | None, Form()] = None,
    name: Annotated[str, Form()] = "",
    currency_code: Annotated[str, Form()] = "",
    create_missing_scopes: Annotated[bool, Form()] = True,
    skip_duplicates: Annotated[bool, Form()] = True,
    take_unpaid: Annotated[bool, Form()] = True,
    several_codes: Annotated[str, Form(pattern="^(first|unfiled)$")] = "first",
) -> ImportResult:
    try:
        return await controller.bring_in(
            await read_capped(file, get_settings().max_import_bytes),
            file.filename or "",
            project_id=project_id or None,
            name=name,
            currency_code=currency_code,
            answers=Answers(
                create_missing_scopes=create_missing_scopes,
                skip_duplicates=skip_duplicates,
                take_unpaid=take_unpaid,
                several_codes=several_codes,
            ),
        )
    except SheetError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc


@router.get(
    "/projects/{project_id}/export",
    operation_id="exportProject",
    responses={
        **REFUSALS,
        status.HTTP_200_OK: {
            "description": "The workbook",
            "content": {XLSX_TYPE: {"schema": {"type": "string", "format": "binary"}}},
        },
    },
    response_class=Response,
)
async def export_project(project_id: str, user: CurrentUser) -> Response:
    """The project as a workbook shaped like the one it came from."""
    name, data = await exporter.workbook(project_id)
    filename = filename_for(name, datetime.now(UTC))
    return Response(
        content=data,
        media_type=XLSX_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/import/sample",
    operation_id="importSample",
    responses={
        status.HTTP_200_OK: {
            "description": "A sheet to start from",
            "content": {XLSX_TYPE: {"schema": {"type": "string", "format": "binary"}}},
        }
    },
    response_class=Response,
)
async def import_sample(
    user: CurrentUser,
    kind: Annotated[
        str,
        Query(
            pattern="^(blank|example|budget-csv|spending-csv)$",
            description="An empty workbook, one with rows to copy, or either sheet as a CSV",
        ),
    ] = "blank",
) -> Response:
    """Something to fill in, for somebody with nothing to import yet."""
    filename, media_type = SAMPLES[kind]
    return Response(
        content=sample(kind),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
