from __future__ import annotations

from collections.abc import Iterable
from contextlib import suppress

from fastapi import HTTPException, UploadFile, status

from setout.config import get_settings
from setout.models.attachment import Attachment
from setout.models.land_document import LandDocument
from setout.services.storage import Storage, checksum_of, key_for

ALLOWED: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "application/pdf": ".pdf",
}


async def read_capped(file: UploadFile, cap: int) -> bytes:
    data = await file.read(cap + 1)
    if len(data) > cap:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"That file is larger than the {cap // 1_000_000} MB limit",
        )
    return data


def checked_media_type(content_type: str, data: bytes, *, subject: str) -> str:
    media_type = content_type.split(";")[0].strip().lower()
    if media_type not in ALLOWED:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"{subject} must be an image or a PDF",
        )
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That file is empty")
    max_bytes = get_settings().max_attachment_bytes
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"That file is larger than the {max_bytes // 1_000_000} MB limit",
        )
    return media_type


def sanitise_filename(filename: str) -> str:
    # Some browsers send the full client path.
    last = filename.replace("\\", "/").rsplit("/", 1)[-1].strip()
    return "".join(c for c in last if c.isalnum() or c in " ._-()")[:255].strip()


async def store(
    data: bytes, filename: str, media_type: str, storage: Storage, *, default_stem: str
) -> tuple[str, str, str]:
    """Returns the stored filename, the checksum and the storage key."""
    extension = ALLOWED[media_type]
    name = sanitise_filename(filename) or f"{default_stem}{extension}"
    checksum = checksum_of(data)
    key = key_for(checksum, name if "." in name else f"{name}{extension}")
    if not await storage.exists(key):
        await storage.put(key, data, content_type=media_type)
    return name, checksum, key


async def delete_unreferenced(keys: Iterable[str], storage: Storage | None) -> None:
    """Deletes each stored file that no attachment or land document references."""
    if storage is None:
        return
    for key in set(keys):
        if await Attachment.filter(storage_key=key).exists():
            continue
        if await LandDocument.filter(storage_key=key).exists():
            continue
        with suppress(Exception):
            await storage.delete(key)
