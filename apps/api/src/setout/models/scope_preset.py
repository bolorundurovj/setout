from __future__ import annotations

from tortoise import fields
from tortoise.models import Model

from setout.utils.ids import short_id


class ScopePreset(Model):
    id = fields.CharField(max_length=12, primary_key=True, default=short_id)
    name = fields.CharField(max_length=255, unique=True)
    sort_order = fields.IntField(default=0)

    class Meta:
        table = "scope_preset"
        ordering = ["sort_order", "id"]

    def __str__(self) -> str:
        return self.name
