from __future__ import annotations

from fastapi import HTTPException, status

from setout.models.project import Project, ProjectStatus
from setout.schemas.project import ProjectRead


def require_archived(project: Project) -> None:
    if project.status != ProjectStatus.ARCHIVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Archive the project before deleting it",
        )


def to_read(project: Project, planned_amount: int = 0, spent_amount: int = 0) -> ProjectRead:
    land = project.land if project.land_id is not None else None
    return ProjectRead(
        id=project.id,
        name=project.name,
        currency_code=project.currency_id,
        currency_exponent=project.currency.exponent,
        planned_amount=planned_amount,
        spent_amount=spent_amount,
        status=project.status,
        land_id=project.land_id,
        land_name=land.name if land is not None else None,
        notes=project.notes,
        created_at=project.created_at,
        updated_at=project.updated_at,
        deleted_at=project.deleted_at,
    )
