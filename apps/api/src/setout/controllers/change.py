from __future__ import annotations

from collections import defaultdict
from typing import Any

from fastapi import HTTPException, status
from tortoise.fields.relational import ForeignKeyFieldInstance
from tortoise.models import Model

from setout.models.change import Change, ChangeAction
from setout.models.project import Project
from setout.schemas.change import ChangeField, ChangePage, ChangeRead
from setout.services.changes import TRACKED

NAME_FIELDS = {
    "project": "name",
    "category": "name",
    "budget_item": "description",
    "expense": "description",
    "agreement": "description",
    "delivery": "description",
    "attachment": "filename",
    "vendor": "name",
    "person": "name",
    "item": "name",
    "land": "name",
    "land_document": "filename",
    "country": "name",
    "state": "name",
}

NOUNS = {"budget_item": "budget item", "land": "land record", "land_document": "document"}


def noun(table: str) -> str:
    return NOUNS.get(table, table.replace("_", " "))


def links_of(model: type[Model]) -> dict[str, type[Model]]:
    """Each foreign key column of the model and the model it points to."""
    links: dict[str, type[Model]] = {}
    for name in model._meta.fk_fields:
        field = model._meta.fields_map[name]
        if isinstance(field, ForeignKeyFieldInstance):
            links[field.source_field or f"{name}_id"] = field.related_model
    return links


class ChangeController:
    def __init__(self) -> None:
        self.models = {model._meta.db_table: model for model in TRACKED}

    async def list_for(self, entity: str, entity_id: str, *, limit: int, offset: int) -> ChangePage:
        if entity not in self.models:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown record type")
        return await self._page(
            Change.filter(entity=entity, entity_id=entity_id), limit=limit, offset=offset
        )

    async def list_for_project(self, project_id: str, *, limit: int, offset: int) -> ChangePage:
        query = Change.filter(project_id=project_id)
        exists = await Project.filter(id=project_id).exists() or await query.exists()
        if not exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        return await self._page(query, limit=limit, offset=offset)

    async def _page(self, query: Any, *, limit: int, offset: int) -> ChangePage:
        total = await query.count()
        rows: list[Change] = await query.offset(offset).limit(limit).prefetch_related("user")
        names = await self._names(rows)
        return ChangePage(
            items=[self._read(row, names) for row in rows],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def _names(self, rows: list[Change]) -> dict[tuple[str, str], str]:
        """Current names of the changed rows and of every row their fields link to."""
        wanted: dict[type[Model], set[str]] = defaultdict(set)
        for row in rows:
            model = self.models.get(row.entity)
            if model is None:
                continue
            wanted[model].add(row.entity_id)
            if row.action is ChangeAction.IMPORT:
                continue
            links = links_of(model)
            for field, values in row.changed_fields.items():
                target = links.get(field)
                if target is not None:
                    wanted[target].update(str(value) for value in values if value)

        names: dict[tuple[str, str], str] = {}
        for model, ids in wanted.items():
            table = model._meta.db_table
            name_field = NAME_FIELDS.get(table)
            if name_field is None:
                continue
            for pk, name in await model.filter(pk__in=list(ids)).values_list(
                model._meta.pk_attr, name_field
            ):
                names[(table, str(pk))] = str(name)
        return names

    def _read(self, row: Change, names: dict[tuple[str, str], str]) -> ChangeRead:
        model = self.models.get(row.entity)
        links = (
            links_of(model) if model is not None and row.action is not ChangeAction.IMPORT else {}
        )

        def shown(field: str, value: Any) -> Any:
            target = links.get(field)
            if target is None or value is None:
                return value
            table = target._meta.db_table
            return names.get((table, str(value)), f"Deleted {noun(table)}")

        if row.action is ChangeAction.IMPORT:
            fields = [
                ChangeField(name=name, before=None, after=count)
                for name, count in row.changed_fields.items()
            ]
        else:
            fields = [
                ChangeField(name=name, before=shown(name, before), after=shown(name, after))
                for name, (before, after) in row.changed_fields.items()
            ]
        return ChangeRead(
            id=row.id,
            entity=row.entity,
            entity_id=row.entity_id,
            entity_name=names.get((row.entity, row.entity_id)) or self._own_name(row),
            project_id=row.project_id,
            action=row.action,
            fields=fields,
            user_name=row.user.name if row.user else None,
            created_at=row.created_at,
        )

    @staticmethod
    def _own_name(row: Change) -> str | None:
        """The name recorded in the change itself, for a row that no longer exists."""
        name_field = NAME_FIELDS.get(row.entity)
        if name_field is None or row.action is ChangeAction.IMPORT:
            return None
        values = row.changed_fields.get(name_field)
        if not values:
            return None
        name = values[1] if values[1] is not None else values[0]
        return str(name) if name is not None else None
