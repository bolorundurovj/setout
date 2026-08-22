from __future__ import annotations

from enum import StrEnum

from tortoise import fields
from tortoise.models import Model

from setout.models.currency import Currency
from setout.utils.ids import short_id


class ProjectStatus(StrEnum):
    ACTIVE = "active"
    ON_HOLD = "on_hold"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class Project(Model):
    id = fields.CharField(max_length=12, primary_key=True, default=short_id)
    name = fields.CharField(max_length=255)
    currency: fields.ForeignKeyRelation[Currency] = fields.ForeignKeyField(
        "models.Currency",
        related_name="projects",
        on_delete=fields.RESTRICT,
    )
    currency_id: str
    status = fields.CharEnumField(ProjectStatus, max_length=16, default=ProjectStatus.ACTIVE)
    notes = fields.TextField(null=True, default=None)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)
    deleted_at = fields.DatetimeField(null=True, default=None)

    class Meta:
        table = "project"

    def __str__(self) -> str:
        return self.name
