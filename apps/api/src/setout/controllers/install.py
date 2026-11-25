from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path

from fastapi import HTTPException, status
from tortoise.transactions import in_transaction

from setout import __version__
from setout.config import get_settings
from setout.schemas.install import Backup, Install, RestoreRequest, RestoreResult
from setout.services import changes
from setout.utils.backup import (
    FORMAT,
    TABLES,
    BackupError,
    Rows,
    applied_migration,
    export_pages,
    forward,
    forward_counts,
    required_tables,
    write_all,
)

logger = logging.getLogger(__name__)

# One restore at a time: a second one would delete rows the first is writing.
_restoring = asyncio.Lock()


class InstallController:
    async def info(self) -> Install:
        data_dir = get_settings().data_dir
        size, changed = await asyncio.to_thread(self._data_dir_usage, data_dir)
        return Install(
            version=__version__,
            migration=await applied_migration(),
            data_bytes=size,
            data_changed_at=changed,
        )

    async def export(self) -> AsyncIterator[str]:
        metadata = {
            "format": FORMAT,
            "app_version": __version__,
            "migration": await applied_migration(),
            "exported_at": datetime.now(UTC).isoformat(),
        }
        yield json.dumps(metadata)[:-1] + ',"tables":{'
        counts: dict[str, int] = {}
        async with in_transaction() as conn:
            if conn.capabilities.dialect == "postgres":
                await conn.execute_query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
            for table in TABLES:
                yield ("," if counts else "") + json.dumps(table) + ":["
                counts[table] = 0
                async for page in export_pages(conn, table):
                    yield ("," if counts[table] else "") + json.dumps(page)[1:-1]
                    counts[table] += len(page)
                yield "]"
        yield '},"row_counts":' + json.dumps(counts) + "}"

    async def restore(self, req: RestoreRequest) -> RestoreResult:
        if _restoring.locked():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Another restore is already running. Try again when it finishes",
            )
        async with _restoring:
            return await self._restore(req)

    async def _restore(self, req: RestoreRequest) -> RestoreResult:
        backup = req.backup
        if backup.format > FORMAT:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    f"The backup uses format {backup.format}. "
                    f"This version of Setout reads backup formats up to {FORMAT}"
                ),
            )
        tables = forward(dict(backup.tables), backup.format)
        unknown = sorted(set(tables) - set(TABLES))
        if unknown:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"The backup has tables Setout does not recognise: {', '.join(unknown)}",
            )
        self._require_complete(backup, tables)
        await self._require_matching_version(backup, req.accept_version_change)

        try:
            async with in_transaction():
                with changes.recording_paused():
                    written = await write_all(tables)
        except BackupError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Your data was not changed: {exc}",
            ) from exc
        except Exception as exc:
            logger.exception("A restore failed and was rolled back")
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Your data was not changed: the rows do not match this schema",
            ) from exc

        return RestoreResult(row_counts=written, signed_out=True)

    def _require_complete(self, backup: Backup, tables: Rows) -> None:
        """Refuse a backup that is missing tables or rows before anything is deleted."""
        missing = sorted(required_tables(backup.migration) - set(tables))
        if missing:
            noun = "table" if len(missing) == 1 else "tables"
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    f"Your data was not changed: the backup is missing the "
                    f"{', '.join(missing)} {noun}"
                ),
            )
        counts = forward_counts(dict(backup.row_counts), backup.format)
        wrong = [
            f"{table} lists {counts.get(table, 0)} rows but contains {len(rows)}"
            for table, rows in sorted(tables.items())
            if counts.get(table, 0) != len(rows)
        ]
        if wrong:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Your data was not changed: the backup is incomplete ({'; '.join(wrong)})",
            )
        if len(tables.get("user") or []) != 1:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Your data was not changed: a backup must contain exactly one account",
            )

    async def _require_matching_version(self, backup: Backup, accepted: bool) -> None:
        if accepted:
            return
        current_migration = await applied_migration()
        if backup.app_version == __version__ and backup.migration == current_migration:
            return
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"This backup was created by Setout {backup.app_version} on schema "
                f"{backup.migration or 'unknown'}. This server runs {__version__} on schema "
                f"{current_migration or 'unknown'}. The restore may fail if the schema has changed"
            ),
        )

    def _data_dir_usage(self, data_dir: Path) -> tuple[int, datetime | None]:
        if not data_dir.is_dir():
            return 0, None
        size = 0
        latest: float | None = None
        for path in data_dir.rglob("*"):
            if not path.is_file():
                continue
            stat = path.stat()
            size += stat.st_size
            latest = stat.st_mtime if latest is None else max(latest, stat.st_mtime)
        changed = datetime.fromtimestamp(latest, UTC) if latest is not None else None
        return size, changed
