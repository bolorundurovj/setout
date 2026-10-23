from __future__ import annotations

from tortoise import fields
from tortoise.models import Model

from setout.models.category import Category
from setout.models.expense import CostType
from setout.utils.ids import short_id


class BudgetItem(Model):
    id = fields.CharField(max_length=12, primary_key=True, default=short_id)
    category: fields.ForeignKeyRelation[Category] = fields.ForeignKeyField(
        "models.Category",
        related_name="budget_items",
        on_delete=fields.CASCADE,
    )
    category_id: str
    description = fields.CharField(max_length=255)
    cost_type = fields.CharEnumField(
        CostType,
        max_length=16,
        null=True,
        default=None,
        description="Optional. Labour, material or fixed",
    )
    # Minor units of the project's currency. Never a float.
    budgeted_amount = fields.BigIntField()
    # When the budgeted amount was last set explicitly, unlike updated_at.
    set_at = fields.DatetimeField()
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)
    archived_at = fields.DatetimeField(null=True, default=None)

    class Meta:
        table = "budget_item"
        ordering = ["id"]

    def __str__(self) -> str:
        return self.description
