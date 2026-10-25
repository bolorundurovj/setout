from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from fastapi import HTTPException, status

from setout.models.agreement import Agreement
from setout.models.attachment import Attachment
from setout.models.delivery import Delivery
from setout.models.expense import Expense
from setout.models.project import Project
from setout.schemas.attachment import AttachmentPage, AttachmentRead
from setout.services.storage import Storage
from setout.utils.uploads import checked_media_type, delete_unreferenced, store

NOT_FOUND_ATTACHMENT = "Attachment not found"


class AttachedTo(StrEnum):
    PROJECT = "project"
    EXPENSE = "expense"
    AGREEMENT = "agreement"
    DELIVERY = "delivery"


Parent = Project | Expense | Agreement | Delivery

PARENTS: dict[AttachedTo, tuple[type[Parent], str]] = {
    AttachedTo.PROJECT: (Project, "Project not found"),
    AttachedTo.EXPENSE: (Expense, "Expense not found"),
    AttachedTo.AGREEMENT: (Agreement, "Agreement not found"),
    AttachedTo.DELIVERY: (Delivery, "Delivery not found"),
}


@dataclass(frozen=True)
class AttachmentFile:
    filename: str
    content_type: str
    data: bytes


class AttachmentController:
    async def list(
        self,
        attached_to: AttachedTo,
        parent_id: str,
        *,
        limit: int,
        offset: int,
        include_archived: bool,
    ) -> AttachmentPage:
        await self._parent_or_404(attached_to, parent_id)
        query = Attachment.filter(**self._parent_filter(attached_to, parent_id))
        if not include_archived:
            query = query.filter(archived_at__isnull=True)
        total = await query.count()
        rows = await query.offset(offset).limit(limit)
        return AttachmentPage(
            items=[AttachmentRead.model_validate(row, from_attributes=True) for row in rows],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def create(
        self,
        project_id: str,
        attached_to: AttachedTo,
        parent_id: str,
        *,
        filename: str,
        content_type: str,
        data: bytes,
        storage: Storage,
    ) -> AttachmentRead:
        await self._parent_or_404(AttachedTo.PROJECT, project_id)
        parent = await self._parent_or_404(attached_to, parent_id)
        if not isinstance(parent, Project) and parent.project_id != project_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=PARENTS[attached_to][1]
            )

        media_type = checked_media_type(content_type, data, subject="An attachment")
        name, checksum, key = await store(
            data, filename, media_type, storage, default_stem="attachment"
        )
        parent_fields = {**self._parent_filter(attached_to, parent_id), "project_id": project_id}
        row = await Attachment.create(
            **parent_fields,
            filename=name,
            content_type=media_type,
            byte_size=len(data),
            checksum=checksum,
            storage_key=key,
        )
        return AttachmentRead.model_validate(row, from_attributes=True)

    async def get(self, attachment_id: str) -> AttachmentRead:
        return AttachmentRead.model_validate(
            await self._attachment_or_404(attachment_id), from_attributes=True
        )

    async def read_file(self, attachment_id: str, storage: Storage) -> AttachmentFile:
        row = await self._attachment_or_404(attachment_id)
        try:
            data = await storage.get(row.storage_key)
        except FileNotFoundError as e:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="The file is missing from storage",
            ) from e
        return AttachmentFile(filename=row.filename, content_type=row.content_type, data=data)

    async def link(self, attachment_id: str, storage: Storage) -> str | None:
        row = await self._attachment_or_404(attachment_id)
        return await storage.url(
            row.storage_key, filename=row.filename, content_type=row.content_type
        )

    async def archive(self, attachment_id: str) -> None:
        row = await self._attachment_or_404(attachment_id)
        row.archived_at = datetime.now(UTC)
        await row.save()

    async def restore(self, attachment_id: str) -> AttachmentRead:
        row = await self._attachment_or_404(attachment_id, include_archived=True)
        if row.archived_at is not None:
            row.archived_at = None
            await row.save()
        return AttachmentRead.model_validate(row, from_attributes=True)

    async def delete(self, attachment_id: str, storage: Storage | None = None) -> None:
        row = await self._attachment_or_404(attachment_id, include_archived=True)
        if row.archived_at is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only archived attachments can be deleted permanently",
            )
        key = row.storage_key
        await row.delete()
        await delete_unreferenced([key], storage)

    @staticmethod
    def _parent_filter(attached_to: AttachedTo, parent_id: str) -> dict[str, Any]:
        if attached_to is AttachedTo.PROJECT:
            return {
                "project_id": parent_id,
                "expense_id": None,
                "agreement_id": None,
                "delivery_id": None,
            }
        return {f"{attached_to.value}_id": parent_id}

    async def _parent_or_404(self, attached_to: AttachedTo, parent_id: str) -> Parent:
        model, not_found = PARENTS[attached_to]
        parent = await model.get_or_none(id=parent_id, archived_at__isnull=True)
        if parent is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=not_found)
        return parent

    async def _attachment_or_404(
        self, attachment_id: str, *, include_archived: bool = False
    ) -> Attachment:
        row = await Attachment.get_or_none(id=attachment_id)
        if row is None or (row.archived_at is not None and not include_archived):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_ATTACHMENT)
        return row
