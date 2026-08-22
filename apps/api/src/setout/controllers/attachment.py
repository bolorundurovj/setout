from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import HTTPException, status

from setout.config import get_settings
from setout.models.attachment import Attachment
from setout.models.expense import Expense
from setout.models.project import Project
from setout.schemas.attachment import AttachmentPage, AttachmentRead
from setout.services.storage import Storage, checksum_of, key_for

NO_SUCH_ATTACHMENT = "Attachment not found"

ALLOWED: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "application/pdf": ".pdf",
}


@dataclass(frozen=True)
class AttachmentFile:
    filename: str
    content_type: str
    data: bytes


class AttachmentController:
    async def list(
        self, expense_id: str, *, limit: int, offset: int, include_deleted: bool
    ) -> AttachmentPage:
        await self._expense_or_404(expense_id)
        query = Attachment.filter(expense_id=expense_id)
        if not include_deleted:
            query = query.filter(deleted_at__isnull=True)
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
        expense_id: str,
        *,
        filename: str,
        content_type: str,
        data: bytes,
        storage: Storage,
    ) -> AttachmentRead:
        await self._project_or_404(project_id)
        expense = await self._expense_or_404(expense_id)
        if expense.project_id != project_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")

        kind = content_type.split(";")[0].strip().lower()
        if kind not in ALLOWED:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="A receipt can be a photograph or a PDF, nothing else",
            )
        if not data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="That file is empty"
            )
        cap = get_settings().max_attachment_bytes
        if len(data) > cap:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"That file is larger than the {cap // (1024 * 1024)} MB limit",
            )

        checksum = checksum_of(data)
        name = self._clean(filename) or f"receipt{ALLOWED[kind]}"
        key = key_for(checksum, name if "." in name else f"{name}{ALLOWED[kind]}")
        if not await storage.exists(key):
            await storage.put(key, data, content_type=kind)
        row = await Attachment.create(
            project_id=project_id,
            expense_id=expense_id,
            filename=name,
            content_type=kind,
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
                detail="The record has this file but the store does not",
            ) from e
        return AttachmentFile(filename=row.filename, content_type=row.content_type, data=data)

    async def link(self, attachment_id: str, storage: Storage) -> str | None:
        row = await self._attachment_or_404(attachment_id)
        return await storage.url(
            row.storage_key, filename=row.filename, content_type=row.content_type
        )

    async def delete(self, attachment_id: str) -> None:
        row = await self._attachment_or_404(attachment_id)
        row.deleted_at = datetime.now(UTC)
        await row.save()

    async def restore(self, attachment_id: str) -> AttachmentRead:
        row = await self._attachment_or_404(attachment_id, include_deleted=True)
        if row.deleted_at is not None:
            row.deleted_at = None
            await row.save()
        return AttachmentRead.model_validate(row, from_attributes=True)

    def _clean(self, filename: str) -> str:
        last = filename.replace("\\", "/").rsplit("/", 1)[-1].strip()
        return "".join(c for c in last if c.isalnum() or c in " ._-()")[:255].strip()

    async def _project_or_404(self, project_id: str) -> Project:
        project = await Project.get_or_none(id=project_id, deleted_at__isnull=True)
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        return project

    async def _expense_or_404(self, expense_id: str) -> Expense:
        expense = await Expense.get_or_none(id=expense_id, deleted_at__isnull=True)
        if expense is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
        return expense

    async def _attachment_or_404(
        self, attachment_id: str, *, include_deleted: bool = False
    ) -> Attachment:
        row = await Attachment.get_or_none(id=attachment_id)
        if row is None or (row.deleted_at is not None and not include_deleted):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NO_SUCH_ATTACHMENT)
        return row
