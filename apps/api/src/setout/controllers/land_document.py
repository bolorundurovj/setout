from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import HTTPException, status

from setout.config import get_settings
from setout.models.land import Land
from setout.models.land_document import LandDocument, LandDocumentKind
from setout.schemas.land_document import LandDocumentPage, LandDocumentRead
from setout.services.storage import Storage, checksum_of, key_for

NO_SUCH_DOCUMENT = "Document not found"
NO_SUCH_LAND = "Land not found"

ALLOWED: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "application/pdf": ".pdf",
}


@dataclass(frozen=True)
class LandDocumentFile:
    filename: str
    content_type: str
    data: bytes


class LandDocumentController:
    async def list(
        self, land_id: str, *, limit: int, offset: int, include_deleted: bool
    ) -> LandDocumentPage:
        await self._land_or_404(land_id)
        query = LandDocument.filter(land_id=land_id)
        if not include_deleted:
            query = query.filter(deleted_at__isnull=True)
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
        filename: str,
        content_type: str,
        data: bytes,
        storage: Storage,
    ) -> LandDocumentRead:
        await self._land_or_404(land_id)

        media_type = content_type.split(";")[0].strip().lower()
        if media_type not in ALLOWED:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="A land document can be a photograph or a PDF, nothing else",
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
        name = self._clean(filename) or f"document{ALLOWED[media_type]}"
        key = key_for(checksum, name if "." in name else f"{name}{ALLOWED[media_type]}")
        if not await storage.exists(key):
            await storage.put(key, data, content_type=media_type)
        row = await LandDocument.create(
            land_id=land_id,
            kind=kind,
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

    async def read_file(self, document_id: str, storage: Storage) -> LandDocumentFile:
        row = await self._document_or_404(document_id)
        try:
            data = await storage.get(row.storage_key)
        except FileNotFoundError as e:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=NO_SUCH_DOCUMENT
            ) from e
        return LandDocumentFile(filename=row.filename, content_type=row.content_type, data=data)

    async def link(self, document_id: str, storage: Storage) -> str | None:
        row = await self._document_or_404(document_id)
        return await storage.url(
            row.storage_key, filename=row.filename, content_type=row.content_type
        )

    async def delete(self, document_id: str) -> None:
        row = await self._document_or_404(document_id)
        row.deleted_at = datetime.now(UTC)
        await row.save()

    async def restore(self, document_id: str) -> LandDocumentRead:
        row = await self._document_or_404(document_id, include_deleted=True)
        if row.deleted_at is not None:
            row.deleted_at = None
            await row.save()
        return LandDocumentRead.model_validate(row, from_attributes=True)

    @staticmethod
    def _clean(filename: str) -> str:
        # Whatever the browser sent, keep only the last path segment.
        return filename.replace("\\", "/").rsplit("/", 1)[-1].strip()

    async def _land_or_404(self, land_id: str) -> Land:
        land = await Land.get_or_none(id=land_id, deleted_at__isnull=True)
        if land is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NO_SUCH_LAND)
        return land

    async def _document_or_404(
        self, document_id: str, *, include_deleted: bool = False
    ) -> LandDocument:
        row = await LandDocument.get_or_none(id=document_id)
        if row is None or (row.deleted_at is not None and not include_deleted):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NO_SUCH_DOCUMENT)
        return row
