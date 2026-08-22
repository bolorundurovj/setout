from __future__ import annotations

from tortoise import fields
from tortoise.models import Model


class Currency(Model):
    code = fields.CharField(max_length=3, primary_key=True)
    name = fields.CharField(max_length=64)
    exponent = fields.SmallIntField(default=2)

    class Meta:
        table = "currency"
        ordering = ["code"]

    def __str__(self) -> str:
        return self.code
