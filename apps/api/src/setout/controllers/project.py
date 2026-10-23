from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime

from fastapi import HTTPException, status

from setout.models.currency import Currency
from setout.models.land import Land
from setout.models.project import Project, ProjectStatus
from setout.schemas.project import (
    ProjectCreate,
    ProjectPage,
    ProjectRead,
    ProjectSummary,
    ProjectUpdate,
)
from setout.utils.budgets import budgeted_by_project, spent_by_project
from setout.utils.cascade import archive_under_project, restore_under_project
from setout.utils.projects import require_closed, to_read


class ProjectController:
    async def list(self, *, include_archived: bool, limit: int, offset: int) -> ProjectPage:
        query = Project.all()
        if not include_archived:
            query = query.filter(archived_at__isnull=True)
        total = await query.count()
        projects = (
            await query.order_by("-created_at")
            .offset(offset)
            .limit(limit)
            .prefetch_related("currency", "land")
        )
        ids = [project.id for project in projects]
        budgeted = await budgeted_by_project(ids)
        spent = await spent_by_project(ids)
        return ProjectPage(
            items=[
                to_read(project, budgeted.get(project.id, 0), spent.get(project.id, 0))
                for project in projects
            ],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def summary(self) -> ProjectSummary:
        unarchived = await Project.filter(archived_at__isnull=True)
        counts = Counter(project.status for project in unarchived)
        return ProjectSummary(
            total=len(unarchived),
            active=counts[ProjectStatus.ACTIVE],
            on_hold=counts[ProjectStatus.ON_HOLD],
            completed=counts[ProjectStatus.COMPLETED],
            closed=counts[ProjectStatus.CLOSED],
            archived=await Project.filter(archived_at__not_isnull=True).count(),
            currency_codes=sorted({project.currency_id for project in unarchived}),
        )

    async def create(self, req: ProjectCreate) -> ProjectRead:
        currency = await Currency.get_or_none(code=req.currency_code)
        if currency is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Unknown currency: {req.currency_code}",
            )
        project = await Project.create(
            name=req.name,
            currency=currency,
            land_id=await self._land_or_422(req.land_id),
            status=req.status,
            notes=req.notes,
        )
        await project.fetch_related("currency", "land")
        return to_read(project)

    async def get(self, project_id: str) -> ProjectRead:
        project = await self._get_or_404(project_id)
        budgeted = await budgeted_by_project([project.id])
        spent = await spent_by_project([project.id])
        return to_read(project, budgeted.get(project.id, 0), spent.get(project.id, 0))

    async def update(self, project_id: str, req: ProjectUpdate) -> ProjectRead:
        project = await self._get_or_404(project_id)
        changes = req.model_dump(exclude_unset=True)
        if "land_id" in changes:
            changes["land_id"] = await self._land_or_422(changes["land_id"])
        if changes:
            project.update_from_dict(changes)
            await project.save()
            await project.fetch_related("land")
        budgeted = await budgeted_by_project([project.id])
        spent = await spent_by_project([project.id])
        return to_read(project, budgeted.get(project.id, 0), spent.get(project.id, 0))

    async def archive(self, project_id: str) -> None:
        project = await self._get_or_404(project_id)
        require_closed(project)
        archived_at = datetime.now(UTC)
        project.archived_at = archived_at
        await project.save()
        await archive_under_project(project.id, archived_at)

    async def restore(self, project_id: str) -> ProjectRead:
        project = await self._get_or_404(project_id, include_archived=True)
        if project.archived_at is not None:
            archived_at = project.archived_at
            project.archived_at = None
            await project.save()
            await restore_under_project(project.id, archived_at)
        budgeted = await budgeted_by_project([project.id])
        spent = await spent_by_project([project.id])
        return to_read(project, budgeted.get(project.id, 0), spent.get(project.id, 0))

    async def _land_or_422(self, land_id: str | None) -> str | None:
        # Forms send an empty string for no land, which clears the link.
        if not land_id:
            return None
        if not await Land.filter(id=land_id, archived_at__isnull=True).exists():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Land not found",
            )
        return land_id

    async def _get_or_404(self, project_id: str, *, include_archived: bool = False) -> Project:
        project = await Project.get_or_none(id=project_id).prefetch_related("currency", "land")
        if project is None or (project.archived_at is not None and not include_archived):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        return project
