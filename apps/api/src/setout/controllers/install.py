from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from fastapi import HTTPException, status
from tortoise.transactions import in_transaction

from setout import __version__
from setout.config import get_settings
from setout.schemas.install import Backup, Install, RestoreRequest, RestoreResult
from setout.utils.dump import FORMAT, TABLES, applied_migration, read_all, write_all


class InstallController:
    async def facts(self) -> Install:
        data_dir = get_settings().data_dir
        size, changed = self._weigh(data_dir)
        return Install(
            version=__version__,
            migration=await applied_migration(),
            record_bytes=size,
            record_changed_at=changed,
        )

    async def export(self) -> Backup:
        tables = await read_all()
        return Backup(
            format=FORMAT,
            app_version=__version__,
            migration=await applied_migration(),
            exported_at=datetime.now(UTC),
            row_counts={table: len(rows) for table, rows in tables.items()},
            tables=tables,
        )

    async def restore(self, req: RestoreRequest) -> RestoreResult:
        backup = req.backup
        if backup.format != FORMAT:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"That file is layout {backup.format}. This Setout reads layout {FORMAT}",
            )
        unknown = sorted(set(backup.tables) - set(TABLES))
        if unknown:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"That file holds tables this Setout does not know: {', '.join(unknown)}",
            )
        await self._same_shape_or_confirmed(backup, req.accept_version_change)

        try:
            async with in_transaction():
                written = await write_all(dict(backup.tables))
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    "The record was left as it was: those rows do not fit this schema. "
                    f"The database reported: {exc}"
                ),
            ) from exc

        return RestoreResult(row_counts=written, signed_out=True)

    async def _same_shape_or_confirmed(self, backup: Backup, accepted: bool) -> None:
        if accepted:
            return
        here = await applied_migration()
        if backup.app_version == __version__ and backup.migration == here:
            return
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"That copy was written by Setout {backup.app_version} on schema "
                f"{backup.migration or 'unknown'}. This server is {__version__} on "
                f"{here or 'unknown'}. Restoring may fail if the schema has changed"
            ),
        )

    def _weigh(self, data_dir: Path) -> tuple[int, datetime | None]:
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
