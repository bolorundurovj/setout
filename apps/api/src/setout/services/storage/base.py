from __future__ import annotations

import hashlib
from abc import ABC, abstractmethod
from pathlib import PurePosixPath


def checksum_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def key_for(checksum: str, filename: str) -> str:
    suffix = PurePosixPath(filename).suffix.lower()
    if len(suffix) > 12 or not suffix[1:].isalnum():
        suffix = ""
    return f"{checksum[:2]}/{checksum[2:4]}/{checksum}{suffix}"


class Storage(ABC):
    """Keys are content-addressed, so writing a key twice writes the same file."""

    @abstractmethod
    async def put(self, key: str, data: bytes, *, content_type: str) -> None: ...

    @abstractmethod
    async def get(self, key: str) -> bytes:
        """Raises FileNotFoundError when the key does not exist."""

    @abstractmethod
    async def delete(self, key: str) -> None: ...

    @abstractmethod
    async def exists(self, key: str) -> bool: ...

    async def url(self, key: str, *, filename: str, content_type: str) -> str | None:
        """Returns a URL the browser can fetch directly, or None to serve the file from the API."""
        return None
