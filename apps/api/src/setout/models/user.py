from __future__ import annotations

from tortoise import fields
from tortoise.models import Model

from setout.utils.ids import short_id


class User(Model):
    id = fields.CharField(max_length=12, primary_key=True, default=short_id)
    name = fields.CharField(max_length=255, unique=True)
    email = fields.CharField(max_length=255, null=True, default=None)
    password_hash = fields.CharField(max_length=255)
    base_currency = fields.CharField(
        max_length=3,
        null=True,
        default=None,
        description="Which currency the home screen opens on",
    )
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "user"

    def __str__(self) -> str:
        return self.name


class Session(Model):
    id = fields.CharField(max_length=64, primary_key=True)
    user: fields.ForeignKeyRelation[User] = fields.ForeignKeyField(
        "models.User", related_name="sessions", on_delete=fields.CASCADE
    )
    expires_at = fields.DatetimeField()
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "session"
