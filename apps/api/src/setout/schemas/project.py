from __future__ import annotations

from datetime import datetime
from typing import ClassVar

from pydantic import BaseModel, Field

from setout.models.project import ProjectStatus
from setout.schemas.base import UpdateModel

CURRENCY_PATTERN = r"^[A-Z]{3}$"


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    currency_code: str = Field(
        ...,
        pattern=CURRENCY_PATTERN,
        description="ISO 4217 code. Cannot be changed after the project is created",
    )
    status: ProjectStatus = ProjectStatus.ACTIVE
    land_id: str | None = Field(None, description="The land record the project is on")
    notes: str | None = None


class ProjectUpdate(UpdateModel):
    NOT_NULL: ClassVar[frozenset[str]] = frozenset({"name", "status"})

    name: str | None = Field(None, min_length=1, max_length=255)
    status: ProjectStatus | None = None
    land_id: str | None = Field(None, description="Empty string clears the link")
    notes: str | None = None


class ProjectSummary(BaseModel):
    total: int
    active: int
    on_hold: int
    completed: int
    closed: int
    archived: int
    currency_codes: list[str]


class ProjectRead(BaseModel):
    id: str
    name: str
    currency_code: str
    currency_exponent: int
    # Computed from budget items and expenses; not stored.
    budgeted_amount: int
    spent_amount: int
    status: ProjectStatus
    land_id: str | None
    land_name: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class ProjectPage(BaseModel):
    items: list[ProjectRead]
    total: int
    limit: int
    offset: int
