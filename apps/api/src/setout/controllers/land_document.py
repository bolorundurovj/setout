from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import HTTPException, status

from setout.models.land import Land
from setout.models.land_document import LandDocument, LandDocumentKind
from setout.schemas.land_document import (
    LandDocumentPage,
    LandDocumentRead,
    LandDocumentUpdate,
)
from setout.services.storage import Storage
from setout.utils.uploads import checked_media_type, delete_unreferenced, store

NOT_FOUND_DOCUMENT = "Document not found"
NOT_FOUND_LAND = "Land not found"


@dataclass(frozen=True)
class LandDocumentFile:
    filename: str
    content_type: str
    data: bytes


class LandDocumentController:
    async def list(
        self, land_id: str, *, limit: int, offset: int, include_archived: bool
    ) -> LandDocumentPage:
        await self._land_or_404(land_id)
        query = LandDocument.filter(land_id=land_id)
        if not include_archived:
            query = query.filter(archived_at__isnull=True)
        total = await query.count()
        rows = await query.offset(offset).limit(limit)
        return LandDocumentPage(
            items=[LandDocumentRead.model_validate(row, from_attributes=True) for row in rows],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def create(
        self,
        land_id: str,
        *,
        kind: LandDocumentKind,
        notes: str | None,
        filename: str,
        content_type: str,
        data: bytes,
        storage: Storage,
    ) -> LandDocumentRead:
        await self._land_or_404(land_id)

        media_type = checked_media_type(content_type, data, subject="A land document")
        name, checksum, key = await store(
            data, filename, media_type, storage, default_stem="document"
        )
        row = await LandDocument.create(
            land_id=land_id,
            kind=kind,
            notes=notes,
            filename=name,
            content_type=media_type,
            byte_size=len(data),
            checksum=checksum,
            storage_key=key,
        )
        return LandDocumentRead.model_validate(row, from_attributes=True)

    async def get(self, document_id: str) -> LandDocumentRead:
        return LandDocumentRead.model_validate(
            await self._document_or_404(document_id), from_attributes=True
        )

    async def update(self, document_id: str, req: LandDocumentUpdate) -> LandDocumentRead:
        row = await self._document_or_404(document_id)
        changes = req.model_dump(exclude_unset=True)
        if changes:
            row.update_from_dict(changes)
            await row.save()
        return LandDocumentRead.model_validate(row, from_attributes=True)

    async def read_file(self, document_id: str, storage: Storage) -> LandDocumentFile:
        row = await self._document_or_404(document_id)
        try:
            data = await storage.get(row.storage_key)
        except FileNotFoundError as e:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="The file is missing from storage",
            ) from e
        return LandDocumentFile(filename=row.filename, content_type=row.content_type, data=data)

    async def link(self, document_id: str, storage: Storage) -> str | None:
        row = await self._document_or_404(document_id)
        return await storage.url(
            row.storage_key, filename=row.filename, content_type=row.content_type
        )

    async def archive(self, document_id: str) -> None:
        row = await self._document_or_404(document_id)
        row.archived_at = datetime.now(UTC)
        await row.save()

    async def restore(self, document_id: str) -> LandDocumentRead:
        row = await self._document_or_404(document_id, include_archived=True)
        if row.archived_at is not None:
            row.archived_at = None
            await row.save()
        return LandDocumentRead.model_validate(row, from_attributes=True)

    async def delete(self, document_id: str, storage: Storage | None = None) -> None:
        row = await self._document_or_404(document_id, include_archived=True)
        if row.archived_at is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only archived land documents can be deleted permanently",
            )
        key = row.storage_key
        await row.delete()
        await delete_unreferenced([key], storage)

    async def _land_or_404(self, land_id: str) -> Land:
        land = await Land.get_or_none(id=land_id, archived_at__isnull=True)
        if land is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_LAND)
        return land

    async def _document_or_404(
        self, document_id: str, *, include_archived: bool = False
    ) -> LandDocument:
        row = await LandDocument.get_or_none(id=document_id)
        if row is None or (row.archived_at is not None and not include_archived):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_DOCUMENT)
        return row
