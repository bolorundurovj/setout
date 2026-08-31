from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from setout.models.project import ProjectStatus

CURRENCY_PATTERN = r"^[A-Z]{3}$"


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    currency_code: str = Field(
        ...,
        pattern=CURRENCY_PATTERN,
        description="ISO 4217 code. Fixed once the project exists",
    )
    status: ProjectStatus = ProjectStatus.ACTIVE
    land_id: str | None = Field(None, description="The plot it is being built on")
    notes: str | None = None


class ProjectUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(None, min_length=1, max_length=255)
    status: ProjectStatus | None = None
    land_id: str | None = Field(None, description="Empty string clears the link")
    notes: str | None = None


class ProjectSummary(BaseModel):
    total: int
    active: int
    on_hold: int
    completed: int
    archived: int
    deleted: int
    currency_codes: list[str]


class ProjectRead(BaseModel):
    id: str
    name: str
    currency_code: str
    currency_exponent: int
    # Both summed from the rows beneath the project, never stored.
    planned_amount: int
    spent_amount: int
    status: ProjectStatus
    land_id: str | None
    land_name: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class ProjectPage(BaseModel):
    items: list[ProjectRead]
    total: int
    limit: int
    offset: int
