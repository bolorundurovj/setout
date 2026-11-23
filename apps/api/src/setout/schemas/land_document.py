from __future__ import annotations

from datetime import datetime
from typing import ClassVar

from pydantic import BaseModel, Field

from setout.models.land_document import LandDocumentKind
from setout.schemas.base import UpdateModel


class LandDocumentUpdate(UpdateModel):
    NOT_NULL: ClassVar[frozenset[str]] = frozenset({"kind"})

    kind: LandDocumentKind | None = None
    notes: str | None = Field(None, max_length=255)


class LandDocumentRead(BaseModel):
    id: str
    land_id: str
    kind: LandDocumentKind
    notes: str | None
    filename: str
    content_type: str
    byte_size: int
    checksum: str
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class LandDocumentPage(BaseModel):
    items: list[LandDocumentRead]
    total: int
    limit: int
    offset: int
