from __future__ import annotations

import asyncio
import tempfile
from contextlib import suppress
from pathlib import Path

from setout.services.storage.base import Storage


class LocalStorage(Storage):
    def __init__(self, root: Path) -> None:
        self.root = root

    async def put(self, key: str, data: bytes, *, content_type: str) -> None:
        await asyncio.to_thread(self._write, self._path(key), data)

    async def get(self, key: str) -> bytes:
        return await asyncio.to_thread(self._path(key).read_bytes)

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self._path(key).unlink, True)

    async def exists(self, key: str) -> bool:
        return await asyncio.to_thread(self._path(key).is_file)

    def _write(self, path: Path, data: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=path.parent, suffix=".part", delete=False) as stream:
            scratch = Path(stream.name)
            try:
                stream.write(data)
            except BaseException:
                stream.close()
                scratch.unlink(missing_ok=True)
                raise
        try:
            # Content-addressed keys are immutable; publish without replacing another writer.
            with suppress(FileExistsError):
                path.hardlink_to(scratch)
        finally:
            scratch.unlink(missing_ok=True)

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        root = self.root.resolve()
        if not path.is_relative_to(root):
            raise ValueError("Storage key is outside the storage root")
        return path
