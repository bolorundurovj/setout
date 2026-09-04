from __future__ import annotations

from tortoise import fields
from tortoise.models import Model


class Country(Model):
    code = fields.CharField(max_length=2, primary_key=True)
    name = fields.CharField(max_length=128)

    class Meta:
        table = "country"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class State(Model):
    """A state, province or region. What a plot's address calls the state."""

    code = fields.CharField(max_length=6, primary_key=True)
    country: fields.ForeignKeyRelation[Country] = fields.ForeignKeyField(
        "models.Country",
        source_field="country_id",
        to_field="code",
        related_name="states",
        on_delete=fields.CASCADE,
    )
    country_id: str
    name = fields.CharField(max_length=128)

    class Meta:
        table = "state"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name
