from __future__ import annotations

from enum import StrEnum

from tortoise import fields
from tortoise.models import Model

from setout.models.land import Land
from setout.utils.ids import short_id


class LandDocumentKind(StrEnum):
    CERTIFICATE_OF_OCCUPANCY = "certificate_of_occupancy"
    SURVEY_PLAN = "survey_plan"
    DEED = "deed"
    ARCHITECTURAL_PLAN = "architectural_plan"
    RECEIPT = "receipt"
    OTHER = "other"


class LandDocument(Model):
    """A paper that says the land is yours, or says what may be built on it."""

    id = fields.CharField(max_length=12, primary_key=True, default=short_id)
    land: fields.ForeignKeyRelation[Land] = fields.ForeignKeyField(
        "models.Land",
        related_name="documents",
        on_delete=fields.CASCADE,
    )
    land_id: str
    kind = fields.CharEnumField(
        LandDocumentKind,
        max_length=32,
        default=LandDocumentKind.OTHER,
        description="What the paper is, so a land can say which ones it is missing",
    )
    filename = fields.CharField(max_length=255, description="What it was called where it came from")
    content_type = fields.CharField(max_length=127)
    byte_size = fields.IntField()
    checksum = fields.CharField(
        max_length=64, db_index=True, description="sha256 of the contents, and the stored name"
    )
    storage_key = fields.CharField(max_length=255)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)
    deleted_at = fields.DatetimeField(null=True, default=None)

    class Meta:
        table = "land_document"
        ordering = ["-created_at", "id"]

    def __str__(self) -> str:
        return self.filename
