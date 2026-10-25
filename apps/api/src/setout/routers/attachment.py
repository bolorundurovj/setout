from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from fastapi.responses import RedirectResponse, Response

from setout.config import get_settings
from setout.controllers.attachment import AttachedTo, AttachmentController
from setout.models.user import User
from setout.routers.auth import get_current_user
from setout.schemas.attachment import AttachmentPage, AttachmentRead
from setout.services.storage import Storage, get_storage
from setout.utils.uploads import read_capped

router = APIRouter(
    tags=["attachments"],
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"}},
)

CurrentUser = Annotated[User, Depends(get_current_user)]
Store = Annotated[Storage, Depends(get_storage)]

controller = AttachmentController()

NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "Not found"}
}


IncludeArchived = Annotated[bool, Query(description="Include archived attachments")]
Limit = Annotated[int, Query(ge=1, le=100, description="Rows per page")]
Offset = Annotated[int, Query(ge=0, description="Rows to skip")]
Upload = Annotated[UploadFile, File(description="An image or a PDF")]

CREATED: dict[int | str, dict[str, Any]] = {
    **NOT_FOUND,
    status.HTTP_413_CONTENT_TOO_LARGE: {"description": "File too large"},
    status.HTTP_415_UNSUPPORTED_MEDIA_TYPE: {"description": "Not an image or a PDF"},
}


async def _create(
    project_id: str, attached_to: AttachedTo, parent_id: str, file: UploadFile, storage: Storage
) -> AttachmentRead:
    return await controller.create(
        project_id,
        attached_to,
        parent_id,
        filename=file.filename or "",
        content_type=file.content_type or "",
        data=await read_capped(file, get_settings().max_attachment_bytes),
        storage=storage,
    )


@router.get(
    "/projects/{project_id}/attachments",
    operation_id="listProjectAttachments",
    responses=NOT_FOUND,
)
async def list_project_attachments(
    project_id: str,
    user: CurrentUser,
    include_archived: IncludeArchived = False,
    limit: Limit = 20,
    offset: Offset = 0,
) -> AttachmentPage:
    return await controller.list(
        AttachedTo.PROJECT,
        project_id,
        limit=limit,
        offset=offset,
        include_archived=include_archived,
    )


@router.post(
    "/projects/{project_id}/attachments",
    operation_id="createProjectAttachment",
    status_code=status.HTTP_201_CREATED,
    responses=CREATED,
)
async def create_project_attachment(
    project_id: str, user: CurrentUser, storage: Store, file: Upload
) -> AttachmentRead:
    return await _create(project_id, AttachedTo.PROJECT, project_id, file, storage)


@router.get(
    "/expenses/{expense_id}/attachments", operation_id="listAttachments", responses=NOT_FOUND
)
async def list_attachments(
    expense_id: str,
    user: CurrentUser,
    include_archived: IncludeArchived = False,
    limit: Limit = 20,
    offset: Offset = 0,
) -> AttachmentPage:
    return await controller.list(
        AttachedTo.EXPENSE,
        expense_id,
        limit=limit,
        offset=offset,
        include_archived=include_archived,
    )


@router.post(
    "/projects/{project_id}/expenses/{expense_id}/attachments",
    operation_id="createAttachment",
    status_code=status.HTTP_201_CREATED,
    responses=CREATED,
)
async def create_attachment(
    project_id: str, expense_id: str, user: CurrentUser, storage: Store, file: Upload
) -> AttachmentRead:
    return await _create(project_id, AttachedTo.EXPENSE, expense_id, file, storage)


@router.get(
    "/agreements/{agreement_id}/attachments",
    operation_id="listAgreementAttachments",
    responses=NOT_FOUND,
)
async def list_agreement_attachments(
    agreement_id: str,
    user: CurrentUser,
    include_archived: IncludeArchived = False,
    limit: Limit = 20,
    offset: Offset = 0,
) -> AttachmentPage:
    return await controller.list(
        AttachedTo.AGREEMENT,
        agreement_id,
        limit=limit,
        offset=offset,
        include_archived=include_archived,
    )


@router.post(
    "/projects/{project_id}/agreements/{agreement_id}/attachments",
    operation_id="createAgreementAttachment",
    status_code=status.HTTP_201_CREATED,
    responses=CREATED,
)
async def create_agreement_attachment(
    project_id: str, agreement_id: str, user: CurrentUser, storage: Store, file: Upload
) -> AttachmentRead:
    return await _create(project_id, AttachedTo.AGREEMENT, agreement_id, file, storage)


@router.get(
    "/deliveries/{delivery_id}/attachments",
    operation_id="listDeliveryAttachments",
    responses=NOT_FOUND,
)
async def list_delivery_attachments(
    delivery_id: str,
    user: CurrentUser,
    include_archived: IncludeArchived = False,
    limit: Limit = 20,
    offset: Offset = 0,
) -> AttachmentPage:
    return await controller.list(
        AttachedTo.DELIVERY,
        delivery_id,
        limit=limit,
        offset=offset,
        include_archived=include_archived,
    )


@router.post(
    "/projects/{project_id}/deliveries/{delivery_id}/attachments",
    operation_id="createDeliveryAttachment",
    status_code=status.HTTP_201_CREATED,
    responses=CREATED,
)
async def create_delivery_attachment(
    project_id: str, delivery_id: str, user: CurrentUser, storage: Store, file: Upload
) -> AttachmentRead:
    return await _create(project_id, AttachedTo.DELIVERY, delivery_id, file, storage)


@router.get("/attachments/{attachment_id}", operation_id="getAttachment", responses=NOT_FOUND)
async def get_attachment(attachment_id: str, user: CurrentUser) -> AttachmentRead:
    return await controller.get(attachment_id)


@router.get(
    "/attachments/{attachment_id}/file",
    operation_id="downloadAttachment",
    responses={
        **NOT_FOUND,
        status.HTTP_200_OK: {
            "description": "The file contents",
            "content": {
                "application/octet-stream": {"schema": {"type": "string", "format": "binary"}}
            },
        },
    },
    response_class=Response,
)
async def download_attachment(attachment_id: str, user: CurrentUser, storage: Store) -> Response:
    """Serve the file inline, for the browser to display. Redirects to the storage URL when the
    store provides one.
    """
    link = await controller.link(attachment_id, storage)
    if link is not None:
        return RedirectResponse(link, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    stored_file = await controller.read_file(attachment_id, storage)
    return Response(
        content=stored_file.data,
        media_type=stored_file.content_type,
        headers={"Content-Disposition": f'inline; filename="{stored_file.filename}"'},
    )


@router.post(
    "/attachments/{attachment_id}/archive",
    operation_id="archiveAttachment",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND,
)
async def archive_attachment(attachment_id: str, user: CurrentUser) -> None:
    await controller.archive(attachment_id)


@router.post(
    "/attachments/{attachment_id}/restore", operation_id="restoreAttachment", responses=NOT_FOUND
)
async def restore_attachment(attachment_id: str, user: CurrentUser) -> AttachmentRead:
    return await controller.restore(attachment_id)


@router.delete(
    "/attachments/{attachment_id}",
    operation_id="deleteAttachment",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        **NOT_FOUND,
        status.HTTP_400_BAD_REQUEST: {
            "description": "Only archived attachments can be deleted permanently"
        },
    },
)
async def delete_attachment(attachment_id: str, user: CurrentUser, storage: Store) -> None:
    await controller.delete(attachment_id, storage=storage)
