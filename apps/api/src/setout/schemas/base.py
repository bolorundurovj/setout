from __future__ import annotations

from typing import ClassVar, Self

from pydantic import BaseModel, ConfigDict, model_validator


class UpdateModel(BaseModel):
    """Base for PATCH bodies: every field is optional, but a required column cannot be cleared.

    NOT_NULL names the fields whose database column is NOT NULL. Leaving one out of the
    request is fine; sending it as null is a validation error rather than a database error.
    """

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    NOT_NULL: ClassVar[frozenset[str]] = frozenset()

    @model_validator(mode="after")
    def _required_fields_are_not_null(self) -> Self:
        cleared = sorted(
            name
            for name in self.NOT_NULL
            if name in self.model_fields_set and getattr(self, name) is None
        )
        if cleared:
            raise ValueError(f"{', '.join(cleared)} cannot be null")
        return self
