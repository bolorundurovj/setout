from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, JsonValue

# A whole database export is a map of table name to rows. Rows are typed as JSON
# rather than per table, because the shape is whatever the schema was at export.
Rows = dict[str, list[dict[str, JsonValue]]]


class Install(BaseModel):
    version: str
    migration: str | None = Field(..., description="The last schema change applied to this record")
    record_bytes: int = Field(..., description="Everything under the data directory, added up")
    record_changed_at: datetime | None = Field(
        ..., description="When anything under the data directory was last written"
    )


class Backup(BaseModel):
    format: int = Field(..., description="The layout of this file. Bumped when it changes")
    app_version: str = Field(..., description="The Setout that wrote it")
    migration: str | None = Field(..., description="The schema the rows came out of")
    exported_at: datetime
    row_counts: dict[str, int] = Field(..., description="Rows per table, for reading at a glance")
    tables: Rows


class RestoreRequest(BaseModel):
    backup: Backup
    accept_version_change: bool = Field(
        False,
        description="Required when the file was written by a different Setout or schema",
    )


class RestoreResult(BaseModel):
    row_counts: dict[str, int] = Field(..., description="Rows written per table")
    signed_out: bool = Field(
        ..., description="Always true. The accounts came out of the file, so sessions cannot stand"
    )
