from __future__ import annotations

from tortoise import fields
from tortoise.models import Model

from setout.models.expense import Expense
from setout.models.project import Project
from setout.utils.ids import short_id


class Attachment(Model):
    """A file attached to an expense: an image or a PDF, such as a receipt."""

    id = fields.CharField(max_length=12, primary_key=True, default=short_id)
    project: fields.ForeignKeyRelation[Project] = fields.ForeignKeyField(
        "models.Project",
        related_name="attachments",
        on_delete=fields.CASCADE,
    )
    project_id: str
    expense: fields.ForeignKeyRelation[Expense] = fields.ForeignKeyField(
        "models.Expense",
        related_name="attachments",
        on_delete=fields.CASCADE,
    )
    expense_id: str
    filename = fields.CharField(max_length=255, description="The original filename")
    content_type = fields.CharField(max_length=127)
    byte_size = fields.IntField()
    checksum = fields.CharField(
        max_length=64,
        db_index=True,
        description="SHA-256 of the contents, also used as the stored filename",
    )
    storage_key = fields.CharField(max_length=255)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)
    archived_at = fields.DatetimeField(null=True, default=None)

    class Meta:
        table = "attachment"
        ordering = ["-created_at", "id"]

    def __str__(self) -> str:
        return self.filename
