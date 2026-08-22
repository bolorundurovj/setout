from __future__ import annotations

from tortoise import fields
from tortoise.models import Model

from setout.utils.ids import short_id


class Vendor(Model):
    """Someone you buy from. Shared across every project."""

    id = fields.CharField(max_length=12, primary_key=True, default=short_id)
    name = fields.CharField(max_length=255)
    trade = fields.CharField(
        max_length=255,
        null=True,
        default=None,
        description="What they sell or do: block supplier, bricklayer, consultant",
    )
    contact_name = fields.CharField(
        max_length=255,
        null=True,
        default=None,
        description="The person you ask for",
    )
    phone = fields.CharField(max_length=64, null=True, default=None)
    email = fields.CharField(max_length=254, null=True, default=None)
    notes = fields.TextField(null=True, default=None)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)
    deleted_at = fields.DatetimeField(null=True, default=None)

    class Meta:
        table = "vendor"
        ordering = ["name", "id"]

    def __str__(self) -> str:
        return self.name
