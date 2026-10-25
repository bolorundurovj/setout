from __future__ import annotations

from enum import StrEnum
from typing import Any

from tortoise import fields
from tortoise.models import Model

from setout.models.user import User
from setout.utils.ids import short_id


class ChangeAction(StrEnum):
    CREATE = "create"
    UPDATE = "update"
    ARCHIVE = "archive"
    RESTORE = "restore"
    DELETE = "delete"
    IMPORT = "import"


class Change(Model):
    """One recorded create, update, archive, restore, delete or import of a row."""

    id = fields.CharField(max_length=12, primary_key=True, default=short_id)
    entity = fields.CharField(max_length=32, description="The table of the changed row")
    entity_id = fields.CharField(max_length=12)
    # Not a foreign key, so the change history remains after the project is deleted.
    project_id = fields.CharField(max_length=12, null=True, default=None, db_index=True)
    action = fields.CharEnumField(ChangeAction, max_length=16)
    changed_fields: fields.JSONField[dict[str, Any]] = fields.JSONField(
        description="Each changed field as [before, after], or row counts for an import"
    )
    user: fields.ForeignKeyNullableRelation[User] = fields.ForeignKeyField(
        "models.User",
        related_name="changes",
        null=True,
        default=None,
        on_delete=fields.SET_NULL,
        description="Null when Setout made the change, such as during an import",
    )
    user_id: str | None
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "change"
        ordering = ["-created_at", "id"]
        indexes = (("entity", "entity_id"),)
