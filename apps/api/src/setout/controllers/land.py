from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime

from fastapi import HTTPException, status

from setout.models.country import Country, State
from setout.models.currency import Currency
from setout.models.land import Land
from setout.models.land_document import LandDocument, LandDocumentKind
from setout.models.land_valuation import LandValuation, LandValuationKind
from setout.models.project import Project
from setout.schemas.land import LandCreate, LandPage, LandProject, LandRead, LandUpdate
from setout.utils.cascade import delete_under_land, restore_under_land

NOT_FOUND_LAND = "Land not found"
DUPLICATE_NAME = "A land with that name already exists"


@dataclass(frozen=True)
class LandPrice:
    purchase_amount: int | None
    current_value: int | None
    count: int


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
        countries = await self._country_names(lands)
        exponents = await self._exponents(lands)
        prices = await self._prices(ids)
        return LandPage(
            items=[
                self._read(land, kinds, projects, countries, exponents, prices) for land in lands
            ],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def create(self, req: LandCreate) -> LandRead:
        await self._reject_duplicate(req.name)
        values = req.model_dump()
        code = values.pop("country_code")
        values["country_id"], values["state"] = await self._place(code, values["state"])
        land = await Land.create(**values)
        names = await self._country_names([land])
        return self._read(land, {}, {}, names, {}, {})

    async def get(self, land_id: str) -> LandRead:
        land = await self._land_or_404(land_id, include_deleted=True)
        return await self._one(land)

    async def update(self, land_id: str, req: LandUpdate) -> LandRead:
        land = await self._land_or_404(land_id)
        changes = req.model_dump(exclude_unset=True)
        name = changes.get("name")
        if name is not None and name.casefold() != land.name.casefold():
            await self._reject_duplicate(name)
        if "country_code" in changes or "state" in changes:
            code = changes.pop("country_code", land.country_id)
            state = changes.get("state", land.state)
            changes["country_id"], changes["state"] = await self._place(code, state)
        if changes:
            land.update_from_dict(changes)
            await land.save()
        return await self._one(land)

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
        return await self._one(land)

    async def _one(self, land: Land) -> LandRead:
        ids = [land.id]
        return self._read(
            land,
            await self._kinds_of(ids),
            await self._projects_of(ids),
            await self._country_names([land]),
            await self._exponents([land]),
            await self._prices(ids),
        )

    async def _place(
        self, country_code: str | None, state: str | None
    ) -> tuple[str | None, str | None]:
        """A state is only checked once a country says which list it should be in."""
        if country_code is None:
            return None, state
        code = country_code.upper()
        country = await Country.get_or_none(code=code)
        if country is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Unknown country: {country_code}",
            )
        if state is None:
            return code, None
        wanted = state.strip()
        for row in await State.filter(country_id=code):
            if wanted.casefold() in (row.name.casefold(), row.code.casefold()):
                return code, row.name
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"{state} is not a state in {country.name}",
        )

    async def _country_names(self, lands: list[Land]) -> dict[str, str]:
        codes = {land.country_id for land in lands if land.country_id is not None}
        if not codes:
            return {}
        return {c.code: c.name for c in await Country.filter(code__in=list(codes))}

    async def _exponents(self, lands: list[Land]) -> dict[str, int]:
        codes = {land.currency_id for land in lands if land.currency_id is not None}
        if not codes:
            return {}
        return {c.code: c.exponent for c in await Currency.filter(code__in=list(codes))}

    async def _prices(self, land_ids: list[str]) -> dict[str, LandPrice]:
        if not land_ids:
            return {}
        purchase: dict[str, int] = {}
        newest: dict[str, tuple[date, int]] = {}
        counted: dict[str, int] = {}
        rows = await LandValuation.filter(land_id__in=land_ids, deleted_at__isnull=True)
        for row in rows:
            counted[row.land_id] = counted.get(row.land_id, 0) + 1
            if row.kind is LandValuationKind.PURCHASE:
                purchase[row.land_id] = row.amount
            seen = newest.get(row.land_id)
            if seen is None or row.valued_on >= seen[0]:
                newest[row.land_id] = (row.valued_on, row.amount)
        return {
            land_id: LandPrice(
                purchase_amount=purchase.get(land_id),
                current_value=newest[land_id][1] if land_id in newest else None,
                count=count,
            )
            for land_id, count in counted.items()
        }

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
        countries: dict[str, str],
        exponents: dict[str, int],
        prices: dict[str, LandPrice],
    ) -> LandRead:
        held = kinds.get(land.id, [])
        price = prices.get(land.id)
        return LandRead(
            id=land.id,
            name=land.name,
            address=land.address,
            city=land.city,
            state=land.state,
            country_code=land.country_id,
            country_name=countries.get(land.country_id) if land.country_id else None,
            purchased_on=land.purchased_on,
            size_value=land.size_value,
            size_unit=land.size_unit,
            notes=land.notes,
            currency_code=land.currency_id,
            currency_exponent=exponents.get(land.currency_id) if land.currency_id else None,
            purchase_amount=price.purchase_amount if price else None,
            current_value=price.current_value if price else None,
            valuation_count=price.count if price else 0,
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
