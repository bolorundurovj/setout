from __future__ import annotations

from collections.abc import Awaitable, Callable, Iterable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import UTC, date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.models import Model
from tortoise.queryset import QuerySet
from tortoise.signals import Signals

from setout.models.advance import Advance
from setout.models.agreement import Agreement
from setout.models.attachment import Attachment
from setout.models.budget import BudgetItem
from setout.models.category import Category
from setout.models.change import Change, ChangeAction
from setout.models.delivery import Delivery
from setout.models.expense import Expense
from setout.models.item import Item
from setout.models.land import Land
from setout.models.land_document import LandDocument
from setout.models.land_valuation import LandValuation
from setout.models.person import Person
from setout.models.project import Project
from setout.models.vendor import Vendor

Row = dict[str, Any]
ProjectOf = Callable[[Row, BaseDBAsyncClient | None], Awaitable[str | None]]

actor: ContextVar[str | None] = ContextVar("actor", default=None)
paused: ContextVar[bool] = ContextVar("paused", default=False)

EXCLUDED = {"created_at", "updated_at", "set_at"}
STORED = "_change_stored"


@contextmanager
def recording_paused() -> Iterator[None]:
    token = paused.set(True)
    try:
        yield
    finally:
        paused.reset(token)


async def _own_id(row: Row, db: BaseDBAsyncClient | None) -> str | None:
    return str(row["id"])


async def _project_column(row: Row, db: BaseDBAsyncClient | None) -> str | None:
    return str(row["project_id"]) if row.get("project_id") else None


async def _category_project(row: Row, db: BaseDBAsyncClient | None) -> str | None:
    project_ids = (
        await Category.filter(id=row["category_id"])
        .using_db(db)
        .values_list("project_id", flat=True)
    )
    return str(project_ids[0]) if project_ids else None


async def _no_project(row: Row, db: BaseDBAsyncClient | None) -> str | None:
    return None


TRACKED: dict[type[Model], ProjectOf] = {
    Project: _own_id,
    Category: _project_column,
    BudgetItem: _category_project,
    Expense: _project_column,
    Agreement: _project_column,
    Advance: _project_column,
    Delivery: _project_column,
    Attachment: _project_column,
    Vendor: _no_project,
    Person: _no_project,
    Item: _no_project,
    Land: _no_project,
    LandDocument: _no_project,
    LandValuation: _no_project,
}


def to_json(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, Decimal):
        return format(value.normalize(), "f")
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            value = value.astimezone(UTC).replace(tzinfo=None)
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return value


def row_of(instance: Model) -> Row:
    return {name: getattr(instance, name) for name in instance._meta.fields_db_projection}


def differences(before: Row, after: Row) -> dict[str, list[Any]]:
    """Each field whose JSON value differs, as [before, after], leaving out timestamps."""
    changed: dict[str, list[Any]] = {}
    for name in sorted(set(before) | set(after)):
        if name in EXCLUDED:
            continue
        old, new = to_json(before.get(name)), to_json(after.get(name))
        if old != new:
            changed[name] = [old, new]
    return changed


def action_for(before: Row | None, changed: dict[str, list[Any]]) -> ChangeAction:
    if before is None:
        return ChangeAction.CREATE
    archived = changed.get("archived_at")
    if archived and archived[0] is None:
        return ChangeAction.ARCHIVE
    if archived and archived[1] is None:
        return ChangeAction.RESTORE
    return ChangeAction.UPDATE


async def _write(
    model: type[Model],
    row: Row,
    action: ChangeAction,
    changed: dict[str, Any],
    db: BaseDBAsyncClient | None,
) -> None:
    await Change.create(
        entity=model._meta.db_table,
        entity_id=str(row["id"]),
        project_id=await TRACKED[model](row, db),
        action=action,
        changed_fields=changed,
        user_id=actor.get(),
        using_db=db,
    )


async def _pre_save(
    sender: type[Model],
    instance: Model,
    using_db: BaseDBAsyncClient | None,
    update_fields: Iterable[str] | None,
) -> None:
    stored = None
    if instance._saved_in_db and not paused.get():
        stored = await sender.filter(pk=instance.pk).using_db(using_db).values()
    setattr(instance, STORED, stored[0] if stored else None)


async def _post_save(
    sender: type[Model],
    instance: Model,
    created: bool,
    using_db: BaseDBAsyncClient | None,
    update_fields: Iterable[str] | None,
) -> None:
    if paused.get():
        return
    before: Row | None = None if created else getattr(instance, STORED, None)
    if before is None and not created:
        return
    after = row_of(instance)
    changed = differences(before or {}, after)
    if created:
        changed = {name: values for name, values in changed.items() if values[1] is not None}
    if changed:
        await _write(sender, after, action_for(before, changed), changed, using_db)


async def _post_delete(
    sender: type[Model], instance: Model, using_db: BaseDBAsyncClient | None
) -> None:
    if paused.get():
        return
    row = row_of(instance)
    changed = {
        name: values for name, values in differences(row, {}).items() if values[0] is not None
    }
    await _write(sender, row, ChangeAction.DELETE, changed, using_db)


async def record_many(
    model: type[Model],
    rows: list[Row],
    action: ChangeAction,
    after: Row | None = None,
) -> None:
    """Records rows changed by a bulk statement. Each row is read before the statement runs."""
    if paused.get():
        return
    for row in rows:
        if action is ChangeAction.DELETE:
            changed = {
                name: values
                for name, values in differences(row, {}).items()
                if values[0] is not None
            }
        else:
            changed = differences(row, {**row, **(after or {})})
        if changed:
            await _write(model, row, action, changed, None)


async def recorded_update(query: QuerySet[Any], **values: Any) -> int:
    """Runs a bulk update and records an update change for each row it changes."""
    rows = await query.values()
    count = await query.update(**values)
    await record_many(query.model, rows, ChangeAction.UPDATE, values)
    return count


async def recorded_delete(query: QuerySet[Any]) -> None:
    """Runs a bulk delete and records a delete change for each row it deletes."""
    rows = await query.values()
    await query.delete()
    await record_many(query.model, rows, ChangeAction.DELETE)


async def record_import(project_id: str, counts: dict[str, int]) -> None:
    await Change.create(
        entity=Project._meta.db_table,
        entity_id=project_id,
        project_id=project_id,
        action=ChangeAction.IMPORT,
        changed_fields=counts,
        user_id=actor.get(),
    )


def register() -> None:
    for model in TRACKED:
        model.register_listener(Signals.pre_save, _pre_save)
        model.register_listener(Signals.post_save, _post_save)
        model.register_listener(Signals.post_delete, _post_delete)
