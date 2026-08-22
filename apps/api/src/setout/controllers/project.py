from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime

from fastapi import HTTPException, status

from setout.models.currency import Currency
from setout.models.project import Project, ProjectStatus
from setout.schemas.project import (
    ProjectCreate,
    ProjectPage,
    ProjectRead,
    ProjectSummary,
    ProjectUpdate,
)
from setout.utils.budgets import planned_by_project, spent_by_project
from setout.utils.cascade import delete_under_project, restore_under_project
from setout.utils.projects import require_archived, to_read


class ProjectController:
    async def list(self, *, include_deleted: bool, limit: int, offset: int) -> ProjectPage:
        query = Project.all()
        if not include_deleted:
            query = query.filter(deleted_at__isnull=True)
        total = await query.count()
        projects = (
            await query.order_by("-created_at")
            .offset(offset)
            .limit(limit)
            .prefetch_related("currency")
        )
        ids = [project.id for project in projects]
        planned = await planned_by_project(ids)
        spent = await spent_by_project(ids)
        return ProjectPage(
            items=[
                to_read(project, planned.get(project.id, 0), spent.get(project.id, 0))
                for project in projects
            ],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def summary(self) -> ProjectSummary:
        live = await Project.filter(deleted_at__isnull=True)
        counts = Counter(project.status for project in live)
        return ProjectSummary(
            total=len(live),
            active=counts[ProjectStatus.ACTIVE],
            on_hold=counts[ProjectStatus.ON_HOLD],
            completed=counts[ProjectStatus.COMPLETED],
            archived=counts[ProjectStatus.ARCHIVED],
            deleted=await Project.filter(deleted_at__not_isnull=True).count(),
            currency_codes=sorted({project.currency_id for project in live}),
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
            status=req.status,
            notes=req.notes,
        )
        await project.fetch_related("currency")
        return to_read(project)

    async def get(self, project_id: str) -> ProjectRead:
        project = await self._get_or_404(project_id)
        planned = await planned_by_project([project.id])
        spent = await spent_by_project([project.id])
        return to_read(project, planned.get(project.id, 0), spent.get(project.id, 0))

    async def update(self, project_id: str, req: ProjectUpdate) -> ProjectRead:
        project = await self._get_or_404(project_id)
        changes = req.model_dump(exclude_unset=True)
        if changes:
            project.update_from_dict(changes)
            await project.save()
        planned = await planned_by_project([project.id])
        spent = await spent_by_project([project.id])
        return to_read(project, planned.get(project.id, 0), spent.get(project.id, 0))

    async def delete(self, project_id: str) -> None:
        project = await self._get_or_404(project_id)
        require_archived(project)
        deleted_at = datetime.now(UTC)
        project.deleted_at = deleted_at
        await project.save()
        await delete_under_project(project.id, deleted_at)

    async def restore(self, project_id: str) -> ProjectRead:
        project = await self._get_or_404(project_id, include_deleted=True)
        if project.deleted_at is not None:
            deleted_at = project.deleted_at
            project.deleted_at = None
            await project.save()
            await restore_under_project(project.id, deleted_at)
        planned = await planned_by_project([project.id])
        spent = await spent_by_project([project.id])
        return to_read(project, planned.get(project.id, 0), spent.get(project.id, 0))

    async def _get_or_404(self, project_id: str, *, include_deleted: bool = False) -> Project:
        project = await Project.get_or_none(id=project_id).prefetch_related("currency")
        if project is None or (project.deleted_at is not None and not include_deleted):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        return project
