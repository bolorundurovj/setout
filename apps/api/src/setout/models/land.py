from __future__ import annotations

from enum import StrEnum

from tortoise import fields
from tortoise.models import Model

from setout.models.country import Country
from setout.models.currency import Currency
from setout.utils.ids import short_id


class LandSizeUnit(StrEnum):
    SQM = "sqm"
    HECTARE = "hectare"
    ACRE = "acre"
    PLOT = "plot"


class Land(Model):
    """A land record. Shared across every project built on it."""

    id = fields.CharField(max_length=12, primary_key=True, default=short_id)
    name = fields.CharField(
        max_length=255, description="Your name for the land record, such as Ikeja plot"
    )
    address = fields.TextField(null=True, default=None, description="Street address or description")
    geocoded_address = fields.TextField(
        null=True, default=None, description="The map address of the pin, from reverse geocoding"
    )
    city = fields.CharField(max_length=255, null=True, default=None)
    state = fields.CharField(max_length=255, null=True, default=None)
    country: fields.ForeignKeyNullableRelation[Country] = fields.ForeignKeyField(
        "models.Country",
        source_field="country_id",
        to_field="code",
        null=True,
        related_name="lands",
        on_delete=fields.RESTRICT,
    )
    country_id: str | None
    purchased_on = fields.DateField(null=True, default=None)
    # Set by the first valuation, so every valuation uses one currency.
    currency: fields.ForeignKeyNullableRelation[Currency] = fields.ForeignKeyField(
        "models.Currency",
        source_field="currency_id",
        to_field="code",
        null=True,
        related_name="lands",
        on_delete=fields.RESTRICT,
    )
    currency_id: str | None
    latitude = fields.DecimalField(max_digits=10, decimal_places=7, null=True, default=None)
    longitude = fields.DecimalField(max_digits=10, decimal_places=7, null=True, default=None)
    boundary = fields.TextField(
        null=True, default=None, description="GeoJSON Polygon of the boundary"
    )
    size_value = fields.DecimalField(max_digits=14, decimal_places=2, null=True, default=None)
    size_unit = fields.CharEnumField(LandSizeUnit, max_length=16, null=True, default=None)
    notes = fields.TextField(null=True, default=None)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)
    archived_at = fields.DatetimeField(null=True, default=None)

    class Meta:
        table = "land"
        ordering = ["name", "id"]

    def __str__(self) -> str:
        return self.name
