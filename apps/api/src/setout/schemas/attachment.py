from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class AttachmentRead(BaseModel):
    id: str
    project_id: str
    expense_id: str | None
    agreement_id: str | None
    delivery_id: str | None
    filename: str
    content_type: str
    byte_size: int
    checksum: str
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class AttachmentPage(BaseModel):
    items: list[AttachmentRead]
    total: int
    limit: int
    offset: int
