from __future__ import annotations

from collections.abc import AsyncIterator, Iterable
from contextlib import asynccontextmanager, suppress

from fastapi import HTTPException, UploadFile, status

from tortoise.transactions import in_transaction

from setout.config import get_settings
from setout.models.attachment import Attachment
from setout.models.land_document import LandDocument
from setout.services.storage import Storage, checksum_of, key_for
from setout.utils.file_types import ALLOWED, matches_signature


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
    if not matches_signature(media_type, data):
        raise HTTPException(status_code=422, detail="File contents do not match the declared type")
    return media_type


def sanitise_filename(filename: str) -> str:
    # Some browsers send the full client path.
    last = filename.replace("\\", "/").rsplit("/", 1)[-1].strip()
    return "".join(c for c in last if c.isalnum() or c in " ._-()")[:255].strip()


@asynccontextmanager
async def blob_transaction(key: str) -> AsyncIterator[None]:
    async with in_transaction() as db:
        if db.capabilities.dialect == "postgres":
            await db.execute_query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [key])
        else:
            # Obtain SQLite's database write lock before reading either reference table.
            await db.execute_query('UPDATE "attachment" SET storage_key = storage_key WHERE 0')
        yield


@asynccontextmanager
async def store(
    data: bytes, filename: str, media_type: str, storage: Storage, *, default_stem: str
) -> AsyncIterator[tuple[str, str, str]]:
    extension = ALLOWED[media_type]
    name = sanitise_filename(filename) or f"{default_stem}{extension}"
    checksum = checksum_of(data)
    key = key_for(checksum, name if "." in name else f"{name}{extension}")
    writing = False
    try:
        async with blob_transaction(key):
            # Insert the reference first. A failed insert never creates a blob.
            yield name, checksum, key
            if not await storage.exists(key):
                writing = True
                await storage.put(key, data, content_type=media_type)
    except BaseException:
        if writing:
            await delete_unreferenced([key], storage)
        raise


async def delete_unreferenced(keys: Iterable[str], storage: Storage | None) -> None:
    if storage is None:
        return
    for key in set(keys):
        async with blob_transaction(key):
            if await Attachment.filter(storage_key=key).exists():
                continue
            if await LandDocument.filter(storage_key=key).exists():
                continue
            with suppress(Exception):
                await storage.delete(key)
