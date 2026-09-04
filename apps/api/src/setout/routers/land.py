from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from fastapi.responses import RedirectResponse, Response

from setout.config import get_settings
from setout.controllers.land import LandController
from setout.controllers.land_document import LandDocumentController
from setout.controllers.land_valuation import LandValuationController
from setout.models.land_document import LandDocumentKind
from setout.models.user import User
from setout.routers.auth import get_current_user
from setout.schemas.land import LandCreate, LandPage, LandRead, LandUpdate
from setout.schemas.land_document import (
    LandDocumentPage,
    LandDocumentRead,
    LandDocumentUpdate,
)
from setout.schemas.land_valuation import (
    LandValuationCreate,
    LandValuationPage,
    LandValuationRead,
    LandValuationUpdate,
)
from setout.services.storage import Storage, get_storage
from setout.utils.uploads import read_capped

router = APIRouter(
    tags=["lands"],
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"}},
)

CurrentUser = Annotated[User, Depends(get_current_user)]
Store = Annotated[Storage, Depends(get_storage)]

controller = LandController()
documents = LandDocumentController()
valuations = LandValuationController()

NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "Not found"}
}
DUPLICATE: dict[int | str, dict[str, Any]] = {
    status.HTTP_409_CONFLICT: {"description": "That name is already taken"}
}


@router.get("/lands", operation_id="listLands")
async def list_lands(
    user: CurrentUser,
    search: Annotated[str | None, Query(description="Match part of the name")] = None,
    include_archived: Annotated[bool, Query(description="Include archived land")] = False,
    limit: Annotated[int, Query(ge=1, le=100, description="Rows per page")] = 20,
    offset: Annotated[int, Query(ge=0, description="Rows to skip")] = 0,
) -> LandPage:
    return await controller.list_lands(
        search=search, include_archived=include_archived, limit=limit, offset=offset
    )


@router.post(
    "/lands",
    operation_id="createLand",
    status_code=status.HTTP_201_CREATED,
    responses=DUPLICATE,
)
async def create_land(req: LandCreate, user: CurrentUser) -> LandRead:
    return await controller.create(req)


@router.get("/lands/{land_id}", operation_id="getLand", responses=NOT_FOUND)
async def get_land(land_id: str, user: CurrentUser) -> LandRead:
    return await controller.get(land_id)


@router.patch(
    "/lands/{land_id}",
    operation_id="updateLand",
    responses={**NOT_FOUND, **DUPLICATE},
)
async def update_land(land_id: str, req: LandUpdate, user: CurrentUser) -> LandRead:
    return await controller.update(land_id, req)


@router.delete(
    "/lands/{land_id}",
    operation_id="deleteLand",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND,
)
async def delete_land(land_id: str, user: CurrentUser) -> None:
    await controller.delete(land_id)


@router.post("/lands/{land_id}/restore", operation_id="restoreLand", responses=NOT_FOUND)
async def restore_land(land_id: str, user: CurrentUser) -> LandRead:
    return await controller.restore(land_id)


@router.get("/lands/{land_id}/documents", operation_id="listLandDocuments", responses=NOT_FOUND)
async def list_land_documents(
    land_id: str,
    user: CurrentUser,
    include_deleted: Annotated[bool, Query(description="Include removed files")] = False,
    limit: Annotated[int, Query(ge=1, le=100, description="Rows per page")] = 20,
    offset: Annotated[int, Query(ge=0, description="Rows to skip")] = 0,
) -> LandDocumentPage:
    return await documents.list(
        land_id, limit=limit, offset=offset, include_deleted=include_deleted
    )


@router.post(
    "/lands/{land_id}/documents",
    operation_id="addLandDocument",
    status_code=status.HTTP_201_CREATED,
    responses={
        **NOT_FOUND,
        status.HTTP_413_CONTENT_TOO_LARGE: {"description": "File too large"},
        status.HTTP_415_UNSUPPORTED_MEDIA_TYPE: {"description": "Not a photograph or a PDF"},
    },
)
async def add_land_document(
    land_id: str,
    user: CurrentUser,
    storage: Store,
    file: Annotated[UploadFile, File(description="The scan or PDF")],
    kind: Annotated[LandDocumentKind, Form(description="What the paper is")] = (
        LandDocumentKind.OTHER
    ),
    note: Annotated[
        str | None,
        Form(max_length=255, description="What it actually is, when the kind will not say"),
    ] = None,
) -> LandDocumentRead:
    return await documents.create(
        land_id,
        kind=kind,
        note=note,
        filename=file.filename or "",
        content_type=file.content_type or "",
        data=await read_capped(file, get_settings().max_attachment_bytes),
        storage=storage,
    )


@router.get("/land-documents/{document_id}", operation_id="getLandDocument", responses=NOT_FOUND)
async def get_land_document(document_id: str, user: CurrentUser) -> LandDocumentRead:
    return await documents.get(document_id)


@router.patch(
    "/land-documents/{document_id}", operation_id="updateLandDocument", responses=NOT_FOUND
)
async def update_land_document(
    document_id: str, req: LandDocumentUpdate, user: CurrentUser
) -> LandDocumentRead:
    """Correct what a paper is called, or say what an Other one actually is."""
    return await documents.update(document_id, req)


@router.get(
    "/land-documents/{document_id}/file",
    operation_id="downloadLandDocument",
    responses={
        **NOT_FOUND,
        status.HTTP_200_OK: {
            "description": "The file itself",
            "content": {
                "application/octet-stream": {"schema": {"type": "string", "format": "binary"}}
            },
        },
    },
    response_class=Response,
)
async def download_land_document(document_id: str, user: CurrentUser, storage: Store) -> Response:
    """The file. Where the store can hand out a link of its own, this redirects
    to it and the bytes never pass through Setout."""
    link = await documents.link(document_id, storage)
    if link is not None:
        return RedirectResponse(link, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    found = await documents.read_file(document_id, storage)
    return Response(
        content=found.data,
        media_type=found.content_type,
        headers={"Content-Disposition": f'inline; filename="{found.filename}"'},
    )


@router.delete(
    "/land-documents/{document_id}",
    operation_id="deleteLandDocument",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND,
)
async def delete_land_document(document_id: str, user: CurrentUser) -> None:
    await documents.delete(document_id)


@router.post(
    "/land-documents/{document_id}/restore",
    operation_id="restoreLandDocument",
    responses=NOT_FOUND,
)
async def restore_land_document(document_id: str, user: CurrentUser) -> LandDocumentRead:
    return await documents.restore(document_id)


@router.get("/lands/{land_id}/valuations", operation_id="listLandValuations", responses=NOT_FOUND)
async def list_land_valuations(
    land_id: str,
    user: CurrentUser,
    include_deleted: Annotated[bool, Query(description="Include removed entries")] = False,
    limit: Annotated[int, Query(ge=1, le=100, description="Rows per page")] = 20,
    offset: Annotated[int, Query(ge=0, description="Rows to skip")] = 0,
) -> LandValuationPage:
    """What the plot has been worth, newest first."""
    return await valuations.list(
        land_id, limit=limit, offset=offset, include_deleted=include_deleted
    )


@router.post(
    "/lands/{land_id}/valuations",
    operation_id="addLandValuation",
    status_code=status.HTTP_201_CREATED,
    responses={
        **NOT_FOUND,
        status.HTTP_409_CONFLICT: {"description": "It already records what it was bought for"},
    },
)
async def add_land_valuation(
    land_id: str, req: LandValuationCreate, user: CurrentUser
) -> LandValuationRead:
    """The first entry fixes the currency every later one has to use."""
    return await valuations.create(land_id, req)


@router.patch(
    "/land-valuations/{valuation_id}",
    operation_id="updateLandValuation",
    responses={
        **NOT_FOUND,
        status.HTTP_409_CONFLICT: {"description": "It already records what it was bought for"},
    },
)
async def update_land_valuation(
    valuation_id: str, req: LandValuationUpdate, user: CurrentUser
) -> LandValuationRead:
    return await valuations.update(valuation_id, req)


@router.delete(
    "/land-valuations/{valuation_id}",
    operation_id="deleteLandValuation",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND,
)
async def delete_land_valuation(valuation_id: str, user: CurrentUser) -> None:
    await valuations.delete(valuation_id)


@router.post(
    "/land-valuations/{valuation_id}/restore",
    operation_id="restoreLandValuation",
    responses=NOT_FOUND,
)
async def restore_land_valuation(valuation_id: str, user: CurrentUser) -> LandValuationRead:
    return await valuations.restore(valuation_id)
