from __future__ import annotations

from tortoise import fields
from tortoise.models import Model

from setout.models.expense import CostType
from setout.models.scope import Scope
from setout.utils.ids import short_id


class BudgetItem(Model):
    id = fields.CharField(max_length=12, primary_key=True, default=short_id)
    scope: fields.ForeignKeyRelation[Scope] = fields.ForeignKeyField(
        "models.Scope",
        related_name="budget_items",
        on_delete=fields.CASCADE,
    )
    scope_id: str
    description = fields.CharField(max_length=255)
    cost_type = fields.CharEnumField(
        CostType,
        max_length=16,
        null=True,
        default=None,
        description="Optional. Which of labour, material or fixed the plan puts this under",
    )
    # Minor units of the project's currency. Never a float.
    planned_amount = fields.BigIntField()
    # When the number was last set on purpose, which is the whole point of
    # keeping the budget apart from the spend.
    set_at = fields.DatetimeField()
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)
    deleted_at = fields.DatetimeField(null=True, default=None)

    class Meta:
        table = "budget_item"
        ordering = ["id"]

    def __str__(self) -> str:
        return self.description
