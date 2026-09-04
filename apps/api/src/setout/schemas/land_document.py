from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from setout.models.land_document import LandDocumentKind


class LandDocumentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: LandDocumentKind | None = None
    note: str | None = Field(None, max_length=255)


class LandDocumentRead(BaseModel):
    id: str
    land_id: str
    kind: LandDocumentKind
    note: str | None
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
