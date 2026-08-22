from __future__ import annotations

from tortoise import fields
from tortoise.models import Model

from setout.models.expense import Expense
from setout.models.project import Project
from setout.utils.ids import short_id


class Delivery(Model):
    """Something paid for that has not arrived.

    The money is already spent and already counted, so a delivery carries no
    amount of its own: it hangs off the expense that paid for it and reads the
    figure from there. Marking it received leaves the expense untouched.
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
    promised = fields.CharField(max_length=255, null=True, default=None)
    received_at = fields.DatetimeField(null=True, default=None)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)
    deleted_at = fields.DatetimeField(null=True, default=None)

    class Meta:
        table = "delivery"
        ordering = ["-created_at", "id"]

    def __str__(self) -> str:
        return self.description
