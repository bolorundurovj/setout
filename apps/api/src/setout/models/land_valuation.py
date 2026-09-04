from __future__ import annotations

from enum import StrEnum

from tortoise import fields
from tortoise.models import Model

from setout.models.currency import Currency
from setout.models.land import Land
from setout.utils.ids import short_id


class LandValuationKind(StrEnum):
    PURCHASE = "purchase"
    VALUATION = "valuation"


class LandValuation(Model):
    """What the plot was worth, and when. The purchase is the first of them."""

    id = fields.CharField(max_length=12, primary_key=True, default=short_id)
    land: fields.ForeignKeyRelation[Land] = fields.ForeignKeyField(
        "models.Land",
        related_name="valuations",
        on_delete=fields.CASCADE,
    )
    land_id: str
    kind = fields.CharEnumField(
        LandValuationKind,
        max_length=16,
        default=LandValuationKind.VALUATION,
        description="Whether this is what it was bought for, or what it is worth now",
    )
    # Minor units of the land's currency. Never a float.
    amount = fields.BigIntField()
    currency: fields.ForeignKeyRelation[Currency] = fields.ForeignKeyField(
        "models.Currency",
        source_field="currency_id",
        to_field="code",
        related_name="land_valuations",
        on_delete=fields.RESTRICT,
    )
    currency_id: str
    valued_on = fields.DateField()
    note = fields.CharField(
        max_length=255, null=True, default=None, description="Who valued it, or why"
    )
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)
    deleted_at = fields.DatetimeField(null=True, default=None)

    class Meta:
        table = "land_valuation"
        ordering = ["-valued_on", "id"]

    def __str__(self) -> str:
        return f"{self.currency_id} {self.amount}"
