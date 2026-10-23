from __future__ import annotations

from tortoise import fields
from tortoise.models import Model

from setout.models.expense import Expense
from setout.models.project import Project
from setout.utils.ids import short_id


class Delivery(Model):
    """An item that has been paid for and is outstanding until it is received.

    A delivery has no amount of its own: its amount is that of the expense that
    paid for it. Marking it received does not change the expense.
    """

    id = fields.CharField(max_length=12, primary_key=True, default=short_id)
    project: fields.ForeignKeyRelation[Project] = fields.ForeignKeyField(
        "models.Project",
        related_name="deliveries",
        on_delete=fields.CASCADE,
    )
    project_id: str
    expense: fields.OneToOneRelation[Expense] = fields.OneToOneField(
        "models.Expense",
        related_name="delivery",
        on_delete=fields.CASCADE,
    )
    expense_id: str
    description = fields.CharField(max_length=255)
    expected = fields.DateField(null=True, default=None)
    received_at = fields.DatetimeField(null=True, default=None)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)
    archived_at = fields.DatetimeField(null=True, default=None)

    class Meta:
        table = "delivery"
        ordering = ["-created_at", "id"]

    def __str__(self) -> str:
        return self.description
