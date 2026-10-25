from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response

from setout.config import get_settings
from setout.controllers.export_sheet import CsvSheet, ExportController
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


IMPORT_ERRORS: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "Not found"},
    status.HTTP_422_UNPROCESSABLE_CONTENT: {"description": "The file could not be read"},
}


@router.post("/import/preview", operation_id="previewImport", responses=IMPORT_ERRORS)
async def preview_import(
    user: CurrentUser,
    file: Annotated[UploadFile, File(description="The .xlsx or .csv to read")],
    project_id: Annotated[str | None, Form(description="Omit to create a new project")] = None,
    name: Annotated[str, Form(description="Name for a new project")] = "",
    currency_code: Annotated[str, Form(description="Currency for a new project")] = "",
) -> ImportReport:
    """Preview what the file contains and what an import would change. Writes nothing."""
    try:
        return await controller.preview(
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
    responses=IMPORT_ERRORS,
)
async def run_import(
    user: CurrentUser,
    file: Annotated[UploadFile, File(description="The .xlsx or .csv to read")],
    project_id: Annotated[str | None, Form()] = None,
    name: Annotated[str, Form()] = "",
    currency_code: Annotated[str, Form()] = "",
    create_missing_categories: Annotated[bool, Form()] = True,
    skip_duplicates: Annotated[bool, Form()] = True,
    take_unpaid: Annotated[bool, Form()] = True,
    several_codes: Annotated[str, Form(pattern="^(first|uncategorised)$")] = "first",
) -> ImportResult:
    try:
        return await controller.run_import(
            await read_capped(file, get_settings().max_import_bytes),
            file.filename or "",
            project_id=project_id or None,
            name=name,
            currency_code=currency_code,
            answers=Answers(
                create_missing_categories=create_missing_categories,
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
        **IMPORT_ERRORS,
        status.HTTP_200_OK: {
            "description": "The workbook",
            "content": {XLSX_TYPE: {"schema": {"type": "string", "format": "binary"}}},
        },
    },
    response_class=Response,
)
async def export_project(project_id: str, user: CurrentUser) -> Response:
    """Export the project as a workbook in the import format."""
    name, data = await exporter.workbook(project_id)
    filename = filename_for(name, datetime.now(UTC))
    return Response(
        content=data,
        media_type=XLSX_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/projects/{project_id}/export.csv",
    operation_id="exportProjectCsv",
    responses={
        **IMPORT_ERRORS,
        status.HTTP_200_OK: {
            "description": "One sheet of the workbook as CSV",
            "content": {"text/csv": {"schema": {"type": "string", "format": "binary"}}},
        },
    },
    response_class=Response,
)
async def export_project_csv(
    project_id: str,
    user: CurrentUser,
    sheet: Annotated[CsvSheet, Query(description="The sheet to export")],
) -> Response:
    """Export the project's budget or expenses as CSV in the import format."""
    name, data = await exporter.csv(project_id, sheet)
    filename = filename_for(name, datetime.now(UTC), part=sheet, extension="csv")
    return Response(
        content=data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/import/sample",
    operation_id="importSample",
    responses={
        status.HTTP_200_OK: {
            "description": "The import template",
            "content": {XLSX_TYPE: {"schema": {"type": "string", "format": "binary"}}},
        }
    },
    response_class=Response,
)
async def download_import_template(
    user: CurrentUser,
    kind: Annotated[
        str,
        Query(
            pattern="^(blank|example|budget-csv|spending-csv)$",
            description="An empty workbook, a workbook with example rows, or either sheet as a CSV",
        ),
    ] = "blank",
) -> Response:
    """Download an import template."""
    filename, media_type = SAMPLES[kind]
    return Response(
        content=sample(kind),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
