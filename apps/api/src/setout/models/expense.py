from __future__ import annotations

from enum import StrEnum

from tortoise import fields
from tortoise.models import Model

from setout.models.agreement import Agreement
from setout.models.item import Item
from setout.models.person import Person
from setout.models.project import Project
from setout.models.scope import Scope
from setout.models.vendor import Vendor
from setout.utils.ids import short_id


class CostType(StrEnum):
    LABOUR = "labour"
    MATERIAL = "material"
    FIXED = "fixed"


class Expense(Model):
    id = fields.CharField(max_length=12, primary_key=True, default=short_id)
    project: fields.ForeignKeyRelation[Project] = fields.ForeignKeyField(
        "models.Project",
        related_name="expenses",
        on_delete=fields.CASCADE,
    )
    project_id: str
    scope: fields.ForeignKeyNullableRelation[Scope] = fields.ForeignKeyField(
        "models.Scope",
        related_name="expenses",
        null=True,
        default=None,
        on_delete=fields.SET_NULL,
    )
    scope_id: str | None
    item: fields.ForeignKeyNullableRelation[Item] = fields.ForeignKeyField(
        "models.Item",
        related_name="expenses",
        null=True,
        default=None,
        on_delete=fields.SET_NULL,
        description="What was bought. This is what the price history is built from",
    )
    item_id: str | None
    vendor: fields.ForeignKeyNullableRelation[Vendor] = fields.ForeignKeyField(
        "models.Vendor",
        related_name="expenses",
        null=True,
        default=None,
        on_delete=fields.SET_NULL,
        description="Who it was bought from",
    )
    vendor_id: str | None
    paid_by: fields.ForeignKeyNullableRelation[Person] = fields.ForeignKeyField(
        "models.Person",
        related_name="expenses_paid",
        null=True,
        default=None,
        on_delete=fields.SET_NULL,
        description="Who handed over the money. Null means you paid it yourself",
    )
    paid_by_id: str | None
    spent_on = fields.DateField()
    description = fields.CharField(max_length=255)
    quantity = fields.DecimalField(max_digits=12, decimal_places=3, null=True, default=None)
    unit_rate = fields.BigIntField(null=True, default=None)
    amount = fields.BigIntField()
    cost_type = fields.CharEnumField(
        CostType,
        max_length=16,
        null=True,
        default=None,
        description="Optional. Splits the project total three ways when it is set",
    )
    agreement: fields.ForeignKeyNullableRelation[Agreement] = fields.ForeignKeyField(
        "models.Agreement",
        related_name="expenses",
        null=True,
        default=None,
        on_delete=fields.SET_NULL,
        description="A part payment against what was agreed",
    )
    agreement_id: str | None
    notes = fields.TextField(null=True, default=None)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)
    deleted_at = fields.DatetimeField(null=True, default=None)

    class Meta:
        table = "expense"
        ordering = ["-spent_on", "-created_at"]

    def __str__(self) -> str:
        return self.description
