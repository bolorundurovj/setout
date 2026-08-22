from __future__ import annotations

from tortoise import fields
from tortoise.models import Model

from setout.models.person import Person
from setout.models.project import Project
from setout.utils.ids import short_id


class Advance(Model):
    """Money handed to someone before they spend it.

    Their balance is what they were given less what they have spent, so an
    advance and an expense they paid for cancel each other out.
    """

    id = fields.CharField(max_length=12, primary_key=True, default=short_id)
    person: fields.ForeignKeyRelation[Person] = fields.ForeignKeyField(
        "models.Person",
        related_name="advances",
        on_delete=fields.CASCADE,
    )
    person_id: str
    project: fields.ForeignKeyRelation[Project] = fields.ForeignKeyField(
        "models.Project",
        related_name="advances",
        on_delete=fields.CASCADE,
    )
    project_id: str
    given_on = fields.DateField()
    # Minor units of the project's currency.
    amount = fields.BigIntField()
    notes = fields.TextField(null=True, default=None)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)
    deleted_at = fields.DatetimeField(null=True, default=None)

    class Meta:
        table = "advance"
        ordering = ["-given_on", "-created_at"]

    def __str__(self) -> str:
        return f"{self.amount} to {self.person_id}"
