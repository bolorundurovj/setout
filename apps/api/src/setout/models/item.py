from __future__ import annotations

from tortoise import fields
from tortoise.models import Model

from setout.utils.ids import short_id


class Item(Model):
    """Something bought more than once. Prices are read from the expenses."""

    id = fields.CharField(max_length=12, primary_key=True, default=short_id)
    name = fields.CharField(max_length=255)
    unit = fields.CharField(
        max_length=32,
        null=True,
        default=None,
        description="What the price is quoted in: bag, each, truck, sheet",
    )
    notes = fields.TextField(null=True, default=None)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)
    deleted_at = fields.DatetimeField(null=True, default=None)

    class Meta:
        table = "item"
        ordering = ["name", "id"]

    def __str__(self) -> str:
        return self.name
