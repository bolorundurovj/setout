"""Files on the disk Setout is running on, under SETOUT_DATA_DIR."""

from __future__ import annotations

import asyncio
from pathlib import Path

from setout.services.storage.base import Storage


class LocalStorage(Storage):
    """The default: files under the same directory as the database."""

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
        scratch = path.with_name(f"{path.name}.part")
        scratch.write_bytes(data)
        scratch.replace(path)

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        root = self.root.resolve()
        if not path.is_relative_to(root):
            raise ValueError("That key is not inside the store")
        return path
