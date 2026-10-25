from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from setout.models.change import ChangeAction


class ChangeField(BaseModel):
    name: str
    before: Any = Field(..., description="Linked records are given by name")
    after: Any = Field(..., description="Linked records are given by name")


class ChangeRead(BaseModel):
    id: str
    entity: str = Field(..., description="The table of the changed row")
    entity_id: str
    entity_name: str | None = Field(
        ..., description="The row's name or description, now or when it was deleted"
    )
    project_id: str | None
    action: ChangeAction
    fields: list[ChangeField]
    user_name: str | None = Field(..., description="Null when Setout made the change")
    created_at: datetime


class ChangePage(BaseModel):
    items: list[ChangeRead]
    total: int
    limit: int
    offset: int
