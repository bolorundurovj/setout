from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, JsonValue

# Maps table name to rows. Rows are typed as JSON, not per table, because their
# shape depends on the schema at export time.
Rows = dict[str, list[dict[str, JsonValue]]]


class Install(BaseModel):
    version: str
    migration: str | None = Field(..., description="The last migration applied to the database")
    data_bytes: int = Field(..., description="Total size of the data directory, in bytes")
    data_changed_at: datetime | None = Field(
        ..., description="When a file in the data directory was last modified"
    )


class Backup(BaseModel):
    format: int = Field(
        ..., description="The backup format version. Incremented when the format changes"
    )
    app_version: str = Field(..., description="The Setout version that created the backup")
    migration: str | None = Field(
        ..., description="The last migration applied when the backup was created"
    )
    exported_at: datetime
    row_counts: dict[str, int] = Field(..., description="Row count per table")
    tables: Rows


class RestoreRequest(BaseModel):
    backup: Backup
    accept_version_change: bool = Field(
        False,
        description="Required when the backup was created by a different Setout version or schema",
    )


class RestoreResult(BaseModel):
    row_counts: dict[str, int] = Field(..., description="Rows written per table")
    signed_out: bool = Field(
        ..., description="Always true. Accounts are replaced from the backup, so all sessions end"
    )
