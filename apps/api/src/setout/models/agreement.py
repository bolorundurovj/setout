from __future__ import annotations

from tortoise import fields
from tortoise.models import Model

from setout.models.project import Project
from setout.models.vendor import Vendor
from setout.utils.ids import short_id


class Agreement(Model):
    """What a vendor agreed to do for a fixed price on one project.

    Paid and balance are worked out from the expenses filed against it, so a
    part payment is recorded once and counted everywhere.
    """

    id = fields.CharField(max_length=12, primary_key=True, default=short_id)
    project: fields.ForeignKeyRelation[Project] = fields.ForeignKeyField(
        "models.Project",
        related_name="agreements",
        on_delete=fields.CASCADE,
    )
    project_id: str
    vendor: fields.ForeignKeyRelation[Vendor] = fields.ForeignKeyField(
        "models.Vendor",
        related_name="agreements",
        on_delete=fields.RESTRICT,
    )
    vendor_id: str
    description = fields.CharField(max_length=255)
    # Minor units of the project's currency.
    agreed_amount = fields.BigIntField()
    notes = fields.TextField(null=True, default=None)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)
    deleted_at = fields.DatetimeField(null=True, default=None)

    class Meta:
        table = "agreement"
        ordering = ["-created_at", "id"]

    def __str__(self) -> str:
        return self.description
