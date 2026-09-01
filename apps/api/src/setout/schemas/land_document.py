from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from setout.models.land_document import LandDocumentKind


class LandDocumentRead(BaseModel):
    id: str
    land_id: str
    kind: LandDocumentKind
    filename: str
    content_type: str
    byte_size: int
    checksum: str
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class LandDocumentPage(BaseModel):
    items: list[LandDocumentRead]
    total: int
    limit: int
    offset: int
