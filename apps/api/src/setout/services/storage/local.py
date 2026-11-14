from __future__ import annotations

import asyncio
import errno
import os
import secrets
import threading
from pathlib import Path

from setout.services.storage.base import Storage

_replacement_lock = threading.Lock()


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
        scratch, descriptor = _open_scratch(path.parent)
        try:
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(data)
        except BaseException:
            scratch.unlink(missing_ok=True)
            raise
        try:
            # Content-addressed keys are immutable; publish without replacing another writer.
            try:
                path.hardlink_to(scratch)
            except FileExistsError:
                pass
            except OSError as exc:
                if exc.errno not in {
                    errno.EACCES,
                    errno.EPERM,
                    errno.EOPNOTSUPP,
                    errno.ENOTSUP,
                    errno.EXDEV,
                    errno.EINVAL,
                }:
                    raise
                # Windows can reject concurrent replacement of the same destination.
                with _replacement_lock:
                    if not path.exists():
                        try:
                            os.replace(scratch, path)
                        except PermissionError:
                            if not path.is_file():
                                raise
        finally:
            scratch.unlink(missing_ok=True)

    def _path(self, key: str) -> Path:
        key_parts = key.replace("\\", "/").split("/")
        if (
            not key
            or key.startswith(("/", "\\"))
            or any(part in {"", ".", ".."} for part in key_parts)
        ):
            raise ValueError("Storage key is outside the storage root")
        path = (self.root / key).resolve()
        root = self.root.resolve()
        if not _normalised(path).is_relative_to(_normalised(root)):
            raise ValueError("Storage key is outside the storage root")
        return path


def _normalised(path: Path) -> Path:
    value = os.path.normcase(str(path))
    if value.startswith("\\\\?\\unc\\"):
        value = "\\\\" + value[8:]
    elif value.startswith("\\\\?\\"):
        value = value[4:]
    return Path(value)


def _open_scratch(directory: Path) -> tuple[Path, int]:
    flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, "O_BINARY", 0)
    for _ in range(100):
        scratch = directory / f".{secrets.token_hex(12)}.part"
        try:
            return scratch, os.open(scratch, flags, 0o666)
        except FileExistsError:
            continue
    raise FileExistsError("Could not create a temporary attachment file")
