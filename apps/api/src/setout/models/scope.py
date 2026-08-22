from __future__ import annotations

from tortoise import fields
from tortoise.models import Model

from setout.models.project import Project
from setout.utils.ids import short_id


class Scope(Model):
    id = fields.CharField(max_length=12, primary_key=True, default=short_id)
    project: fields.ForeignKeyRelation[Project] = fields.ForeignKeyField(
        "models.Project",
        related_name="scopes",
        on_delete=fields.CASCADE,
    )
    project_id: str
    code = fields.CharField(max_length=32, null=True, default=None)
    name = fields.CharField(max_length=255)
    parent: fields.ForeignKeyNullableRelation[Scope] = fields.ForeignKeyField(
        "models.Scope",
        related_name="children",
        null=True,
        default=None,
        on_delete=fields.CASCADE,
    )
    parent_id: str | None
    sort_order = fields.IntField(default=0)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)
    deleted_at = fields.DatetimeField(null=True, default=None)

    class Meta:
        table = "scope"
        ordering = ["sort_order", "id"]

    def __str__(self) -> str:
        return self.name
