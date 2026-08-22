from __future__ import annotations

from tortoise import fields
from tortoise.models import Model

from setout.utils.ids import short_id


class Person(Model):
    """Someone who spends your money for you. Shared across every project."""

    id = fields.CharField(max_length=12, primary_key=True, default=short_id)
    name = fields.CharField(max_length=255)
    role = fields.CharField(
        max_length=255,
        null=True,
        default=None,
        description="How they relate to the build: family, site supervisor, foreman",
    )
    phone = fields.CharField(max_length=64, null=True, default=None)
    notes = fields.TextField(null=True, default=None)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)
    deleted_at = fields.DatetimeField(null=True, default=None)

    class Meta:
        table = "person"
        ordering = ["name", "id"]

    def __str__(self) -> str:
        return self.name
