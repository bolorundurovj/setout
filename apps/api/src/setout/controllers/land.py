from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status

from setout.models.land import Land
from setout.models.land_document import LandDocument, LandDocumentKind
from setout.models.project import Project
from setout.schemas.land import LandCreate, LandPage, LandProject, LandRead, LandUpdate
from setout.utils.cascade import delete_under_land, restore_under_land

NOT_FOUND_LAND = "Land not found"
DUPLICATE_NAME = "A land with that name already exists"

# Every plot is expected to have these eventually. Receipts and anything else
# are welcome but their absence is not worth reporting.
EXPECTED_KINDS: tuple[LandDocumentKind, ...] = (
    LandDocumentKind.CERTIFICATE_OF_OCCUPANCY,
    LandDocumentKind.SURVEY_PLAN,
    LandDocumentKind.DEED,
)


class LandController:
    async def list_lands(
        self, *, search: str | None, include_archived: bool, limit: int, offset: int
    ) -> LandPage:
        query = Land.all() if include_archived else Land.filter(deleted_at__isnull=True)
        if search:
            query = query.filter(name__icontains=search)
        total = await query.count()
        lands = await query.offset(offset).limit(limit)
        ids = [land.id for land in lands]
        kinds = await self._kinds_of(ids)
        projects = await self._projects_of(ids)
        return LandPage(
            items=[self._read(land, kinds, projects) for land in lands],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def create(self, req: LandCreate) -> LandRead:
        await self._reject_duplicate(req.name)
        land = await Land.create(**req.model_dump())
        return self._read(land, {}, {})

    async def get(self, land_id: str) -> LandRead:
        land = await self._land_or_404(land_id, include_deleted=True)
        return self._read(land, await self._kinds_of([land.id]), await self._projects_of([land.id]))

    async def update(self, land_id: str, req: LandUpdate) -> LandRead:
        land = await self._land_or_404(land_id)
        changes = req.model_dump(exclude_unset=True)
        name = changes.get("name")
        if name is not None and name.casefold() != land.name.casefold():
            await self._reject_duplicate(name)
        if changes:
            land.update_from_dict(changes)
            await land.save()
        return self._read(land, await self._kinds_of([land.id]), await self._projects_of([land.id]))

    async def delete(self, land_id: str) -> None:
        land = await self._land_or_404(land_id)
        deleted_at = datetime.now(UTC)
        land.deleted_at = deleted_at
        await land.save()
        await delete_under_land(land.id, deleted_at)

    async def restore(self, land_id: str) -> LandRead:
        land = await self._land_or_404(land_id, include_deleted=True)
        if land.deleted_at is not None:
            deleted_at = land.deleted_at
            land.deleted_at = None
            await land.save()
            await restore_under_land(land.id, deleted_at)
        return self._read(land, await self._kinds_of([land.id]), await self._projects_of([land.id]))

    async def _kinds_of(self, land_ids: list[str]) -> dict[str, list[LandDocumentKind]]:
        if not land_ids:
            return {}
        found: dict[str, list[LandDocumentKind]] = {}
        for row in await LandDocument.filter(land_id__in=land_ids, deleted_at__isnull=True):
            found.setdefault(row.land_id, []).append(row.kind)
        return found

    async def _projects_of(self, land_ids: list[str]) -> dict[str, list[LandProject]]:
        if not land_ids:
            return {}
        found: dict[str, list[LandProject]] = {}
        for project in await Project.filter(land_id__in=land_ids).order_by("name"):
            if project.land_id is None:
                continue
            found.setdefault(project.land_id, []).append(
                LandProject(
                    id=project.id,
                    name=project.name,
                    status=str(project.status),
                    deleted_at=project.deleted_at,
                )
            )
        return found

    def _read(
        self,
        land: Land,
        kinds: dict[str, list[LandDocumentKind]],
        projects: dict[str, list[LandProject]],
    ) -> LandRead:
        held = kinds.get(land.id, [])
        return LandRead(
            id=land.id,
            name=land.name,
            address=land.address,
            city=land.city,
            state=land.state,
            size_value=land.size_value,
            size_unit=land.size_unit,
            notes=land.notes,
            document_count=len(held),
            missing_kinds=[str(kind) for kind in EXPECTED_KINDS if kind not in held],
            projects=projects.get(land.id, []),
            created_at=land.created_at,
            updated_at=land.updated_at,
            deleted_at=land.deleted_at,
        )

    async def _reject_duplicate(self, name: str) -> None:
        if await Land.filter(name__iexact=name, deleted_at__isnull=True).exists():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DUPLICATE_NAME)

    async def _land_or_404(self, land_id: str, *, include_deleted: bool = False) -> Land:
        land = await Land.get_or_none(id=land_id)
        if land is None or (land.deleted_at is not None and not include_deleted):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_LAND)
        return land
